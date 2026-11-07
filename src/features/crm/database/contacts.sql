-- CRM-03 proposal; Tomás versions and applies the shared migration after review.
-- Prerequisites: PLAT-02 action receipts and PLAT-03 companies/memberships.
begin;

create function app_private.contact_domain(p_url text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_host text; v_authority text; v_port text; v_address inet; v_last_label text;
begin
  if p_url is null then return null; end if;
  if p_url !~* '^https?://[^/?#[:space:]]+' or p_url ~ '[[:space:][:cntrl:]]' or position(chr(92) in p_url) > 0 then
    raise exception 'VALIDATION_ERROR: La web debe usar una URL HTTP válida';
  end if;
  v_authority := lower(substring(p_url from '(?i)^https?://([^/?#]+)'));
  if v_authority like '%@%' then raise exception 'VALIDATION_ERROR: La URL no admite credenciales'; end if;
  if left(v_authority,1) = '[' then
    if v_authority !~ '^\[[0-9a-f:.]+\](:[0-9]+)?$' then raise exception 'VALIDATION_ERROR: Host IPv6 inválido'; end if;
    v_host := substring(v_authority from '^\[([^]]+)\]');
    begin
      v_address := v_host::inet;
      if family(v_address) <> 6 then raise exception 'IPv6 required'; end if;
    exception when others then raise exception 'VALIDATION_ERROR: Host IPv6 inválido'; end;
    v_host := '[' || host(v_address) || ']';
    v_port := substring(v_authority from '\]:([0-9]+)$');
  else
    if v_authority !~ '^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?(:[0-9]+)?$' then raise exception 'VALIDATION_ERROR: Usá un host ASCII o una dirección IP válida'; end if;
    v_host := rtrim(split_part(v_authority,':',1),'.');
    -- Keep this RPC's accepted subset compatible with the browser URL parser.
    -- Numeric/hex final labels trigger WHATWG's IPv4 parser, even in DNS-looking names.
    v_last_label := substring(v_host from '([^.]+)$');
    if v_last_label ~ '^[0-9]+$' or v_last_label ~ '^0x[0-9a-f]*$' then
      if v_host !~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' then raise exception 'VALIDATION_ERROR: Se requiere IPv4 decimal de cuatro octetos'; end if;
      begin
        v_address := v_host::inet;
        if family(v_address) <> 4 or host(v_address) <> v_host then raise exception 'Canonical IPv4 required'; end if;
      exception when others then raise exception 'VALIDATION_ERROR: Dirección IPv4 inválida'; end;
    end if;
    -- IDNA needs a dedicated normalizer; raw/unverified A-labels can fail WHATWG parsing.
    if v_host ~ '(^|\.)xn--' then raise exception 'VALIDATION_ERROR: Este MVP no admite dominios IDNA en la RPC'; end if;
    v_port := substring(v_authority from ':([0-9]+)$');
  end if;
  if v_port is not null and (length(v_port) > 5 or v_port::integer > 65535) then raise exception 'VALIDATION_ERROR: Puerto fuera de rango'; end if;
  v_host := regexp_replace(rtrim(v_host, '.'), '^www\.', '');
  if v_host = '' then raise exception 'VALIDATION_ERROR: Falta el dominio de la web'; end if;
  return v_host;
end; $$;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (length(btrim(name)) > 0),
  organization text check (organization is null or length(btrim(organization)) > 0),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  website text,
  website_domain text generated always as (app_private.contact_domain(website)) stored,
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, phone_e164)
);
create unique index contacts_company_domain_uq on public.contacts(company_id, website_domain) where website_domain is not null;
alter table public.contacts enable row level security;
revoke all on public.contacts from public, anon, authenticated, service_role;
grant select on public.contacts to authenticated, service_role;
create policy contacts_member_read on public.contacts for select to authenticated
using (exists(select 1 from public.company_members m where m.company_id = contacts.company_id and m.user_id = (select auth.uid())));

create function app_private.contact_dto(p public.contacts) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(p) - 'website_domain' || jsonb_build_object(
    'created_at', to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at', to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;
create function app_private.contact_shape(p jsonb, p_allowed text[], p_required text[]) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_ERROR: Los datos deben ser un objeto'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where not k = any(p_allowed))
    or exists(select 1 from unnest(p_required) k where not p ? k) then
    raise exception 'VALIDATION_ERROR: Campos faltantes o inesperados';
  end if;
end; $$;
create function app_private.contact_text(p jsonb, p_key text, p_nullable boolean default false) returns text
language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if p_nullable and (p -> p_key is null or p -> p_key = 'null'::jsonb) then return null; end if;
  if jsonb_typeof(p -> p_key) is distinct from 'string' then raise exception 'VALIDATION_ERROR: % debe ser texto', p_key; end if;
  v := btrim(p ->> p_key);
  if length(v) = 0 then raise exception 'VALIDATION_ERROR: % no puede estar vacío', p_key; end if;
  return v;
end; $$;

create function app_private.contacts_execute_internal(p_ctx jsonb, p_operation text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_actor uuid; v_type text; v_action text;
  v_claimed boolean; v_cached jsonb; v_result jsonb; v_data jsonb;
  v_contact public.contacts; v_candidate public.contacts;
  v_id uuid; v_count integer; v_created boolean; v_dnc boolean := false;
  v_name text; v_org text; v_phone text; v_website text; v_domain text; v_source jsonb;
  v_now timestamptz := clock_timestamp();
  v_limit integer := 50; v_cursor uuid; v_query text := ''; v_source_kind text; v_dnc_filter boolean;
  v_items jsonb := '[]'::jsonb; v_seen integer := 0; v_more boolean := false; v_last uuid;
  v_error text; v_error_code text; v_retryable boolean;
begin
  perform app_private.contact_shape(p_ctx, array['company_id','actor_type','actor_id','action_id'], array['company_id','actor_type','actor_id']);
  v_company := app_private.contact_text(p_ctx,'company_id')::uuid;
  v_actor := app_private.contact_text(p_ctx,'actor_id')::uuid;
  v_type := app_private.contact_text(p_ctx,'actor_type');
  -- Authority is checked before a cached receipt can be returned.
  if v_type = 'user' then
    if auth.uid() is distinct from v_actor or not exists(select 1 from public.company_members where company_id = v_company and user_id = v_actor) then
      raise exception 'FORBIDDEN: Se requiere membresía vigente de la empresa';
    end if;
  elsif v_type in ('voice','system') then
    if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: Se requieren credenciales de servidor'; end if;
    if not exists(select 1 from public.companies where id = v_company) then raise exception 'NOT_FOUND: Empresa no disponible'; end if;
  else raise exception 'FORBIDDEN: Actor no admitido'; end if;

  if p_operation = 'getContact' then
    perform app_private.contact_shape(p_input, array['contact_id'], array['contact_id']);
    select * into v_contact from public.contacts where company_id = v_company and id = app_private.contact_text(p_input,'contact_id')::uuid;
    if not found then raise exception 'NOT_FOUND: Contacto no disponible en esta empresa'; end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('contact',app_private.contact_dto(v_contact)));
  elsif p_operation = 'listContacts' then
    perform app_private.contact_shape(p_input, array['limit','cursor','query','source','do_not_contact'], array[]::text[]);
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
      v_source_kind := app_private.contact_text(p_input,'source');
      if v_source_kind not in ('csv','firecrawl','manual') then raise exception 'VALIDATION_ERROR: Fuente inválida'; end if;
    end if;
    if p_input ? 'do_not_contact' then
      if jsonb_typeof(p_input -> 'do_not_contact') is distinct from 'string' or p_input ->> 'do_not_contact' not in ('true','false') then raise exception 'VALIDATION_ERROR: Filtro de contacto inválido'; end if;
      v_dnc_filter := (p_input ->> 'do_not_contact')::boolean;
    end if;
    for v_candidate in select c.* from public.contacts c
      where c.company_id = v_company and (v_cursor is null or c.id > v_cursor)
        and (v_source_kind is null or c.source ->> 'kind' = v_source_kind)
        and (v_dnc_filter is null or c.do_not_contact = v_dnc_filter)
        and (v_query = '' or position(v_query in lower(c.name)) > 0
          or position(v_query in lower(coalesce(c.organization,''))) > 0 or position(v_query in c.phone_e164) > 0)
      order by c.id limit v_limit + 1
    loop
      if v_seen = v_limit then v_more := true; exit; end if;
      v_items := v_items || jsonb_build_array(app_private.contact_dto(v_candidate));
      v_last := v_candidate.id; v_seen := v_seen + 1;
    end loop;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('items',v_items,'next_cursor',case when v_more then v_last::text else null end));
  end if;

  if p_operation not in ('upsertContact','updateContact') or p_operation is null then raise exception 'VALIDATION_ERROR: Operación de contactos no admitida'; end if;
  v_action := app_private.contact_text(p_ctx,'action_id');
  select claimed,cached_result into v_claimed,v_cached from app_private.claim_action(v_company,v_type,v_actor,v_action,'crm.' || p_operation,p_input);
  if not v_claimed then return v_cached; end if;
  if p_operation = 'upsertContact' then
    perform app_private.contact_shape(p_input,array['name','organization','phone_e164','website','source','do_not_contact'],array['name','organization','phone_e164','website','source']);
  else
    perform app_private.contact_shape(p_input,array['contact_id','name','organization','phone_e164','website','source','do_not_contact'],array['contact_id','name','organization','phone_e164','website','source']);
    v_id := app_private.contact_text(p_input,'contact_id')::uuid;
  end if;
  v_name := app_private.contact_text(p_input,'name'); v_org := app_private.contact_text(p_input,'organization',true);
  v_phone := app_private.contact_text(p_input,'phone_e164'); v_website := app_private.contact_text(p_input,'website',true);
  if v_website is distinct from p_input ->> 'website' then raise exception 'VALIDATION_ERROR: La URL no admite espacios alrededor'; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' or v_phone is distinct from p_input ->> 'phone_e164' then raise exception 'VALIDATION_ERROR: Usá un teléfono E.164'; end if;
  v_domain := app_private.contact_domain(v_website); v_source := p_input -> 'source';
  perform app_private.contact_shape(v_source,array['kind','label','url'],array['kind','label','url']);
  if jsonb_typeof(v_source -> 'kind') is distinct from 'string' or v_source ->> 'kind' not in ('csv','firecrawl','manual') then raise exception 'VALIDATION_ERROR: Fuente inválida'; end if;
  perform app_private.contact_text(v_source,'label');
  if app_private.contact_text(v_source,'url',true) is distinct from v_source ->> 'url' then raise exception 'VALIDATION_ERROR: La URL de fuente no admite espacios alrededor'; end if;
  perform app_private.contact_domain(app_private.contact_text(v_source,'url',true));
  if p_input ? 'do_not_contact' then
    if jsonb_typeof(p_input -> 'do_not_contact') is distinct from 'boolean' then raise exception 'VALIDATION_ERROR: do_not_contact debe ser booleano'; end if;
    v_dnc := (p_input ->> 'do_not_contact')::boolean;
  end if;
  -- Serialize imports/edits within one company; uniqueness remains a backstop.
  perform pg_advisory_xact_lock(hashtextextended('crm.contacts:' || v_company::text,0));
  v_now := clock_timestamp();
  if p_operation = 'updateContact' then
    select * into v_contact from public.contacts where company_id = v_company and id = v_id for update;
    if not found then raise exception 'NOT_FOUND: Contacto no disponible en esta empresa'; end if;
    if exists(select 1 from public.contacts where company_id = v_company and id <> v_id
      and (phone_e164 = v_phone or (v_domain is not null and website_domain = v_domain))) then
      raise exception 'CONFLICT: El teléfono o dominio ya corresponde a otro contacto';
    end if;
    v_created := false;
  else
    select count(*) into v_count from public.contacts where company_id = v_company
      and (phone_e164 = v_phone or (v_domain is not null and website_domain = v_domain));
    if v_count > 1 then raise exception 'CONFLICT: El teléfono y el dominio identifican contactos distintos'; end if;
    select * into v_contact from public.contacts where company_id = v_company
      and (phone_e164 = v_phone or (v_domain is not null and website_domain = v_domain)) for update;
    v_created := not found;
  end if;
  if v_created then
    insert into public.contacts(company_id,name,organization,phone_e164,website,source,do_not_contact)
      values(v_company,v_name,v_org,v_phone,v_website,v_source,v_dnc) returning * into v_contact;
  else
    update public.contacts set name = v_name, organization = v_org, phone_e164 = v_phone,
      website = v_website, source = v_source, do_not_contact = do_not_contact or v_dnc, updated_at = v_now
      where id = v_contact.id and company_id = v_company returning * into v_contact;
  end if;
  v_data := jsonb_build_object('contact',app_private.contact_dto(v_contact));
  if p_operation = 'upsertContact' then v_data := v_data || jsonb_build_object('created',v_created); end if;
  v_result := jsonb_build_object('ok',true,'data',v_data);
  perform app_private.complete_action(v_company,v_action,v_result);
  return v_result;
exception when others then
  -- The exception subtransaction rolls back both changes and the new receipt.
  get stacked diagnostics v_error = message_text;
  v_error_code := split_part(v_error,':',1);
  if v_error_code not in ('VALIDATION_ERROR','NOT_FOUND','FORBIDDEN','CONFLICT','PROVIDER_ERROR','PROVIDER_UNAVAILABLE','RATE_LIMITED') then
    v_error_code := case when sqlstate in ('22P02','22007','22008','22003','23502','23514') then 'VALIDATION_ERROR'
      when sqlstate in ('23505','23503','40001','40P01') then 'CONFLICT' else 'PROVIDER_ERROR' end;
    v_error := case when v_error_code = 'VALIDATION_ERROR' then 'Datos inválidos para la operación'
      when v_error_code = 'CONFLICT' then 'Los datos cambiaron; revisá el estado antes de reintentar' else 'No se pudo completar la operación de contactos' end;
  else v_error := btrim(substring(v_error from length(v_error_code) + 2)); end if;
  v_retryable := v_error_code = 'PROVIDER_UNAVAILABLE' or sqlstate in ('40001','40P01');
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code',v_error_code,'message',v_error,'retryable',v_retryable));
end; $$;

-- Definer helpers stay private; only the checked dispatcher can be invoked.
revoke all on function app_private.contact_domain(text), app_private.contact_dto(public.contacts),
  app_private.contact_shape(jsonb,text[],text[]), app_private.contact_text(jsonb,text,boolean),
  app_private.contacts_execute_internal(jsonb,text,jsonb) from public, anon, authenticated, service_role;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.contacts_execute_internal(jsonb,text,jsonb) to authenticated, service_role;
create function public.contacts_execute(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.contacts_execute_internal(p_ctx,p_operation,p_input);
$$;
revoke all on function public.contacts_execute(jsonb,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.contacts_execute(jsonb,text,jsonb) to authenticated, service_role;
commit;
