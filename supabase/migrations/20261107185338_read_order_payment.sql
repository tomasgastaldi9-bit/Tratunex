-- Service caller must authenticate the user before passing actor and company.
-- Only the public DTO is returned; signed bytes, envelope, sender and nonce stay private.
create function public.read_order_payment(p_company uuid, p_actor uuid, p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_res app_private.payment_reservations; v_status text; v_marked boolean;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: server role required'; end if;
  if p_company is null or p_actor is null or p_order is null then raise exception 'VALIDATION_ERROR: invalid payment lookup'; end if;
  perform 1 from public.company_members where company_id=p_company and user_id=p_actor for share;
  if not found then raise exception 'FORBIDDEN: membership required'; end if;
  select * into v_res from app_private.payment_reservations where company_id=p_company and order_id=p_order;
  if not found then return null; end if;
  select exists(select 1 from app_private.payment_broadcast_marks where reservation_id=v_res.id) into v_marked;
  select status into v_status from app_private.payment_observations where reservation_id=v_res.id;
  v_status := coalesce(v_status,case when v_marked then 'unknown' else v_res.state end);
  return jsonb_build_object('id',v_res.id,'status',v_status,'tx_hash',v_res.tx_hash,
    'explorer_url',case when v_res.tx_hash is null then null else 'https://arbiscan.io/tx/' || v_res.tx_hash end,
    'amount_atomic',v_res.amount_atomic,'token','ARGt','chain','arbitrum');
end $$;
revoke all on function public.read_order_payment(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_order_payment(uuid,uuid,uuid) to service_role;
