revoke execute on function public.begin_prospect_search(uuid,text,text,text,integer,text) from authenticated;
create function public.begin_verified_prospect_search(p_company_id uuid,p_actor_id uuid,p_action_id text,p_query text,p_location text,p_limit integer,p_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_request jsonb; v_attempt app_private.prospect_attempts%rowtype; v_created boolean;
begin
  if p_actor_id is null or not exists(select 1 from public.company_members m where m.company_id=p_company_id and m.user_id=p_actor_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_action_id is null or length(btrim(p_action_id))=0 or p_query is null or length(btrim(p_query)) not between 1 and 120 or p_location is null or length(btrim(p_location)) not between 1 and 120 or p_limit not between 1 and 5 or p_mode not in ('mock','live') then raise exception using errcode='22023',message='VALIDATION_ERROR'; end if;
  v_request := jsonb_build_object('query',p_query,'location',p_location,'limit',p_limit,'mode',p_mode);
  insert into app_private.prospect_attempts(company_id,action_id,actor_id,request) values(p_company_id,p_action_id,p_actor_id,v_request) on conflict do nothing;
  v_created := found;
  select * into v_attempt from app_private.prospect_attempts where company_id=p_company_id and action_id=p_action_id;
  if v_attempt.actor_id <> p_actor_id or v_attempt.request <> v_request then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if v_created then return jsonb_build_object('state','started'); end if;
  if v_attempt.result is not null then return jsonb_build_object('state','completed','result',v_attempt.result); end if;
  return jsonb_build_object('state','pending');
end $$;
revoke all on function public.begin_verified_prospect_search(uuid,uuid,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.begin_verified_prospect_search(uuid,uuid,text,text,text,integer,text) to service_role;
