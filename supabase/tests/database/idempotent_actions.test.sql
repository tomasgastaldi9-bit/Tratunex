begin;

create schema if not exists test_fixture;

create table test_fixture.action_counter (
  company_id uuid primary key,
  value integer not null default 0
);

create function test_fixture.increment_counter(
  p_company_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_action_id text,
  p_operation text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_claimed boolean;
  v_cached_result jsonb;
  v_count integer;
  v_result jsonb;
begin
  select claim.claimed, claim.cached_result
    into v_claimed, v_cached_result
    from app_private.claim_action(
      p_company_id,
      p_actor_type,
      p_actor_id,
      p_action_id,
      p_operation,
      p_request_payload
    ) as claim;

  if not v_claimed then
    return v_cached_result;
  end if;

  insert into test_fixture.action_counter as counter (company_id, value)
  values (p_company_id, 1)
  on conflict (company_id) do update
    set value = counter.value + 1
  returning value into v_count;

  v_result := jsonb_build_object('count', v_count, 'payload', p_request_payload);
  perform app_private.complete_action(p_company_id, p_action_id, v_result);
  return v_result;
end;
$$;

create function test_fixture.increment_then_fail(
  p_company_id uuid,
  p_actor_id uuid,
  p_action_id text,
  p_request_payload jsonb
)
returns void
language plpgsql
as $$
begin
  perform app_private.claim_action(
    p_company_id, 'user', p_actor_id, p_action_id, 'counter.increment', p_request_payload
  );

  insert into test_fixture.action_counter as counter (company_id, value)
  values (p_company_id, 1)
  on conflict (company_id) do update
    set value = counter.value + 1;

  raise exception using errcode = 'P0001', message = 'fixture failure';
end;
$$;

select plan(11);

select is(
  test_fixture.increment_counter(
    '11111111-1111-4111-8111-111111111111',
    'user',
    '22222222-2222-4222-8222-222222222222',
    'counter-action-1',
    'counter.increment',
    '{"name":"Tomi","amount":1}'::jsonb
  ),
  '{"count":1,"payload":{"name":"Tomi","amount":1}}'::jsonb,
  'first call performs and stores the mutation result'
);

select is(
  test_fixture.increment_counter(
    '11111111-1111-4111-8111-111111111111',
    'user',
    '22222222-2222-4222-8222-222222222222',
    'counter-action-1',
    'counter.increment',
    '{"amount":1,"name":"Tomi"}'::jsonb
  ),
  '{"count":1,"payload":{"name":"Tomi","amount":1}}'::jsonb,
  'reordered JSON object keys replay the original result'
);

select is(
  (select value from test_fixture.action_counter where company_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'a replay does not apply the mutation twice'
);

select throws_ok(
  $$select test_fixture.increment_counter(
    '11111111-1111-4111-8111-111111111111', 'user',
    '22222222-2222-4222-8222-222222222222', 'counter-action-1',
    'counter.increment', '{"name":"Tomi","amount":2}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'changed request data returns a conflict'
);

select throws_ok(
  $$select test_fixture.increment_counter(
    '11111111-1111-4111-8111-111111111111', 'system',
    '22222222-2222-4222-8222-222222222222', 'counter-action-1',
    'counter.increment', '{"name":"Tomi","amount":1}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'changed actor identity returns a conflict'
);

select throws_ok(
  $$select test_fixture.increment_counter(
    '11111111-1111-4111-8111-111111111111', 'user',
    '22222222-2222-4222-8222-222222222222', 'counter-action-1',
    'counter.reset', '{"name":"Tomi","amount":1}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'changed operation returns a conflict'
);

select throws_ok(
  $$select test_fixture.increment_then_fail(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'counter-action-rollback', '{"name":"rollback"}'::jsonb
  )$$,
  'P0001',
  'fixture failure',
  'a failed mutation raises an error'
);

select is(
  (select value from test_fixture.action_counter where company_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'the failed mutation rolls back its counter update'
);

select ok(
  not exists (
    select 1 from app_private.action_receipts
    where company_id = '11111111-1111-4111-8111-111111111111'
      and action_id = 'counter-action-rollback'
  ),
  'the failed mutation rolls back its receipt'
);

select ok(
  not has_table_privilege('anon', 'app_private.action_receipts', 'SELECT')
  and not has_table_privilege('authenticated', 'app_private.action_receipts', 'SELECT')
  and not has_table_privilege('service_role', 'app_private.action_receipts', 'SELECT'),
  'no API role has direct receipt-table access'
);

select ok(
  not has_function_privilege(
    'anon', 'app_private.claim_action(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'app_private.claim_action(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'app_private.claim_action(uuid,text,uuid,text,text,jsonb)', 'EXECUTE'
  ),
  'no API role can call the internal claim helper directly'
);

select * from finish();
rollback;
