create table public.prospect_searches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  query text not null,
  location text not null,
  mode text not null check (mode in ('mock', 'live')),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create table public.prospect_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  search_id uuid not null,
  name text not null,
  phone text,
  website text not null,
  source_url text not null,
  evidence text,
  created_at timestamptz not null default now(),
  foreign key (company_id, search_id) references public.prospect_searches(company_id, id) on delete cascade
);
create index prospect_searches_company_idx on public.prospect_searches(company_id, created_at desc);
create index prospect_candidates_search_idx on public.prospect_candidates(company_id, search_id);
alter table public.prospect_searches enable row level security;
alter table public.prospect_candidates enable row level security;
revoke all on public.prospect_searches, public.prospect_candidates from public, anon, authenticated;
grant select on public.prospect_searches, public.prospect_candidates to authenticated;
create policy "members read prospect searches" on public.prospect_searches for select to authenticated using (exists (select 1 from public.company_members m where m.company_id = prospect_searches.company_id and m.user_id = (select auth.uid())));
create policy "members read prospect candidates" on public.prospect_candidates for select to authenticated using (exists (select 1 from public.company_members m where m.company_id = prospect_candidates.company_id and m.user_id = (select auth.uid())));

create function public.save_prospect_search(p_company_id uuid, p_action_id text, p_query text, p_location text, p_mode text, p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_user uuid := auth.uid(); v_claim record; v_search uuid; v_result jsonb; v_candidate jsonb;
begin
  if v_user is null or not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = v_user) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if length(btrim(p_query)) not between 1 and 120 or length(btrim(p_location)) not between 1 and 120 or p_mode not in ('mock','live') or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 5 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  select * into v_claim from app_private.claim_action(p_company_id, 'user', v_user, p_action_id, 'save_prospect_search', jsonb_build_object('query', p_query, 'location', p_location, 'mode', p_mode));
  if not v_claim.claimed then return v_claim.cached_result; end if;
  insert into public.prospect_searches(company_id, query, location, mode) values(p_company_id, p_query, p_location, p_mode) returning id into v_search;
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    if coalesce(length(btrim(v_candidate->>'name')),0) = 0 or coalesce(v_candidate->>'source_url','') !~ '^https?://' or coalesce(v_candidate->>'website','') !~ '^https?://' then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;
    insert into public.prospect_candidates(company_id, search_id, name, phone, website, source_url, evidence)
    values(p_company_id, v_search, left(v_candidate->>'name',200), v_candidate->>'phone', v_candidate->>'website', v_candidate->>'source_url', v_candidate->>'evidence');
  end loop;
  select jsonb_build_object('search_id',v_search,'candidates', coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'website',c.website,'source_url',c.source_url,'evidence',c.evidence)) filter (where c.id is not null),'[]'::jsonb)) into v_result from public.prospect_candidates c where c.company_id = p_company_id and c.search_id = v_search;
  perform app_private.complete_action(p_company_id, p_action_id, v_result);
  return v_result;
end $$;
revoke all on function public.save_prospect_search(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.save_prospect_search(uuid,text,text,text,text,jsonb) to authenticated;

