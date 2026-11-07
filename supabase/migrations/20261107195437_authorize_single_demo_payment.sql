-- One explicitly provisioned demo order. No public role may create or change
-- this scope. The approved wallets and exact amount are fixed in the database.
create table app_private.demo_payment_authorizations (
  singleton boolean not null default true unique check (singleton),
  company_id uuid not null references public.companies(id),
  order_id uuid not null,
  actor_id uuid not null references auth.users(id),
  sender text not null check (sender = '0xd87f54a9bae54e4ee15a141d526532777f3d2c56'),
  destination text not null check (destination = '0x4e5f932fa2d1be48a4fc39a80cd2ec85c8aa5bb1'),
  active boolean not null default true,
  primary key (company_id, order_id),
  unique (order_id)
);
revoke all on app_private.demo_payment_authorizations from public, anon, authenticated, service_role;

-- The marker changes the locked order row in the claim transaction. This also
-- forces old REPEATABLE READ snapshots to fail on a concurrent refresh.
alter table public.purchase_orders add column demo_payment_claimed boolean not null default false;

-- Only demo orders are affected. Ordinary order transitions remain unchanged.
create function app_private.protect_claimed_payment_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.demo_payment_claimed then
    raise exception 'CONFLICT: an order with a demo payment reservation is immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.protect_claimed_payment_order() from public, anon, authenticated, service_role;
create trigger protect_claimed_payment_order before update or delete on public.purchase_orders
for each row execute function app_private.protect_claimed_payment_order();

create function public.demo_order_authorized(p_company uuid, p_actor uuid, p_order uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_actor is null or p_order is null then return false; end if;
  return exists(select 1 from app_private.demo_payment_authorizations s
    join public.company_members m on m.company_id=s.company_id and m.user_id=p_actor and m.role='admin'
    where s.company_id=p_company and s.order_id=p_order and s.actor_id=p_actor and s.active);
end $$;
revoke all on function public.demo_order_authorized(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.demo_order_authorized(uuid,uuid,uuid) to service_role;

-- This separate operation does not change the ordinary claim or approve an
-- example as a real purchase. The successful claim records the human demo
-- approval in its immutable snapshot and uses the existing global nonce pool.
create function public.claim_demo_order_payment(p_company uuid, p_actor uuid, p_order uuid, p_action text,
  p_version integer, p_sender text, p_pending_nonce bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sender text := lower(p_sender);
  v_scope app_private.demo_payment_authorizations;
  v_order public.purchase_orders; v_context jsonb; v_policy jsonb; v_quote jsonb;
  v_res app_private.payment_reservations; v_action_res uuid; v_nonce bigint;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_actor is null or p_order is null or p_action is null or length(trim(p_action)) = 0 or length(p_action) > 120
    or p_version is null or p_version < 1 or p_pending_nonce is null or p_pending_nonce < 0 or p_pending_nonce > 9007199254740991
    or v_sender is distinct from '0xd87f54a9bae54e4ee15a141d526532777f3d2c56' then raise exception 'VALIDATION_ERROR: invalid demo claim'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-wallet:42161:' || v_sender,0));
  perform 1 from public.company_members where company_id=p_company and user_id=p_actor and role='admin' for share;
  if not found then raise exception 'FORBIDDEN: admin membership required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-claim-action:' || p_company::text || ':' || p_action,0));
  select * into v_order from public.purchase_orders where company_id=p_company and id=p_order for update;
  if not found then raise exception 'NOT_FOUND: order'; end if;
  select * into v_scope from app_private.demo_payment_authorizations where company_id=p_company and order_id=p_order for update;
  if not found or not v_scope.active or v_scope.actor_id is distinct from p_actor or v_scope.sender is distinct from v_sender then
    raise exception 'FORBIDDEN: demo not authorized';
  end if;
  select reservation_id into v_action_res from app_private.payment_claim_actions where company_id=p_company and action_id=p_action;
  select * into v_res from app_private.payment_reservations where company_id=p_company and order_id=p_order;
  if found then
    if v_res.approval_snapshot->>'demo' is distinct from 'true' or v_res.chain_id <> 42161 or v_res.sender <> v_sender
      or v_res.destination <> v_scope.destination or v_res.amount_atomic <> '1000000000000000000'
      or (v_action_res is not null and v_action_res <> v_res.id) then raise exception 'CONFLICT: incompatible demo reservation'; end if;
    insert into app_private.payment_claim_actions(company_id,action_id,reservation_id) values(p_company,p_action,v_res.id) on conflict do nothing;
    return jsonb_build_object('id',v_res.id,'state',v_res.state,'nonce',v_res.nonce,'action_id',v_res.action_id,'amount_atomic',v_res.amount_atomic,'destination',v_res.destination);
  end if;
  if v_action_res is not null then raise exception 'CONFLICT: action already used'; end if;
  if v_order.status <> 'awaiting_approval' or v_order.version <> p_version or v_order.quote_source <> 'example'
    or v_order.pricing_status <> 'ready' or v_order.amount_atomic <> 1000000000000000000
    or v_order.wallet_chain is distinct from 'arbitrum' or lower(v_order.wallet_address) is distinct from v_scope.destination
    or v_order.wallet_version < 1 then raise exception 'FORBIDDEN: invalid demo order'; end if;
  v_context := app_private.purchase_order_context(p_company,v_order.supplier_quote_id);
  if v_order.quote_snapshot is distinct from v_context->'quote' or v_order.request_snapshot is distinct from v_context->'request'
    or v_order.supplier_snapshot is distinct from v_context->'supplier' or v_order.policy_snapshot is distinct from nullif(v_context->'policy','null'::jsonb) then
    raise exception 'CONFLICT: demo conditions changed';
  end if;
  v_quote := v_context->'quote'; v_policy := nullif(v_context->'policy','null'::jsonb);
  if v_quote->>'source' is distinct from 'example' or v_quote->>'accepts_argt' is distinct from 'yes'
    or v_quote->>'can_supply' not in ('yes','partial') or (v_quote->>'can_supply' = 'partial' and v_quote->>'available_quantity' is null)
    or (v_quote->>'available_quantity' is not null and (v_quote->>'available_quantity')::numeric < v_order.quantity)
    or (v_quote->>'minimum_order_quantity' is not null and (v_quote->>'minimum_order_quantity')::numeric > v_order.quantity)
    or v_policy is null or v_order.amount_atomic > (v_policy->>'max_per_purchase_atomic')::numeric
    or v_order.amount_atomic > (v_context#>>'{request,budget_atomic}')::numeric
    or ((v_policy->>'only_allowed_suppliers')::boolean and not (v_policy->'allowed_supplier_ids' ? v_order.supplier_contact_id::text)) then
    raise exception 'FORBIDDEN: demo conditions do not permit payment';
  end if;
  select greatest(p_pending_nonce,coalesce(max(nonce)+1,p_pending_nonce)) into v_nonce from app_private.payment_reservations where chain_id=42161 and sender=v_sender;
  if v_nonce > 9007199254740991 then raise exception 'CONFLICT: nonce exceeds safe integer'; end if;
  update public.purchase_orders set demo_payment_claimed=true where company_id=p_company and id=p_order;
  insert into app_private.payment_reservations(company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,order_version,supplier_contact_id,wallet_version,approval_snapshot)
  values(p_company,p_order,p_action,42161,v_sender,v_nonce,'0x59863989d080b22476db95656d0c3cc18be92214',v_scope.destination,'1000000000000000000',v_order.version,v_order.supplier_contact_id,v_order.wallet_version,
    jsonb_build_object('demo',true,'approved_by',p_actor,'approved_at',clock_timestamp(),'quote',v_order.quote_snapshot,'request',v_order.request_snapshot,'supplier',v_order.supplier_snapshot,'policy',v_order.policy_snapshot)) returning * into v_res;
  insert into app_private.payment_claim_actions(company_id,action_id,reservation_id) values(p_company,p_action,v_res.id);
  return jsonb_build_object('id',v_res.id,'state',v_res.state,'nonce',v_res.nonce,'action_id',v_res.action_id,'amount_atomic',v_res.amount_atomic,'destination',v_res.destination);
end $$;
revoke all on function public.claim_demo_order_payment(uuid,uuid,uuid,text,integer,text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.claim_demo_order_payment(uuid,uuid,uuid,text,integer,text,bigint) to service_role;
