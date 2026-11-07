begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');
insert into public.companies (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Empresa A'),
  ('22222222-2222-4222-8222-222222222222', 'Empresa B');
insert into public.company_members (company_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vendedor');
insert into public.contacts (id, company_id, name, phone_e164, source) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Proveedor A', '+12025550101', '{}'),
  ('c2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Proveedor B', '+12025550102', '{}');
insert into public.calls (id, company_id, contact_id, action_id, provider, provider_call_id, transport) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'quote-call:a1', 'vapi', 'vapi-quote-a1', 'phone'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000001', 'quote-call:b1', 'vapi', 'vapi-quote-b1', 'phone');
insert into public.purchase_requests (id, company_id, product, quantity, needed_by, budget_atomic) values
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Vasos de papel de 8 oz', 500, '2026-11-09', 50000000000000000000000),
  ('e2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Servilletas', 100, '2026-11-09', 1000000000000000000000);
insert into public.supplier_quotes (id, company_id, purchase_request_id, supplier_contact_id, call_id, source, can_supply, unit_price, currency, accepts_argt, summary) values
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'call', 'yes', 85, 'ARS', 'yes', 'Tiene 2.000 vasos a $85 más IVA.'),
  ('d2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', null, 'c2000000-0000-4000-8000-000000000001', null, 'example', 'yes', 90, 'ARS', 'unknown', 'Cotización de ejemplo.');

select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, call_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'call', 'yes', 'yes', 'otra')$$,
  '23505', null, 'a call produces at most one quote'
);
select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, call_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'call', 'yes', 'yes', 'ajena')$$,
  '23503', null, 'a quote cannot point to a call of another company'
);
select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c2000000-0000-4000-8000-000000000001', 'web', 'yes', 'no', 'ajena')$$,
  '23503', null, 'a quote cannot point to a supplier of another company'
);
select throws_ok(
  $$insert into public.supplier_quotes (company_id, purchase_request_id, supplier_contact_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'e2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'web', 'yes', 'no', 'compra ajena')$$,
  '23503', null, 'a quote cannot point to a purchase of another company'
);
select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'call', 'yes', 'yes', 'sin llamada')$$,
  '23514', null, 'a call quote needs its call'
);
select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, source, can_supply, unit_price, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'web', 'yes', 0, 'no', 'precio cero')$$,
  '23514', null, 'a missing price is null, never 0'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select is((select count(*) from public.supplier_quotes), 1::bigint, 'A sees only the quotes of its company');
select throws_ok(
  $$insert into public.supplier_quotes (company_id, supplier_contact_id, source, can_supply, accepts_argt, summary) values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'web', 'yes', 'no', 'directo')$$,
  '42501', null, 'users cannot write quotes directly'
);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((select count(*) from public.supplier_quotes where id = 'd1000000-0000-4000-8000-000000000001'), 0::bigint, 'B cannot read A quote by id');
select is((select count(*) from public.supplier_quotes), 1::bigint, 'B sees its own example quote');
reset role;
set local role anon;
select throws_ok($$select * from public.supplier_quotes$$, '42501', null, 'anonymous role has no quote access');
reset role;
select * from finish();
rollback;
