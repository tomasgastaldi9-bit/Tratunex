-- ORD-04 preparation artifact, NOT an application RPC or a migration.
-- Reviewed SQL operator only. Set tratunex_demo.input inside the SAME transaction.
-- Never starts calls, creates a live quote/order/payment, or edits existing rows.
do $$
declare
  p jsonb := nullif(current_setting('tratunex_demo.input',true),'')::jsonb;
  v_company uuid; v_actor uuid; v_seed uuid; v_purchase uuid; v_live uuid; v_placeholder uuid;
  v_contact_ids uuid[]; v_quote_ids uuid[]; v_phones text[]; v_all_ids uuid[];
  v_due date; v_local boolean; v_claimed boolean; v_cached jsonb; v_output jsonb;
  v_profile public.supplier_profiles; v_contact public.contacts; v_policy public.purchase_policies;
  v_count integer; v_i integer; v_action text; v_label text; v_slot_status text;
  v_budget numeric := 100000000000000000000000; -- 100,000 ARS nominal, 18 atomic decimals.
begin
  if current_user not in ('postgres','supabase_admin') then raise exception 'FORBIDDEN: Artefacto reservado al operador SQL revisado por el equipo'; end if;
  perform app_private.contact_shape(p,array['schema_version','company_id','actor_id','seed_id','purchase_request_id','example_supplier_ids','example_quote_ids','example_phone_e164','needed_by','existing_live_supplier_contact_id','allow_local_placeholder','local_placeholder_supplier_id','local_placeholder_phone_e164'],
    array['schema_version','company_id','actor_id','seed_id','purchase_request_id','example_supplier_ids','example_quote_ids','example_phone_e164','needed_by','existing_live_supplier_contact_id','allow_local_placeholder']);
  if p ->> 'schema_version' <> '1' then raise exception 'VALIDATION_ERROR: Versión de manifest no admitida'; end if;
  v_company := app_private.contact_text(p,'company_id')::uuid;
  v_actor := app_private.contact_text(p,'actor_id')::uuid;
  v_seed := app_private.contact_text(p,'seed_id')::uuid;
  v_purchase := app_private.contact_text(p,'purchase_request_id')::uuid;
  v_live := app_private.contact_text(p,'existing_live_supplier_contact_id',true)::uuid;
  if jsonb_typeof(p -> 'allow_local_placeholder') is distinct from 'boolean' then raise exception 'VALIDATION_ERROR: Declarar el modo de preparación local'; end if;
  v_local := (p ->> 'allow_local_placeholder')::boolean;
  if v_local and current_database() <> 'tratunex_contacts_verify' then raise exception 'FORBIDDEN: El proveedor pendiente ficticio solo se admite en la base aislada local'; end if;
  if not exists(select 1 from public.companies where id=v_company and name='Sur Insumos') then raise exception 'FORBIDDEN: El ID de empresa debe corresponder exactamente a Sur Insumos'; end if;
  perform 1 from public.company_members where company_id=v_company and user_id=v_actor and role='admin' for share;
  if not found then raise exception 'FORBIDDEN: Se requiere una persona admin de Sur Insumos'; end if;
  if jsonb_typeof(p -> 'example_supplier_ids') is distinct from 'array' or jsonb_array_length(p -> 'example_supplier_ids') <> 2
    or jsonb_typeof(p -> 'example_quote_ids') is distinct from 'array' or jsonb_array_length(p -> 'example_quote_ids') <> 2
    or jsonb_typeof(p -> 'example_phone_e164') is distinct from 'array' or jsonb_array_length(p -> 'example_phone_e164') <> 2 then raise exception 'VALIDATION_ERROR: Se requieren exactamente dos proveedores y cotizaciones de ejemplo'; end if;
  v_contact_ids := array[(p #>> '{example_supplier_ids,0}')::uuid,(p #>> '{example_supplier_ids,1}')::uuid];
  v_quote_ids := array[(p #>> '{example_quote_ids,0}')::uuid,(p #>> '{example_quote_ids,1}')::uuid];
  v_phones := array[p #>> '{example_phone_e164,0}',p #>> '{example_phone_e164,1}'];
  if exists(select 1 from unnest(v_phones) x where x is null or x !~ '^\+120255501[0-9]{2}$') or v_phones[1]=v_phones[2] then raise exception 'VALIDATION_ERROR: Los ejemplos solo usan teléfonos de ficción reservados'; end if;
  if v_local and v_live is null then
    v_placeholder := app_private.contact_text(p,'local_placeholder_supplier_id')::uuid;
    v_phones := v_phones || app_private.contact_text(p,'local_placeholder_phone_e164');
    if v_phones[3] !~ '^\+120255501[0-9]{2}$' or v_phones[3]=any(v_phones[1:2]) then raise exception 'VALIDATION_ERROR: El slot local requiere otro teléfono reservado'; end if;
  end if;
  v_all_ids := array[v_seed,v_purchase] || v_contact_ids || v_quote_ids || array_remove(array[v_placeholder],null);
  select count(distinct x) into v_count from unnest(v_all_ids) x;
  if array_position(v_all_ids,null) is not null or v_count <> cardinality(v_all_ids) or v_live=any(v_all_ids) then raise exception 'VALIDATION_ERROR: IDs de preparación distintos y completos'; end if;
  if p ->> 'needed_by' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'VALIDATION_ERROR: Fecha AAAA-MM-DD requerida'; end if;
  v_due := (p ->> 'needed_by')::date;
  if v_due <= (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date or extract(isodow from v_due) <> 1 then raise exception 'VALIDATION_ERROR: La entrega debe ser un lunes futuro'; end if;
  select * into v_policy from public.purchase_policies where company_id=v_company for share;
  if not found or v_policy.max_per_purchase_atomic < v_budget or v_policy.auto_pay_limit_atomic <> 0 or v_policy.only_allowed_suppliers then
    raise exception 'FORBIDDEN: Configurar previamente reglas de demo: máximo >= 100000 ARGt nominales, aprobación manual desde cero y sin allowlist para los ejemplos';
  end if;
  -- The real destination is read-only and must have a current human wallet receipt.
  if v_live is not null then
    select * into v_contact from public.contacts where company_id=v_company and id=v_live for share;
    if not found then raise exception 'NOT_FOUND: El proveedor para llamada debe pertenecer a Sur Insumos'; end if;
    if v_contact.do_not_contact then raise exception 'FORBIDDEN: El proveedor tiene no-contactar; este artefacto nunca lo modifica'; end if;
    select * into v_profile from public.supplier_profiles where company_id=v_company and contact_id=v_live for share;
    if not found or v_profile.collection_chain is distinct from 'arbitrum' or v_profile.collection_address is null then raise exception 'FORBIDDEN: Una persona debe registrar la billetera de cobro Arbitrum del proveedor'; end if;
    if not exists(select 1 from app_private.action_receipts r where r.company_id=v_company and r.actor_type='user' and r.operation='crm.setSupplierWallet'
      and r.result #>> '{ok}'='true' and r.result #>> '{data,supplier,id}'=v_live::text
      and r.result #>> '{data,supplier,wallet_version}'=v_profile.wallet_version::text
      and r.result #>> '{data,supplier,collection_wallet,chain}'='arbitrum'
      and r.result #>> '{data,supplier,collection_wallet,address}'=v_profile.collection_address) then
      raise exception 'FORBIDDEN: Falta evidencia de la carga humana de la billetera actual; registrar por la UI antes de preparar la demo';
    end if;
    v_slot_status := 'human_supplier_registered_call_pending';
  else v_slot_status := 'real_supplier_pending'; end if;
  v_action := 'demo:sur-insumos:v1:' || v_seed::text;
  select claimed,cached_result into v_claimed,v_cached from app_private.claim_action(v_company,'user',v_actor,v_action,'crm.demo.seedSurInsumos',p);
  if not v_claimed then perform set_config('tratunex_demo.output',v_cached::text,true); return; end if;
  -- New IDs only. A previous/unrelated record is a conflict, never an upsert target.
  if exists(select 1 from public.contacts where id=any(v_contact_ids || array_remove(array[v_placeholder],null)))
    or exists(select 1 from public.contacts where company_id=v_company and phone_e164=any(v_phones))
    or exists(select 1 from public.purchase_requests where id=v_purchase)
    or exists(select 1 from public.supplier_quotes where id=any(v_quote_ids)) then raise exception 'CONFLICT: Un ID o teléfono de fixture ya existe; no se modifica ningún registro'; end if;
  v_label := 'Datos de prueba · Sur Insumos · ' || v_seed::text;
  for v_i in 1..2 loop
    insert into public.contacts(id,company_id,name,organization,phone_e164,website,source,do_not_contact)
      values(v_contact_ids[v_i],v_company,'Proveedor ejemplo ' || v_i || ' · Datos de prueba','Ejemplo ficticio Sur Insumos',v_phones[v_i],null,
        jsonb_build_object('kind','manual','label',v_label,'url',null),true);
    insert into public.supplier_profiles(company_id,contact_id,collection_chain,collection_address,wallet_version,wallet_updated_at)
      values(v_company,v_contact_ids[v_i],'arbitrum','0x' || repeat(v_i::text,40),1,clock_timestamp());
  end loop;
  if v_placeholder is not null then
    insert into public.contacts(id,company_id,name,organization,phone_e164,website,source,do_not_contact)
      values(v_placeholder,v_company,'Pendiente proveedor real · Datos de prueba','No llamar: slot de preparación local',v_phones[3],null,
        jsonb_build_object('kind','manual','label',v_label,'url',null),true);
    insert into public.supplier_profiles(company_id,contact_id,collection_chain,collection_address,wallet_version,wallet_updated_at)
      values(v_company,v_placeholder,'arbitrum','0x' || repeat('3',40),1,clock_timestamp());
  end if;
  insert into public.purchase_requests(id,company_id,product,quantity,unit,needed_by,budget_atomic,zone,created_by)
    values(v_purchase,v_company,'Vasos de papel 240 cc',500,'unidades',v_due,v_budget,'CABA',v_actor);
  for v_i in 1..2 loop
    insert into public.supplier_quotes(id,company_id,purchase_request_id,supplier_contact_id,call_id,source,source_url,can_supply,unit_price,currency,
      price_includes_vat,available_quantity,minimum_order_quantity,lead_time_days,lead_time_text,delivery_included,accepts_argt,payment_terms,notes,summary)
      values(v_quote_ids[v_i],v_company,v_purchase,v_contact_ids[v_i],null,'example',null,'yes',case when v_i=1 then 180 else 200 end,'ARS',
        'yes',1000,100,1,null,'yes','yes',null,'Datos de prueba; no es una oferta externa ni habilita una llamada o pago',v_label || ' · cotización ficticia');
  end loop;
  v_output := jsonb_build_object('company_id',v_company,'purchase_request_id',v_purchase,'example_supplier_ids',to_jsonb(v_contact_ids),'example_quote_ids',to_jsonb(v_quote_ids),
    'live_supplier_contact_id',coalesce(v_live,v_placeholder),'live_slot_status',v_slot_status,'live_quote_id',null,'live_quote_status','pending_external_call',
    'preparation_only',true,'call_started',false,'payment_started',false,'needed_by',v_due::text);
  perform app_private.complete_action(v_company,v_action,v_output);
  perform set_config('tratunex_demo.output',v_output::text,true);
end $$;
