create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;

create table app_private.action_receipts (
  company_id uuid not null,
  action_id text not null check (length(btrim(action_id)) > 0),
  actor_type text not null check (actor_type in ('user', 'voice', 'system')),
  actor_id uuid not null,
  operation text not null check (length(btrim(operation)) > 0),
  request_hash bytea not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (company_id, action_id),
  check ((result is null) = (completed_at is null))
);

revoke all on table app_private.action_receipts from public, anon, authenticated, service_role;

create function app_private.claim_action(
  p_company_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_action_id text,
  p_operation text,
  p_request_payload jsonb
)
returns table (claimed boolean, cached_result jsonb)
language plpgsql
security definer
set search_path = pg_catalog, app_private, extensions
as $$
declare
  v_receipt app_private.action_receipts%rowtype;
  v_request_hash bytea;
begin
  if p_company_id is null
    or p_actor_id is null
    or p_actor_type is null
    or p_actor_type not in ('user', 'voice', 'system')
    or p_action_id is null
    or length(btrim(p_action_id)) = 0
    or p_operation is null
    or length(btrim(p_operation)) = 0
    or p_request_payload is null
  then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: invalid action receipt input';
  end if;

  v_request_hash := extensions.digest(
    convert_to(p_request_payload::text, 'UTF8'),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || p_action_id, 0)
  );

  select receipt.*
    into v_receipt
    from app_private.action_receipts as receipt
   where receipt.company_id = p_company_id
     and receipt.action_id = p_action_id
   for update;

  if not found then
    insert into app_private.action_receipts (
      company_id,
      action_id,
      actor_type,
      actor_id,
      operation,
      request_hash
    ) values (
      p_company_id,
      p_action_id,
      p_actor_type,
      p_actor_id,
      p_operation,
      v_request_hash
    );

    return query select true, null::jsonb;
    return;
  end if;

  if v_receipt.actor_type is distinct from p_actor_type
    or v_receipt.actor_id is distinct from p_actor_id
    or v_receipt.operation is distinct from p_operation
    or v_receipt.request_hash is distinct from v_request_hash
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT: action id was reused with different input';
  end if;

  if v_receipt.completed_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT: action receipt is incomplete';
  end if;

  return query select false, v_receipt.result;
end;
$$;

create function app_private.complete_action(
  p_company_id uuid,
  p_action_id text,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
begin
  if p_result is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: action result must not be null';
  end if;

  update app_private.action_receipts as receipt
     set result = p_result,
         completed_at = now()
   where receipt.company_id = p_company_id
     and receipt.action_id = p_action_id
     and receipt.completed_at is null
     and receipt.result is null;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT: action receipt is missing or already completed';
  end if;
end;
$$;

revoke all on function app_private.claim_action(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.complete_action(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
