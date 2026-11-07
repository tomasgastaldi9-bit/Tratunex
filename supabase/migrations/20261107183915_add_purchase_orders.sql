-- ORD-03 proposal only. Tomás coordinates the shared migration and PAY review.
-- Requires PLAT-02/03, CRM-03, ORD-01, BUY-01/02 and QUO-02's supplier_quotes.
begin;
do $$ begin
  if to_regclass('public.supplier_quotes') is null then
    raise exception 'PROVIDER_UNAVAILABLE: QUO-02 supplier_quotes must be installed before the orders proposal';
  end if;
  if to_regclass('public.purchase_requests') is null or to_regclass('public.purchase_policies') is null
    or to_regclass('public.supplier_profiles') is null then
    raise exception 'PROVIDER_UNAVAILABLE: BUY-01/02 and ORD-01 must be installed first';
  end if;
end $$;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  purchase_request_id uuid not null references public.purchase_requests(id),
  supplier_quote_id uuid not null,
  supplier_contact_id uuid not null,
  product text not null check(length(btrim(product)) > 0),
  quantity integer not null check(quantity between 1 and 1000000),
  unit text not null,
  supplier_name text not null check(length(btrim(supplier_name)) > 0),
  quote_source text not null check(quote_source in ('call','web','example')),
  quoted_unit_price numeric not null check(quoted_unit_price > 0),
  quoted_total numeric not null check(quoted_total > 0),
  quoted_currency text not null check(quoted_currency in ('ARS','USD','ARGt')),
  amount_atomic numeric(78,0) check(amount_atomic > 0 and amount_atomic < 115792089237316195423570985008687907853269984665640564039457584007913129639936),
  pricing_status text not null check(pricing_status in ('ready','pending_conversion')),
  status text not null default 'awaiting_approval' check(status in ('awaiting_approval','approved')),
  version integer not null default 1 check(version > 0),
  wallet_chain text check(wallet_chain in ('base','arbitrum')),
  wallet_address text check(wallet_address ~ '^0x[0-9a-fA-F]{40}$' and wallet_address <> '0x0000000000000000000000000000000000000000'),
  wallet_version integer not null check(wallet_version >= 0),
  quote_snapshot jsonb not null check(jsonb_typeof(quote_snapshot) = 'object'),
  request_snapshot jsonb not null check(jsonb_typeof(request_snapshot) = 'object'),
  supplier_snapshot jsonb not null check(jsonb_typeof(supplier_snapshot) = 'object'),
  policy_snapshot jsonb check(policy_snapshot is null or jsonb_typeof(policy_snapshot) = 'object'),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,supplier_quote_id),
  foreign key(company_id,supplier_quote_id) references public.supplier_quotes(company_id,id),
  foreign key(company_id,supplier_contact_id) references public.supplier_profiles(company_id,contact_id),
  check((wallet_chain is null) = (wallet_address is null)),
  check((pricing_status = 'ready') = (amount_atomic is not null)),
  constraint purchase_orders_ready_currency_check check(pricing_status <> 'ready' or quoted_currency in ('ARS','ARGt')),
  check((status = 'approved') = (approved_by is not null and approved_at is not null)),
  check(status = 'approved' or (approved_by is null and approved_at is null)),
  check(status <> 'approved' or (pricing_status = 'ready' and wallet_chain = 'arbitrum' and wallet_address is not null and quote_source <> 'example'))
);
create index purchase_orders_company_created_idx on public.purchase_orders(company_id,created_at desc,id desc);
alter table public.purchase_orders enable row level security;
revoke all on public.purchase_orders from public,anon,authenticated,service_role;
grant select on public.purchase_orders to authenticated,service_role;
create policy purchase_orders_member_read on public.purchase_orders for select to authenticated
  using(exists(select 1 from public.company_members m where m.company_id = purchase_orders.company_id and m.user_id = (select auth.uid())));

create function app_private.purchase_order_dto(p public.purchase_orders) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',p.id,'company_id',p.company_id,'purchase_request_id',p.purchase_request_id,
    'supplier_quote_id',p.supplier_quote_id,'supplier_contact_id',p.supplier_contact_id,
    'product',p.product,'quantity',p.quantity,'unit',p.unit,'supplier_name',p.supplier_name,'quote_source',p.quote_source,
    'quoted_unit_price',trim_scale(p.quoted_unit_price)::text,'quoted_total',trim_scale(p.quoted_total)::text,'quoted_currency',p.quoted_currency,
    'amount_atomic',p.amount_atomic::text,'pricing_status',p.pricing_status,'status',p.status,'version',p.version,
    'wallet',case when p.wallet_chain is null then 'null'::jsonb else jsonb_build_object('chain',p.wallet_chain,'address',p.wallet_address) end,
    'wallet_version',p.wallet_version,'approved_by',p.approved_by,
    'approved_at',case when p.approved_at is null then null else to_char(p.approved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;

-- Internal snapshot only. Row locks keep the approval check coherent to commit.
create function app_private.purchase_order_context(p_company uuid,p_quote uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare v_quote jsonb; v_request jsonb; v_contact jsonb; v_profile jsonb; v_policy jsonb;
  v_unit numeric; v_total numeric; v_amount numeric; v_currency text; v_pricing text;
begin
  select to_jsonb(q) into v_quote from public.supplier_quotes q where q.company_id = p_company and q.id = p_quote for share;
  if not found then raise exception 'NOT_FOUND: Cotización no disponible en esta empresa'; end if;
  if v_quote ->> 'purchase_request_id' is null then raise exception 'VALIDATION_ERROR: La cotización no corresponde a una compra'; end if;
  select to_jsonb(r) into v_request from public.purchase_requests r
    where r.company_id = p_company and r.id = (v_quote ->> 'purchase_request_id')::uuid for share;
  if not found then raise exception 'NOT_FOUND: Compra no disponible en esta empresa'; end if;
  if v_request ->> 'status' <> 'open' then raise exception 'CONFLICT: La compra ya no está abierta'; end if;
  if (v_request ->> 'quantity') !~ '^[1-9][0-9]*$' or (v_request ->> 'quantity')::numeric > 1000000 then raise exception 'VALIDATION_ERROR: Cantidad de compra inválida'; end if;
  select to_jsonb(s) into v_profile from public.supplier_profiles s
    where s.company_id = p_company and s.contact_id = (v_quote ->> 'supplier_contact_id')::uuid for share;
  if not found then raise exception 'NOT_FOUND: El contacto debe estar registrado como proveedor'; end if;
  select to_jsonb(c) into v_contact from public.contacts c
    where c.company_id = p_company and c.id = (v_quote ->> 'supplier_contact_id')::uuid for share;
  if not found then raise exception 'NOT_FOUND: Proveedor no disponible en esta empresa'; end if;
  select to_jsonb(p) into v_policy from public.purchase_policies p where p.company_id = p_company for share;
  v_currency := v_quote ->> 'currency';
  if v_currency is null or v_currency not in ('ARS','USD','ARGt') or coalesce(v_quote ->> 'unit_price','') !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'VALIDATION_ERROR: La cotización necesita precio positivo y moneda confirmada';
  end if;
  v_unit := (v_quote ->> 'unit_price')::numeric;
  if v_unit <= 0 then raise exception 'VALIDATION_ERROR: El precio debe ser mayor a cero'; end if;
  v_total := v_unit * (v_request ->> 'quantity')::numeric;
  v_pricing := 'pending_conversion';
  -- Published purchase convention: ARS settles nominally 1:1 in ARGt. No market FX.
  if v_currency in ('ARS','ARGt') then
    v_amount := v_total * 1000000000000000000::numeric;
    if trunc(v_amount) <> v_amount or v_amount <= 0 or v_amount >= 115792089237316195423570985008687907853269984665640564039457584007913129639936::numeric then
      raise exception 'VALIDATION_ERROR: El total ARGt debe ser un entero de 18 decimales dentro de uint256';
    end if;
    v_pricing := 'ready';
  end if;
  return jsonb_build_object('quote',v_quote,'request',v_request,'supplier',jsonb_build_object('contact',v_contact,'profile',v_profile),'policy',v_policy,
    'unit_price',v_unit::text,'total',v_total::text,'currency',v_currency,'amount_atomic',trim_scale(v_amount)::text,'pricing_status',v_pricing);
end; $$;

create function app_private.orders_execute_internal(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_actor uuid; v_type text; v_action text; v_quote_id uuid; v_expected integer;
  v_order public.purchase_orders; v_created boolean := false;
  v_claimed boolean; v_cached jsonb; v_result jsonb; v_context jsonb; v_policy jsonb; v_quote jsonb;
  v_items jsonb := '[]'::jsonb; v_limit integer := 50; v_role text;
  v_error text; v_error_code text; v_retryable boolean;
begin
  perform app_private.contact_shape(p_ctx,array['company_id','actor_type','actor_id','action_id'],array['company_id','actor_type','actor_id']);
  v_company := app_private.contact_text(p_ctx,'company_id')::uuid;
  v_actor := app_private.contact_text(p_ctx,'actor_id')::uuid;
  v_type := app_private.contact_text(p_ctx,'actor_type');
  if v_type = 'user' then
    if auth.uid() is distinct from v_actor then raise exception 'FORBIDDEN: La persona no coincide con la sesión'; end if;
    select role into v_role from public.company_members where company_id = v_company and user_id = v_actor for share;
    if not found then raise exception 'FORBIDDEN: Se requiere membresía vigente de la empresa'; end if;
  elsif v_type in ('voice','system') then
    if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: Se requieren credenciales de servidor'; end if;
    if not exists(select 1 from public.companies where id = v_company) then raise exception 'NOT_FOUND: Empresa no disponible'; end if;
  else raise exception 'FORBIDDEN: Actor no admitido'; end if;

  if p_operation = 'getPurchaseOrder' then
    perform app_private.contact_shape(p_input,array['order_id'],array['order_id']);
    select * into v_order from public.purchase_orders where company_id = v_company and id = app_private.contact_text(p_input,'order_id')::uuid;
    if not found then raise exception 'NOT_FOUND: Orden no disponible en esta empresa'; end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('order',app_private.purchase_order_dto(v_order)));
  elsif p_operation = 'listPurchaseOrders' then
    perform app_private.contact_shape(p_input,array['limit'],array[]::text[]);
    if p_input ? 'limit' then
      if jsonb_typeof(p_input -> 'limit') is distinct from 'number' or (p_input ->> 'limit') !~ '^[0-9]+$' then raise exception 'VALIDATION_ERROR: Límite inválido'; end if;
      v_limit := (p_input ->> 'limit')::integer;
    end if;
    if v_limit < 1 or v_limit > 100 then raise exception 'VALIDATION_ERROR: El límite debe estar entre 1 y 100'; end if;
    for v_order in select * from public.purchase_orders where company_id = v_company order by created_at desc,id desc limit v_limit
    loop v_items := v_items || jsonb_build_array(app_private.purchase_order_dto(v_order)); end loop;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('items',v_items));
  end if;

  if p_operation not in ('createPurchaseOrder','approvePurchaseOrder','refreshPurchaseOrder') or p_operation is null then raise exception 'VALIDATION_ERROR: Operación de órdenes no admitida'; end if;
  if v_type <> 'user' then raise exception 'FORBIDDEN: Una persona debe crear o aprobar esta orden'; end if;
  if p_operation in ('approvePurchaseOrder','refreshPurchaseOrder') and v_role <> 'admin' then raise exception 'FORBIDDEN: Solo un administrador puede aprobar o actualizar la orden'; end if;
  v_action := app_private.contact_text(p_ctx,'action_id');
  select claimed,cached_result into v_claimed,v_cached from app_private.claim_action(v_company,v_type,v_actor,v_action,'crm.' || p_operation,p_input);
  if not v_claimed then return v_cached; end if;
  if p_operation = 'createPurchaseOrder' then
    perform app_private.contact_shape(p_input,array['supplier_quote_id'],array['supplier_quote_id']);
    v_quote_id := app_private.contact_text(p_input,'supplier_quote_id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended('crm.order:' || v_company::text || ':' || v_quote_id::text,0));
    select * into v_order from public.purchase_orders where company_id = v_company and supplier_quote_id = v_quote_id for update;
    if not found then
      v_context := app_private.purchase_order_context(v_company,v_quote_id);
      insert into public.purchase_orders(company_id,purchase_request_id,supplier_quote_id,supplier_contact_id,product,quantity,unit,supplier_name,quote_source,
        quoted_unit_price,quoted_total,quoted_currency,amount_atomic,pricing_status,wallet_chain,wallet_address,wallet_version,
        quote_snapshot,request_snapshot,supplier_snapshot,policy_snapshot,created_by)
      values(v_company,(v_context #>> '{request,id}')::uuid,v_quote_id,(v_context #>> '{quote,supplier_contact_id}')::uuid,
        v_context #>> '{request,product}',(v_context #>> '{request,quantity}')::integer,v_context #>> '{request,unit}',
        coalesce(nullif(v_context #>> '{supplier,contact,organization}',''),v_context #>> '{supplier,contact,name}'),v_context #>> '{quote,source}',
        (v_context ->> 'unit_price')::numeric,(v_context ->> 'total')::numeric,v_context ->> 'currency',(v_context ->> 'amount_atomic')::numeric,
        v_context ->> 'pricing_status',v_context #>> '{supplier,profile,collection_chain}',v_context #>> '{supplier,profile,collection_address}',
        (v_context #>> '{supplier,profile,wallet_version}')::integer,v_context -> 'quote',v_context -> 'request',v_context -> 'supplier',nullif(v_context -> 'policy','null'::jsonb),v_actor)
      returning * into v_order;
      v_created := true;
    end if;
  else
    perform app_private.contact_shape(p_input,array['order_id','expected_version'],array['order_id','expected_version']);
    if jsonb_typeof(p_input -> 'expected_version') is distinct from 'number' or (p_input ->> 'expected_version') !~ '^[1-9][0-9]*$' then raise exception 'VALIDATION_ERROR: Versión de orden inválida'; end if;
    v_expected := (p_input ->> 'expected_version')::integer;
    select * into v_order from public.purchase_orders where company_id = v_company and id = app_private.contact_text(p_input,'order_id')::uuid for update;
    if not found then raise exception 'NOT_FOUND: Orden no disponible en esta empresa'; end if;
    if v_order.version <> v_expected then raise exception 'CONFLICT: La orden cambió; consultá su versión actual'; end if;
    if v_order.status <> 'awaiting_approval' then raise exception 'CONFLICT: Una orden aprobada ya no puede modificarse ni aprobarse otra vez'; end if;
    v_context := app_private.purchase_order_context(v_company,v_order.supplier_quote_id);
    if p_operation = 'refreshPurchaseOrder' then
      update public.purchase_orders set purchase_request_id = (v_context #>> '{request,id}')::uuid,supplier_contact_id = (v_context #>> '{quote,supplier_contact_id}')::uuid,
        product = v_context #>> '{request,product}',quantity = (v_context #>> '{request,quantity}')::integer,unit = v_context #>> '{request,unit}',
        supplier_name = coalesce(nullif(v_context #>> '{supplier,contact,organization}',''),v_context #>> '{supplier,contact,name}'),quote_source = v_context #>> '{quote,source}',
        quoted_unit_price = (v_context ->> 'unit_price')::numeric,quoted_total = (v_context ->> 'total')::numeric,quoted_currency = v_context ->> 'currency',
        amount_atomic = (v_context ->> 'amount_atomic')::numeric,pricing_status = v_context ->> 'pricing_status',wallet_chain = v_context #>> '{supplier,profile,collection_chain}',
        wallet_address = v_context #>> '{supplier,profile,collection_address}',wallet_version = (v_context #>> '{supplier,profile,wallet_version}')::integer,
        quote_snapshot = v_context -> 'quote',request_snapshot = v_context -> 'request',supplier_snapshot = v_context -> 'supplier',policy_snapshot = nullif(v_context -> 'policy','null'::jsonb),
        version = version + 1,updated_at = clock_timestamp() where company_id = v_company and id = v_order.id returning * into v_order;
    else
      if v_order.quote_snapshot is distinct from v_context -> 'quote' or v_order.request_snapshot is distinct from v_context -> 'request'
        or v_order.supplier_snapshot is distinct from v_context -> 'supplier' or v_order.policy_snapshot is distinct from nullif(v_context -> 'policy','null'::jsonb) then
        raise exception 'CONFLICT: Cambiaron la cotización, compra, proveedor, billetera o reglas; actualizá explícitamente la orden y revisala de nuevo';
      end if;
      if v_order.pricing_status <> 'ready' or v_order.amount_atomic is null then raise exception 'FORBIDDEN: Falta monto listo; actualizá ARS/ARGt nominal o acordá la conversión de USD'; end if;
      if v_order.wallet_chain is distinct from 'arbitrum' or v_order.wallet_address is null then raise exception 'FORBIDDEN: Se requiere una billetera de cobro configurada en Arbitrum'; end if;
      v_quote := v_context -> 'quote';
      if v_quote ->> 'source' = 'example' then raise exception 'FORBIDDEN: Una cotización de ejemplo no autoriza una orden real'; end if;
      if v_quote ->> 'accepts_argt' is distinct from 'yes' then raise exception 'FORBIDDEN: El proveedor debe confirmar que acepta ARGt'; end if;
      if v_quote ->> 'can_supply' not in ('yes','partial') or (v_quote ->> 'can_supply' = 'partial' and v_quote ->> 'available_quantity' is null)
        or (v_quote ->> 'available_quantity' is not null and (v_quote ->> 'available_quantity')::numeric < v_order.quantity)
        or (v_quote ->> 'minimum_order_quantity' is not null and (v_quote ->> 'minimum_order_quantity')::numeric > v_order.quantity) then
        raise exception 'FORBIDDEN: La disponibilidad o el mínimo de compra no cubren esta orden';
      end if;
      v_policy := nullif(v_context -> 'policy','null'::jsonb);
      if v_policy is null then raise exception 'FORBIDDEN: Una persona debe configurar las reglas de pago de la empresa'; end if;
      if v_order.amount_atomic > (v_policy ->> 'max_per_purchase_atomic')::numeric
        or v_order.amount_atomic > (v_context #>> '{request,budget_atomic}')::numeric then raise exception 'FORBIDDEN: El monto supera el máximo por compra o su presupuesto'; end if;
      if (v_policy ->> 'only_allowed_suppliers')::boolean and not (v_policy -> 'allowed_supplier_ids' ? v_order.supplier_contact_id::text) then raise exception 'FORBIDDEN: El proveedor no está permitido por las reglas del dueño'; end if;
      update public.purchase_orders set status = 'approved',approved_by = v_actor,approved_at = clock_timestamp(),version = version + 1,updated_at = clock_timestamp()
        where company_id = v_company and id = v_order.id returning * into v_order;
    end if;
  end if;
  v_result := jsonb_build_object('ok',true,'data',jsonb_build_object('order',app_private.purchase_order_dto(v_order)));
  if p_operation = 'createPurchaseOrder' then v_result := jsonb_set(v_result,'{data,created}',to_jsonb(v_created)); end if;
  perform app_private.complete_action(v_company,v_action,v_result);
  return v_result;
exception when others then
  get stacked diagnostics v_error = message_text;
  v_error_code := split_part(v_error,':',1);
  if v_error_code not in ('VALIDATION_ERROR','NOT_FOUND','FORBIDDEN','CONFLICT','PROVIDER_ERROR','PROVIDER_UNAVAILABLE','RATE_LIMITED') then
    v_error_code := case when sqlstate in ('22P02','22007','22008','22003','23502','23514') then 'VALIDATION_ERROR'
      when sqlstate in ('23505','23503','40001','40P01') then 'CONFLICT' else 'PROVIDER_ERROR' end;
    v_error := case when v_error_code = 'VALIDATION_ERROR' then 'Datos inválidos para la orden'
      when v_error_code = 'CONFLICT' then 'Los datos cambiaron; revisá la orden antes de reintentar' else 'No se pudo completar la operación de órdenes' end;
  else v_error := btrim(substring(v_error from length(v_error_code) + 2)); end if;
  v_retryable := v_error_code = 'PROVIDER_UNAVAILABLE' or sqlstate in ('40001','40P01');
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code',v_error_code,'message',v_error,'retryable',v_retryable));
end; $$;

revoke all on function app_private.purchase_order_dto(public.purchase_orders),app_private.purchase_order_context(uuid,uuid),app_private.orders_execute_internal(jsonb,text,jsonb)
  from public,anon,authenticated,service_role;
grant usage on schema app_private to authenticated,service_role;
grant execute on function app_private.orders_execute_internal(jsonb,text,jsonb) to authenticated,service_role;
create function public.orders_execute(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select app_private.orders_execute_internal(p_ctx,p_operation,p_input); $$;
revoke all on function public.orders_execute(jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.orders_execute(jsonb,text,jsonb) to authenticated,service_role;
commit;
