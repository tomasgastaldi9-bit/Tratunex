-- Standalone local verification only. Does not verify GoTrue/JWT signatures.
do $$ begin
  if current_database() <> 'tratunex_contacts_verify' then raise exception 'Restricted to tratunex_contacts_verify'; end if;
end $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema extensions;
create table auth.users(id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;
