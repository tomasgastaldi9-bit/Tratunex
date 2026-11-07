-- TRA-74 incremental proposal. Tomás versions/applies the shared migration.
-- Requires CRM-03 contacts.sql and PLAT-02/03. No payment or onchain operation.
begin;

create table public.supplier_profiles (
  company_id uuid not null,
  contact_id uuid not null,
  collection_chain text check(collection_chain in ('base','arbitrum')),
  collection_address text check(collection_address ~ '^0x[0-9a-fA-F]{40}$' and collection_address <> '0x0000000000000000000000000000000000000000'),
  wallet_version integer not null default 0 check(wallet_version >= 0),
  wallet_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(company_id,contact_id),
  foreign key(company_id,contact_id) references public.contacts(company_id,id),
  check((collection_chain is null) = (collection_address is null)),
  check((wallet_version = 0) = (wallet_updated_at is null)),
  check(wallet_version > 0 or collection_chain is null)
);
alter table public.supplier_profiles enable row level security;
revoke all on public.supplier_profiles from public,anon,authenticated,service_role;
grant select on public.supplier_profiles to authenticated,service_role;
create policy supplier_profiles_member_read on public.supplier_profiles for select to authenticated
  using(exists(select 1 from public.company_members m where m.company_id = supplier_profiles.company_id and m.user_id = (select auth.uid())));

create function app_private.supplier_dto(p_contact public.contacts,p_profile public.supplier_profiles) returns jsonb
language sql stable set search_path = '' as $$
  select app_private.contact_dto(p_contact) || jsonb_build_object(
    'is_supplier',true,
    'collection_wallet',case when p_profile.collection_chain is null then 'null'::jsonb else
      jsonb_build_object('chain',p_profile.collection_chain,'address',p_profile.collection_address) end,
    'wallet_version',p_profile.wallet_version,
    'wallet_updated_at',case when p_profile.wallet_updated_at is null then null else
      to_char(p_profile.wallet_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end);
$$;

create function app_private.suppliers_execute_internal(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_actor uuid; v_type text; v_action text; v_contact_id uuid;
  v_claimed boolean; v_cached jsonb; v_result jsonb; v_supplier jsonb;
  v_inner jsonb; v_inner_ctx jsonb; v_inner_retryable boolean := false;
  v_profile public.supplier_profiles; v_row record; v_created boolean := false;
  v_wallet jsonb; v_chain text; v_address text; v_expected integer;
  v_limit integer := 50; v_cursor uuid; v_query text := ''; v_source text; v_dnc boolean; v_wallet_status text;
  v_items jsonb := '[]'::jsonb; v_seen integer := 0; v_more boolean := false; v_last uuid;
  v_error text; v_error_code text; v_retryable boolean;
begin
  perform app_private.contact_shape(p_ctx,array['company_id','actor_type','actor_id','action_id'],array['company_id','actor_type','actor_id']);
  v_company := app_private.contact_text(p_ctx,'company_id')::uuid;
  v_actor := app_private.contact_text(p_ctx,'actor_id')::uuid;
  v_type := app_private.contact_text(p_ctx,'actor_type');
  -- Authorization precedes all reads and every cached mutation result.
  if v_type = 'user' then
    if auth.uid() is distinct from v_actor or not exists(select 1 from public.company_members where company_id = v_company and user_id = v_actor) then
      raise exception 'FORBIDDEN: Se requiere membresía vigente de la empresa';
    end if;
  elsif v_type in ('voice','system') then
    if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: Se requieren credenciales de servidor'; end if;
    if not exists(select 1 from public.companies where id = v_company) then raise exception 'NOT_FOUND: Empresa no disponible'; end if;
  else raise exception 'FORBIDDEN: Actor no admitido'; end if;

  if p_operation = 'getSupplier' then
    perform app_private.contact_shape(p_input,array['contact_id'],array['contact_id']);
    v_contact_id := app_private.contact_text(p_input,'contact_id')::uuid;
    select app_private.supplier_dto(c,s) into v_supplier from public.contacts c join public.supplier_profiles s
      on s.company_id = c.company_id and s.contact_id = c.id where c.company_id = v_company and c.id = v_contact_id;
    if not found then raise exception 'NOT_FOUND: Proveedor no disponible en esta empresa'; end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('supplier',v_supplier));
  elsif p_operation = 'listSuppliers' then
    perform app_private.contact_shape(p_input,array['limit','cursor','query','source','do_not_contact','wallet_status'],array[]::text[]);
    if p_input ? 'limit' then
      if jsonb_typeof(p_input -> 'limit') is distinct from 'number' or (p_input ->> 'limit') !~ '^[0-9]+$' then raise exception 'VALIDATION_ERROR: Límite inválido'; end if;
      v_limit := (p_input ->> 'limit')::integer;
    end if;
    if v_limit < 1 or v_limit > 100 then raise exception 'VALIDATION_ERROR: El límite debe estar entre 1 y 100'; end if;
    if p_input ? 'cursor' then v_cursor := app_private.contact_text(p_input,'cursor')::uuid; end if;
    if p_input ? 'query' then
      if jsonb_typeof(p_input -> 'query') is distinct from 'string' then raise exception 'VALIDATION_ERROR: Búsqueda inválida'; end if;
      v_query := lower(btrim(p_input ->> 'query'));
      if length(v_query) > 100 then raise exception 'VALIDATION_ERROR: La búsqueda supera 100 caracteres'; end if;
    end if;
    if p_input ? 'source' then
      v_source := app_private.contact_text(p_input,'source');
      if v_source not in ('csv','firecrawl','manual') then raise exception 'VALIDATION_ERROR: Fuente inválida'; end if;
    end if;
    if p_input ? 'do_not_contact' then
      if jsonb_typeof(p_input -> 'do_not_contact') is distinct from 'string' or p_input ->> 'do_not_contact' not in ('true','false') then raise exception 'VALIDATION_ERROR: Filtro de contacto inválido'; end if;
      v_dnc := (p_input ->> 'do_not_contact')::boolean;
    end if;
    if p_input ? 'wallet_status' then
      v_wallet_status := app_private.contact_text(p_input,'wallet_status');
      if v_wallet_status not in ('pending','configured') then raise exception 'VALIDATION_ERROR: Filtro de billetera inválido'; end if;
    end if;
    for v_row in select c as contact_row,s as profile_row from public.contacts c join public.supplier_profiles s
      on s.company_id = c.company_id and s.contact_id = c.id where c.company_id = v_company
        and (v_cursor is null or c.id > v_cursor) and (v_source is null or c.source ->> 'kind' = v_source)
        and (v_dnc is null or c.do_not_contact = v_dnc)
        and (v_wallet_status is null or (v_wallet_status = 'pending' and s.collection_chain is null) or (v_wallet_status = 'configured' and s.collection_chain is not null))
        and (v_query = '' or position(v_query in lower(c.name)) > 0 or position(v_query in lower(coalesce(c.organization,''))) > 0 or position(v_query in c.phone_e164) > 0)
      order by c.id limit v_limit + 1
    loop
      if v_seen = v_limit then v_more := true; exit; end if;
      v_items := v_items || jsonb_build_array(app_private.supplier_dto(v_row.contact_row,v_row.profile_row));
      v_last := (v_row.contact_row).id; v_seen := v_seen + 1;
    end loop;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('items',v_items,'next_cursor',case when v_more then v_last::text else null end));
  end if;

  if p_operation not in ('upsertSupplier','updateSupplier','setSupplierWallet') or p_operation is null then raise exception 'VALIDATION_ERROR: Operación de proveedores no admitida'; end if;
  if p_operation in ('updateSupplier','setSupplierWallet') and v_type <> 'user' then raise exception 'FORBIDDEN: Una persona debe realizar este cambio'; end if;
  v_action := app_private.contact_text(p_ctx,'action_id');
  select claimed,cached_result into v_claimed,v_cached from app_private.claim_action(v_company,v_type,v_actor,v_action,'crm.' || p_operation,p_input);
  if not v_claimed then return v_cached; end if;

  if p_operation in ('upsertSupplier','updateSupplier') then
    -- Reuse CRM-03's validation/deduplication without permitting wallet metadata.
    if p_operation = 'upsertSupplier' then
      perform app_private.contact_shape(p_input,array['name','organization','phone_e164','website','source','do_not_contact'],array['name','organization','phone_e164','website','source']);
    else
      perform app_private.contact_shape(p_input,array['contact_id','name','organization','phone_e164','website','source','do_not_contact'],array['contact_id','name','organization','phone_e164','website','source']);
      v_contact_id := app_private.contact_text(p_input,'contact_id')::uuid;
      if not exists(select 1 from public.supplier_profiles where company_id = v_company and contact_id = v_contact_id) then raise exception 'NOT_FOUND: Proveedor no disponible en esta empresa'; end if;
    end if;
    v_inner_ctx := p_ctx || jsonb_build_object('action_id','suppliers:contact:' || v_action);
    v_inner := app_private.contacts_execute_internal(v_inner_ctx,case when p_operation = 'upsertSupplier' then 'upsertContact' else 'updateContact' end,p_input);
    if v_inner ->> 'ok' is distinct from 'true' then
      v_inner_retryable := coalesce((v_inner #>> '{error,retryable}')::boolean,false);
      raise exception '%: %',coalesce(v_inner #>> '{error,code}','PROVIDER_ERROR'),coalesce(v_inner #>> '{error,message}','No se pudo guardar el contacto del proveedor');
    end if;
    v_contact_id := (v_inner #>> '{data,contact,id}')::uuid;
    if p_operation = 'upsertSupplier' then
      insert into public.supplier_profiles(company_id,contact_id) values(v_company,v_contact_id)
        on conflict(company_id,contact_id) do nothing returning * into v_profile;
      v_created := found;
    end if;
  else
    perform app_private.contact_shape(p_input,array['contact_id','collection_wallet','expected_wallet_version'],array['contact_id','collection_wallet','expected_wallet_version']);
    v_contact_id := app_private.contact_text(p_input,'contact_id')::uuid;
    if jsonb_typeof(p_input -> 'expected_wallet_version') is distinct from 'number' or (p_input ->> 'expected_wallet_version') !~ '^[0-9]+$' then raise exception 'VALIDATION_ERROR: Versión de billetera inválida'; end if;
    v_expected := (p_input ->> 'expected_wallet_version')::integer;
    v_wallet := p_input -> 'collection_wallet';
    if v_wallet <> 'null'::jsonb then
      perform app_private.contact_shape(v_wallet,array['chain','address'],array['chain','address']);
      v_chain := app_private.contact_text(v_wallet,'chain');
      v_address := app_private.contact_text(v_wallet,'address');
      if v_chain not in ('base','arbitrum') or v_chain is distinct from v_wallet ->> 'chain' then raise exception 'VALIDATION_ERROR: Red de cobro no admitida'; end if;
      if v_address !~ '^0x[0-9a-fA-F]{40}$' or v_address = '0x0000000000000000000000000000000000000000' or v_address is distinct from v_wallet ->> 'address' then
        raise exception 'VALIDATION_ERROR: Usá una dirección 0x de 20 bytes distinta de cero';
      end if;
    end if;
    select * into v_profile from public.supplier_profiles where company_id = v_company and contact_id = v_contact_id for update;
    if not found then raise exception 'NOT_FOUND: Proveedor no disponible en esta empresa'; end if;
    if v_profile.wallet_version <> v_expected then raise exception 'CONFLICT: La billetera cambió; actualizá el proveedor antes de guardar'; end if;
    -- Address casing is preserved. An equivalent address on the same chain is a no-op.
    if v_profile.collection_chain is distinct from v_chain or lower(v_profile.collection_address) is distinct from lower(v_address) then
      update public.supplier_profiles set collection_chain = v_chain,collection_address = v_address,
        wallet_version = wallet_version + 1,wallet_updated_at = clock_timestamp(),updated_at = clock_timestamp()
        where company_id = v_company and contact_id = v_contact_id returning * into v_profile;
    end if;
  end if;
  select app_private.supplier_dto(c,s) into v_supplier from public.contacts c join public.supplier_profiles s
    on s.company_id = c.company_id and s.contact_id = c.id where c.company_id = v_company and c.id = v_contact_id;
  if not found then raise exception 'PROVIDER_ERROR: No se pudo recuperar el proveedor guardado'; end if;
  v_result := jsonb_build_object('ok',true,'data',jsonb_build_object('supplier',v_supplier));
  if p_operation = 'upsertSupplier' then v_result := jsonb_set(v_result,'{data,created}',to_jsonb(v_created)); end if;
  perform app_private.complete_action(v_company,v_action,v_result);
  return v_result;
exception when others then
  -- Contact, profile and both outer/nested receipts roll back as one transaction.
  get stacked diagnostics v_error = message_text;
  v_error_code := split_part(v_error,':',1);
  if v_error_code not in ('VALIDATION_ERROR','NOT_FOUND','FORBIDDEN','CONFLICT','PROVIDER_ERROR','PROVIDER_UNAVAILABLE','RATE_LIMITED') then
    v_error_code := case when sqlstate in ('22P02','22007','22008','22003','23502','23514') then 'VALIDATION_ERROR'
      when sqlstate in ('23505','23503','40001','40P01') then 'CONFLICT' else 'PROVIDER_ERROR' end;
    v_error := case when v_error_code = 'VALIDATION_ERROR' then 'Datos inválidos para la operación'
      when v_error_code = 'CONFLICT' then 'Los datos cambiaron; revisá el estado antes de reintentar' else 'No se pudo completar la operación de proveedores' end;
  else v_error := btrim(substring(v_error from length(v_error_code) + 2)); end if;
  v_retryable := v_inner_retryable or v_error_code = 'PROVIDER_UNAVAILABLE' or sqlstate in ('40001','40P01');
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code',v_error_code,'message',v_error,'retryable',v_retryable));
end; $$;

revoke all on function app_private.supplier_dto(public.contacts,public.supplier_profiles),app_private.suppliers_execute_internal(jsonb,text,jsonb)
  from public,anon,authenticated,service_role;
grant usage on schema app_private to authenticated,service_role;
grant execute on function app_private.suppliers_execute_internal(jsonb,text,jsonb) to authenticated,service_role;
create function public.suppliers_execute(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.suppliers_execute_internal(p_ctx,p_operation,p_input);
$$;
revoke all on function public.suppliers_execute(jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.suppliers_execute(jsonb,text,jsonb) to authenticated,service_role;
commit;
