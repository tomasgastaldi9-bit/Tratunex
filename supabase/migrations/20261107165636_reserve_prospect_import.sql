-- The batch receipt binds one action to the complete, validated request.
create function app_private.reserve_prospect_import_internal(p_company uuid, p_action text, p_inputs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean; v_cached jsonb; v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.company_members where company_id = p_company and user_id = v_user) then
    raise exception 'FORBIDDEN: Empresa no disponible';
  end if;
  if p_action is null or length(p_action) > 100 or length(trim(p_action)) = 0 or
     jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs) not between 1 and 500 or
     octet_length(p_inputs::text) > 524288 then
    raise exception 'VALIDATION_ERROR: Lote inválido';
  end if;
  select claimed, cached_result into v_claimed, v_cached from app_private.claim_action(p_company, 'user', v_user, 'discovery-batch:' || p_action, 'discovery.import', p_inputs);
  if v_claimed then perform app_private.complete_action(p_company, 'discovery-batch:' || p_action, '{}'::jsonb); end if;
end; $$;
revoke all on function app_private.reserve_prospect_import_internal(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function app_private.reserve_prospect_import_internal(uuid,text,jsonb) to authenticated;

create function public.reserve_prospect_import(p_company uuid, p_action text, p_inputs jsonb)
returns void language sql security invoker set search_path = '' as $$
  select app_private.reserve_prospect_import_internal(p_company, p_action, p_inputs);
$$;
revoke all on function public.reserve_prospect_import(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_prospect_import(uuid,text,jsonb) to authenticated;
