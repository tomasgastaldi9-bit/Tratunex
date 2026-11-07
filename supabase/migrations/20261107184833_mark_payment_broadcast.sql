-- One irreversible broadcast claim. A lost response leaves the attempt unknown;
-- it must never be interpreted as permission to transmit again.
create table app_private.payment_broadcast_marks (
  reservation_id uuid primary key references app_private.payment_reservations(id),
  tx_hash text not null check(tx_hash ~ '^0x[0-9a-f]{64}$'),
  started_at timestamptz not null default now()
);
revoke all on app_private.payment_broadcast_marks from public, anon, authenticated, service_role;

create function public.mark_payment_broadcast(p_company uuid, p_order uuid, p_reservation uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inserted integer; v_hash text := lower(p_hash);
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_order is null or p_reservation is null or v_hash is null or v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'VALIDATION_ERROR: invalid broadcast claim'; end if;
  perform 1 from app_private.payment_reservations where company_id = p_company and order_id = p_order and id = p_reservation
    and state = 'prepared' and tx_hash = v_hash for update;
  if not found then raise exception 'CONFLICT: prepared payment not found'; end if;
  insert into app_private.payment_broadcast_marks(reservation_id,tx_hash) values(p_reservation,v_hash) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end $$;
revoke all on function public.mark_payment_broadcast(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.mark_payment_broadcast(uuid,uuid,uuid,text) to service_role;
