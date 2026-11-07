revoke execute on function public.finish_prospect_search(uuid,text,text,text,integer,text,jsonb) from authenticated;
create function public.finish_verified_prospect_search(p_company_id uuid, p_actor_id uuid, p_action_id text, p_query text, p_location text, p_limit integer, p_mode text, p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_attempt app_private.prospect_attempts%rowtype; v_claim record; v_search uuid; v_result jsonb; v_candidate jsonb;
begin
  if p_actor_id is null or not exists(select 1 from public.company_members m where m.company_id=p_company_id and m.user_id=p_actor_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select * into v_attempt from app_private.prospect_attempts where company_id=p_company_id and action_id=p_action_id for update;
  if not found or v_attempt.actor_id <> p_actor_id or v_attempt.request <> jsonb_build_object('query',p_query,'location',p_location,'limit',p_limit,'mode',p_mode) then raise exception using errcode='P0001',message='CONFLICT'; end if;
  if v_attempt.result is not null then return v_attempt.result; end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates)>p_limit then raise exception using errcode='22023',message='VALIDATION_ERROR'; end if;
  select * into v_claim from app_private.claim_action(p_company_id,'user',p_actor_id,p_action_id,'save_prospect_search',jsonb_build_object('query',p_query,'location',p_location,'mode',p_mode));
  if not v_claim.claimed then return v_claim.cached_result; end if;
  insert into public.prospect_searches(company_id,query,location,mode) values(p_company_id,p_query,p_location,p_mode) returning id into v_search;
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    if coalesce(length(btrim(v_candidate->>'name')),0)=0 or coalesce(v_candidate->>'source_url','') !~ '^https?://' or coalesce(v_candidate->>'website','') !~ '^https?://' then raise exception using errcode='22023',message='VALIDATION_ERROR'; end if;
    insert into public.prospect_candidates(company_id,search_id,name,phone,website,source_url,evidence) values(p_company_id,v_search,left(v_candidate->>'name',200),v_candidate->>'phone',v_candidate->>'website',v_candidate->>'source_url',v_candidate->>'evidence');
  end loop;
  select jsonb_build_object('search_id',v_search,'candidates',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'website',c.website,'source_url',c.source_url,'evidence',c.evidence)) filter(where c.id is not null),'[]'::jsonb)) into v_result from public.prospect_candidates c where c.company_id=p_company_id and c.search_id=v_search;
  perform app_private.complete_action(p_company_id,p_action_id,v_result);
  update app_private.prospect_attempts set result=v_result where company_id=p_company_id and action_id=p_action_id;
  return v_result;
end $$;
revoke all on function public.finish_verified_prospect_search(uuid,uuid,text,text,text,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.finish_verified_prospect_search(uuid,uuid,text,text,text,integer,text,jsonb) to service_role;
