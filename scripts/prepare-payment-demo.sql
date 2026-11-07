-- One-off, user-authorized synthetic demo. Run only after reviewing the target
-- and installing the demo migration. This creates NO payment or signed data.
-- It refuses to overwrite existing payment rules or a prior demo authorization.
do $$
declare
  v_company uuid; v_actor uuid; v_contact uuid; v_request uuid; v_quote uuid; v_order uuid;
  v_context jsonb; v_policy public.purchase_policies;
begin
  select id into strict v_company from public.companies where name='Tratunex (empresa de prueba)';
  select u.id into strict v_actor from auth.users u join public.company_members m on m.user_id=u.id
    where m.company_id=v_company and m.role='admin' and u.email='tomasgastaldi9@gmail.com';
  if exists(select 1 from app_private.demo_payment_authorizations) then raise exception 'Demo scope already exists; inspect before proceeding'; end if;
  if exists(select 1 from public.contacts where company_id=v_company and phone_e164='+12025550109') then raise exception 'Demo contact number already exists'; end if;
  insert into public.contacts(company_id,name,organization,phone_e164,source,do_not_contact)
    values(v_company,'Proveedor ficticio · demo','Proveedor de prueba','+12025550109',jsonb_build_object('kind','manual','label','Datos ficticios de demo','url',null),true)
    returning id into v_contact;
  insert into public.supplier_profiles(company_id,contact_id,collection_chain,collection_address,wallet_version,wallet_updated_at)
    values(v_company,v_contact,'arbitrum','0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1',1,clock_timestamp());
  insert into public.purchase_requests(company_id,product,quantity,unit,needed_by,budget_atomic,zone,created_by)
    values(v_company,'Producto ficticio · demo',1,'unidad',current_date + 1,1000000000000000000,'Demo',v_actor) returning id into v_request;
  insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,updated_by)
    values(v_company,1000000000000000000,0,false,v_actor) on conflict (company_id) do nothing;
  select * into v_policy from public.purchase_policies where company_id=v_company for share;
  if v_policy.max_per_purchase_atomic < 1000000000000000000 or (v_policy.only_allowed_suppliers and not v_contact=any(v_policy.allowed_supplier_ids)) then
    raise exception 'Existing company policy does not permit this demo; no data changed';
  end if;
  insert into public.supplier_quotes(company_id,purchase_request_id,supplier_contact_id,source,can_supply,unit_price,currency,accepts_argt,summary)
    values(v_company,v_request,v_contact,'example','yes',1,'ARS','yes','Cotización ficticia para demo de 1 ARGt; no es una oferta real.') returning id into v_quote;
  v_context := app_private.purchase_order_context(v_company,v_quote);
  insert into public.purchase_orders(company_id,purchase_request_id,supplier_quote_id,supplier_contact_id,product,quantity,unit,supplier_name,quote_source,
    quoted_unit_price,quoted_total,quoted_currency,amount_atomic,pricing_status,wallet_chain,wallet_address,wallet_version,quote_snapshot,request_snapshot,supplier_snapshot,policy_snapshot,created_by)
  values(v_company,v_request,v_quote,v_contact,'Producto ficticio · demo',1,'unidad','Proveedor de prueba','example',1,1,'ARS',1000000000000000000,'ready',
    'arbitrum','0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1',1,v_context->'quote',v_context->'request',v_context->'supplier',nullif(v_context->'policy','null'::jsonb),v_actor)
    returning id into v_order;
  insert into app_private.demo_payment_authorizations(company_id,order_id,actor_id,sender,destination,active)
    values(v_company,v_order,v_actor,'0xd87f54a9bae54e4ee15a141d526532777f3d2c56','0x4e5f932fa2d1be48a4fc39a80cd2ec85c8aa5bb1',false);
end $$;
