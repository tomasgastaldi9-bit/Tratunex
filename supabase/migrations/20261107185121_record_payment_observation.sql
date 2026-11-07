-- Observations are supplied exclusively by the verified server reconciler.
-- The database itself cannot prove a receipt or Ethereum finality.
create table app_private.payment_observations (
  reservation_id uuid primary key references app_private.payment_reservations(id),
  status text not null check(status in ('unknown','pending','confirmed','reverted')),
  observed_at timestamptz not null default now()
);
revoke all on app_private.payment_observations from public, anon, authenticated, service_role;

create function public.record_payment_observation(p_company uuid, p_order uuid, p_reservation uuid, p_hash text, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text; v_hash text := lower(p_hash);
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_order is null or p_reservation is null or v_hash is null or v_hash !~ '^0x[0-9a-f]{64}$' or p_status is null or p_status not in ('unknown','pending','confirmed','reverted') then raise exception 'VALIDATION_ERROR: invalid observation'; end if;
  perform 1 from app_private.payment_reservations r join app_private.payment_broadcast_marks m on m.reservation_id = r.id
    where r.company_id = p_company and r.order_id = p_order and r.id = p_reservation and r.state = 'prepared' and r.tx_hash = v_hash and m.tx_hash = v_hash for update of r;
  if not found then raise exception 'CONFLICT: matching submitted payment not found'; end if;
  select status into v_status from app_private.payment_observations where reservation_id = p_reservation;
  if v_status in ('confirmed','reverted') then
    if p_status in ('confirmed','reverted') and p_status <> v_status then raise exception 'CONFLICT: terminal observation differs'; end if;
    return v_status;
  end if;
  insert into app_private.payment_observations(reservation_id,status) values(p_reservation,p_status)
    on conflict(reservation_id) do update set status=excluded.status,observed_at=clock_timestamp();
  return p_status;
end $$;
revoke all on function public.record_payment_observation(uuid,uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.record_payment_observation(uuid,uuid,uuid,text,text) to service_role;
