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
  state text not null default 'reserved' check (state in ('reserved','prepared')),
  tx_hash text,
  signed_envelope jsonb,
  created_at timestamptz not null default now(),
  check ((state = 'reserved' and tx_hash is null and signed_envelope is null) or (state = 'prepared' and tx_hash is not null and signed_envelope is not null)),
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

-- Only the verified server adapter may call these RPCs. PostgreSQL cannot
-- verify the Ethereum signature or the encryption; the adapter must verify
-- transaction fields, hash and envelope before storage and before any send.
create function public.store_prepared_payment(p_company uuid,p_order uuid,p_action text,p_reservation_id uuid,p_hash text,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row app_private.payment_reservations; v_hash text := lower(p_hash);
begin
  if pg_catalog.current_setting('role', true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_order is null or p_action is null or p_reservation_id is null or v_hash is null or v_hash !~ '^0x[0-9a-f]{64}$' or
     p_envelope is null or jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text) > 180500 or
     p_envelope -> 'version' is distinct from '1'::jsonb or
     jsonb_typeof(p_envelope -> 'iv') is distinct from 'string' or jsonb_typeof(p_envelope -> 'tag') is distinct from 'string' or jsonb_typeof(p_envelope -> 'ciphertext') is distinct from 'string' or
     (select count(*) from jsonb_object_keys(p_envelope)) <> 4 then
    raise exception 'VALIDATION_ERROR: invalid encrypted payment envelope';
  end if;
  select * into v_row from app_private.payment_reservations where company_id = p_company and order_id = p_order for update;
  if not found or v_row.action_id is distinct from p_action or v_row.id is distinct from p_reservation_id then raise exception 'NOT_FOUND: payment reservation'; end if;
  if v_row.state = 'prepared' then
    if v_row.tx_hash is distinct from v_hash or v_row.signed_envelope is distinct from p_envelope then raise exception 'CONFLICT: prepared transaction differs'; end if;
    return jsonb_build_object('id',v_row.id,'state',v_row.state,'tx_hash',v_row.tx_hash);
  end if;
  update app_private.payment_reservations set state = 'prepared', tx_hash = v_hash, signed_envelope = p_envelope where id = v_row.id returning * into v_row;
  return jsonb_build_object('id',v_row.id,'state',v_row.state,'tx_hash',v_row.tx_hash);
end; $$;
revoke all on function public.store_prepared_payment(uuid,uuid,text,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.store_prepared_payment(uuid,uuid,text,uuid,text,jsonb) to service_role;

create function public.get_prepared_payment(p_company uuid,p_order uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row app_private.payment_reservations;
begin
  if pg_catalog.current_setting('role', true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  select * into v_row from app_private.payment_reservations where company_id = p_company and order_id = p_order and action_id = p_action;
  if not found or v_row.state <> 'prepared' then raise exception 'NOT_FOUND: prepared payment'; end if;
  return jsonb_build_object('id',v_row.id,'state',v_row.state,'tx_hash',v_row.tx_hash,'envelope',v_row.signed_envelope,'chain_id',v_row.chain_id,'sender',v_row.sender,'nonce',v_row.nonce,'token',v_row.token,'destination',v_row.destination,'amount_atomic',v_row.amount_atomic);
end; $$;
revoke all on function public.get_prepared_payment(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_prepared_payment(uuid,uuid,text) to service_role;
