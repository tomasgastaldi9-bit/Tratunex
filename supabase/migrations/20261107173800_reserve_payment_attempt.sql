-- Internal foundation only. The caller must authenticate, validate policy and
-- obtain the immutable order data before using this service-role-only RPC.
create table app_private.payment_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  order_id uuid not null,
  action_id text not null,
  chain_id integer not null,
  sender text not null,
  nonce bigint not null,
  token text not null,
  destination text not null,
  amount_atomic text not null,
  state text not null default 'reserved' check (state = 'reserved'),
  created_at timestamptz not null default now(),
  unique (company_id, order_id),
  unique (company_id, action_id),
  unique (chain_id, sender, nonce)
);
revoke all on app_private.payment_reservations from public, anon, authenticated, service_role;

create function public.reserve_payment_attempt(p_company uuid, p_order uuid, p_action text, p_chain integer, p_sender text, p_nonce bigint, p_token text, p_destination text, p_amount text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row app_private.payment_reservations; v_sender text := lower(p_sender); v_token text := lower(p_token); v_destination text := lower(p_destination);
begin
  if pg_catalog.current_setting('role', true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_order is null or p_action is null or length(trim(p_action)) = 0 or length(p_action) > 120 or
     p_chain is distinct from 42161 or p_nonce is null or p_nonce < 0 or
     v_sender is null or v_sender !~ '^0x[0-9a-f]{40}$' or v_sender = '0x0000000000000000000000000000000000000000' or
     v_destination is null or v_destination !~ '^0x[0-9a-f]{40}$' or v_destination = '0x0000000000000000000000000000000000000000' or v_sender = v_destination or
     v_token is distinct from '0x59863989d080b22476db95656d0c3cc18be92214' or
     p_amount is null or p_amount !~ '^[1-9][0-9]{0,77}$' or
     p_amount::numeric >= 115792089237316195423570985008687907853269984665640564039457584007913129639936::numeric then
    raise exception 'VALIDATION_ERROR: invalid payment reservation';
  end if;
  if not exists(select 1 from public.companies where id = p_company) then raise exception 'NOT_FOUND: company'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-order:' || p_company::text || ':' || p_order::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-action:' || p_company::text || ':' || p_action, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pay-nonce:' || p_chain::text || ':' || v_sender || ':' || p_nonce::text, 0));
  select * into v_row from app_private.payment_reservations where company_id = p_company and order_id = p_order;
  if found then
    if v_row.action_id is distinct from p_action or v_row.chain_id is distinct from p_chain or v_row.sender is distinct from v_sender or
       v_row.nonce is distinct from p_nonce or v_row.token is distinct from v_token or v_row.destination is distinct from v_destination or v_row.amount_atomic is distinct from p_amount then
      raise exception 'CONFLICT: order already reserved with different input';
    end if;
    return jsonb_build_object('id',v_row.id,'state',v_row.state);
  end if;
  if exists(select 1 from app_private.payment_reservations where chain_id = p_chain and sender = v_sender and nonce = p_nonce) then
    raise exception 'CONFLICT: wallet nonce already reserved';
  end if;
  if exists(select 1 from app_private.payment_reservations where company_id = p_company and action_id = p_action) then
    raise exception 'CONFLICT: action already reserved';
  end if;
  insert into app_private.payment_reservations(company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic)
    values(p_company,p_order,p_action,p_chain,v_sender,p_nonce,v_token,v_destination,p_amount) returning * into v_row;
  return jsonb_build_object('id',v_row.id,'state',v_row.state);
end; $$;
revoke all on function public.reserve_payment_attempt(uuid,uuid,text,integer,text,bigint,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_payment_attempt(uuid,uuid,text,integer,text,bigint,text,text,text) to service_role;
