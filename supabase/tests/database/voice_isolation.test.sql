begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');
insert into public.companies (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Empresa A'),
  ('22222222-2222-4222-8222-222222222222', 'Empresa B');
insert into public.company_members (company_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vendedor');
insert into public.calls (id, company_id, contact_id, action_id, provider, provider_call_id, transport) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'start-call:a1', 'vapi', 'vapi-call-a1', 'phone'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'start-call:b1', 'vapi', 'vapi-call-b1', 'phone');
insert into public.voice_events (provider_event_id, provider_call_id, event_type, company_id, call_id, payload) values
  ('vapi:vapi-call-a1:end-of-call-report', 'vapi-call-a1', 'end-of-call-report', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', '{}');

select throws_ok(
  $$insert into public.voice_events (provider_event_id, provider_call_id, event_type, payload) values ('vapi:vapi-call-a1:end-of-call-report', 'vapi-call-a1', 'end-of-call-report', '{}')$$,
  '23505', null, 'a resent Vapi event is rejected by its stable key'
);
select throws_ok(
  $$insert into public.calls (company_id, contact_id, action_id, transport) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'start-call:a1', 'mock')$$,
  '23505', null, 'the same action id does not create a second call'
);
select throws_ok(
  $$insert into public.calls (company_id, contact_id, action_id, provider, provider_call_id, transport) values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'start-call:b2', 'vapi', 'vapi-call-a1', 'phone')$$,
  '23505', null, 'a Vapi call id belongs to a single internal call'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select is((select count(*) from public.calls), 1::bigint, 'A sees only the calls of its company');
select is((select count(*) from public.calls where company_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'A cannot read B calls by company');
select throws_ok(
  $$insert into public.calls (company_id, contact_id, action_id, transport) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'start-call:a2', 'mock')$$,
  '42501', null, 'users cannot create calls directly'
);
select throws_ok($$select * from public.voice_events$$, '42501', null, 'users cannot read raw Vapi events');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.calls where id = 'a0000000-0000-4000-8000-000000000001'), 0::bigint, 'B cannot read A call by id');
reset role;
set local role anon;
select throws_ok($$select * from public.calls$$, '42501', null, 'anonymous role has no call access');
reset role;
select * from finish();
rollback;
