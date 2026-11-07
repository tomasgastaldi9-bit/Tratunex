-- Draft PAY-02 claim. Server-only; not connected to a signer or public endpoint.
alter table app_private.payment_reservations
  add column order_version integer,
  add column supplier_contact_id uuid,
  add column wallet_version integer,
  add column approval_snapshot jsonb;

create table app_private.payment_claim_actions (
  company_id uuid not null,
  action_id text not null,
  reservation_id uuid not null references app_private.payment_reservations(id),
  primary key(company_id, action_id)
);
revoke all on app_private.payment_claim_actions from public, anon, authenticated, service_role;

-- The service authenticates the user before calling. Database verifies membership
-- before both first claim and replay. Caller never supplies amount or destination.
create function public.claim_order_payment(p_company uuid, p_actor uuid, p_order uuid, p_action text,
  p_version integer, p_chain integer, p_sender text, p_token text, p_pending_nonce bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sender text := lower(p_sender); v_token text := lower(p_token);
  v_order public.purchase_orders; v_context jsonb; v_policy jsonb; v_quote jsonb;
  v_res app_private.payment_reservations; v_action_res uuid; v_nonce bigint;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_actor is null or p_order is null or p_action is null or length(trim(p_action)) = 0 or length(p_action) > 120
    or p_version is null or p_version < 1 or p_chain is distinct from 42161 or p_pending_nonce is null or p_pending_nonce < 0 or p_pending_nonce > 9007199254740991
    or v_sender is null or v_sender !~ '^0x[0-9a-f]{40}$' or v_sender = '0x0000000000000000000000000000000000000000'
    or v_token is distinct from '0x59863989d080b22476db95656d0c3cc18be92214' then
    raise exception 'VALIDATION_ERROR: invalid claim';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-wallet:' || p_chain::text || ':' || v_sender,0));
  perform 1 from public.company_members where company_id = p_company and user_id = p_actor and role = 'admin' for share;
  if not found then raise exception 'FORBIDDEN: admin membership required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-claim-action:' || p_company::text || ':' || p_action,0));
  select reservation_id into v_action_res from app_private.payment_claim_actions where company_id = p_company and action_id = p_action;
  select * into v_order from public.purchase_orders where company_id = p_company and id = p_order for update;
  if not found then raise exception 'NOT_FOUND: order'; end if;
  select * into v_res from app_private.payment_reservations where company_id = p_company and order_id = p_order;
  if found then
    if v_res.order_version is null or v_res.chain_id <> p_chain or v_res.sender <> v_sender or v_res.token <> v_token or (v_action_res is not null and v_action_res <> v_res.id) then
      raise exception 'CONFLICT: incompatible reservation';
    end if;
    insert into app_private.payment_claim_actions(company_id,action_id,reservation_id) values (p_company,p_action,v_res.id) on conflict do nothing;
    return jsonb_build_object('id',v_res.id,'state',v_res.state,'nonce',v_res.nonce,'action_id',v_res.action_id,'amount_atomic',v_res.amount_atomic,'destination',v_res.destination);
  end if;
  if v_action_res is not null then raise exception 'CONFLICT: action already used'; end if;
  if v_order.status <> 'approved' or v_order.version <> p_version or v_order.approved_by is null or v_order.approved_at is null then raise exception 'CONFLICT: order approval changed'; end if;
  v_context := app_private.purchase_order_context(p_company,v_order.supplier_quote_id);
  if v_order.quote_snapshot is distinct from v_context->'quote' or v_order.request_snapshot is distinct from v_context->'request'
    or v_order.supplier_snapshot is distinct from v_context->'supplier' or v_order.policy_snapshot is distinct from nullif(v_context->'policy','null'::jsonb) then
    raise exception 'CONFLICT: approved conditions changed';
  end if;
  v_quote := v_context->'quote'; v_policy := nullif(v_context->'policy','null'::jsonb);
  if v_order.pricing_status <> 'ready' or v_order.amount_atomic is null or v_order.wallet_chain is distinct from 'arbitrum'
    or v_order.wallet_address is null or lower(v_order.wallet_address) = v_sender or v_order.wallet_version < 1
    or v_quote->>'source' = 'example' or v_quote->>'accepts_argt' is distinct from 'yes'
    or v_quote->>'can_supply' not in ('yes','partial') or (v_quote->>'can_supply' = 'partial' and v_quote->>'available_quantity' is null)
    or (v_quote->>'available_quantity' is not null and (v_quote->>'available_quantity')::numeric < v_order.quantity)
    or (v_quote->>'minimum_order_quantity' is not null and (v_quote->>'minimum_order_quantity')::numeric > v_order.quantity)
    or v_policy is null or v_order.amount_atomic > (v_policy->>'max_per_purchase_atomic')::numeric
    or v_order.amount_atomic > (v_context#>>'{request,budget_atomic}')::numeric
    or ((v_policy->>'only_allowed_suppliers')::boolean and not (v_policy->'allowed_supplier_ids' ? v_order.supplier_contact_id::text)) then
    raise exception 'FORBIDDEN: order conditions do not permit payment';
  end if;
  select greatest(p_pending_nonce,coalesce(max(nonce)+1,p_pending_nonce)) into v_nonce from app_private.payment_reservations where chain_id=p_chain and sender=v_sender;
  if v_nonce > 9007199254740991 then raise exception 'CONFLICT: nonce exceeds safe integer'; end if;
  insert into app_private.payment_reservations(company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,order_version,supplier_contact_id,wallet_version,approval_snapshot)
  values(p_company,p_order,p_action,p_chain,v_sender,v_nonce,v_token,lower(v_order.wallet_address),v_order.amount_atomic::text,v_order.version,v_order.supplier_contact_id,v_order.wallet_version,
    jsonb_build_object('approved_by',v_order.approved_by,'approved_at',v_order.approved_at,'quote',v_order.quote_snapshot,'request',v_order.request_snapshot,'supplier',v_order.supplier_snapshot,'policy',v_order.policy_snapshot)) returning * into v_res;
  insert into app_private.payment_claim_actions(company_id,action_id,reservation_id) values(p_company,p_action,v_res.id);
  return jsonb_build_object('id',v_res.id,'state',v_res.state,'nonce',v_res.nonce,'action_id',v_res.action_id,'amount_atomic',v_res.amount_atomic,'destination',v_res.destination);
end $$;
revoke all on function public.claim_order_payment(uuid,uuid,uuid,text,integer,integer,text,text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.claim_order_payment(uuid,uuid,uuid,text,integer,integer,text,text,bigint) to service_role;
