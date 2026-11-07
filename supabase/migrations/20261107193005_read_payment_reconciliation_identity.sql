-- Service-only identity for read-only reconciliation of an already marked
-- transmission. This operation never creates a reservation or sends a payment.
create function public.read_payment_reconciliation_identity(p_company uuid, p_actor uuid, p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_res app_private.payment_reservations;
begin
  if current_setting('role', true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_actor is null or p_order is null then raise exception 'VALIDATION_ERROR: invalid reconciliation lookup'; end if;
  perform 1 from public.company_members where company_id = p_company and user_id = p_actor for share;
  if not found then raise exception 'FORBIDDEN: membership required'; end if;
  select r.* into v_res from app_private.payment_reservations r
    join app_private.payment_broadcast_marks m on m.reservation_id = r.id and m.tx_hash = r.tx_hash
    where r.company_id = p_company and r.order_id = p_order and r.state = 'prepared';
  if not found then return null; end if;
  return jsonb_build_object('id',v_res.id,'action_id',v_res.action_id,'chain_id',v_res.chain_id,'sender',v_res.sender,
    'nonce',v_res.nonce,'token',v_res.token,'destination',v_res.destination,'amount_atomic',v_res.amount_atomic);
end $$;
revoke all on function public.read_payment_reconciliation_identity(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_payment_reconciliation_identity(uuid,uuid,uuid) to service_role;
