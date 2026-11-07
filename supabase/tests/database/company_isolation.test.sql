begin;
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@example.test');
insert into public.companies (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Empresa A'),
  ('22222222-2222-4222-8222-222222222222', 'Empresa B');
insert into public.company_members (company_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vendedor');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select is((select count(*) from public.companies), 1::bigint, 'A sees only one company');
select is((select count(*) from public.companies where id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'A cannot read B by ID');
select is((select count(*) from public.company_members), 1::bigint, 'A sees only their own membership');
select throws_ok($$insert into public.company_members (company_id, user_id, role) values ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin')$$, '42501', null, 'A cannot grant themselves membership');
select throws_ok($$update public.company_members set role = 'admin'$$, '42501', null, 'users cannot change membership roles');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.companies where id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'B cannot read A by ID');
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select is((select count(*) from public.companies), 0::bigint, 'non-member sees no company');
reset role;
set local role anon;
select throws_ok($$select * from public.companies$$, '42501', null, 'anonymous role has no table access');
reset role;
select * from finish();
rollback;
