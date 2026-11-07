create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'vendedor')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_company_idx on public.company_members(user_id, company_id);
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

revoke all on public.companies, public.company_members from public, anon, authenticated;
grant select on public.companies, public.company_members to authenticated;

create policy "members can read own memberships" on public.company_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "members can read their companies" on public.companies
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = companies.id and member.user_id = (select auth.uid())
    )
  );
