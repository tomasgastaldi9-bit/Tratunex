-- BUY-01 y BUY-02: compras de la pyme y reglas de pago del dueño.
--
-- Idea general (ver src/features/agent/README.md, sección "Compras"):
--   * purchase_requests: una fila por cada compra que necesita la empresa
--     ("500 vasos para el lunes"). Cualquier miembro puede crear una.
--   * purchase_policies: UNA fila por empresa con las reglas con las que el
--     agente paga (máximo por compra, hasta cuánto paga solo, proveedores
--     permitidos). Solo los admin la cambian.
--   * Nadie escribe estas tablas directo: solo las funciones
--     create_purchase_request y save_purchase_policy, que controlan permisos,
--     datos y duplicados en un solo lugar.
--   * La plata se guarda en "unidades mínimas" de ARGt (18 decimales) como
--     numeric(78,0): un número entero enorme y exacto, sin decimales que
--     redondeen. En los JSON viaja siempre como texto ("100000..."), nunca
--     como número, porque JavaScript redondea los números muy grandes.

-- ---------------------------------------------------------------------------
-- Tabla de compras
-- ---------------------------------------------------------------------------

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  -- Si se borra la empresa, se borran sus compras: no tienen sentido solas.
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Qué necesita: "Vasos térmicos de 240 cc". Nunca vacío.
  product text not null check (length(btrim(product)) > 0),
  -- Cuántos: 500. Siempre al menos 1.
  quantity integer not null check (quantity > 0),
  -- Opcional ("unidades", "cajas"). Vacío = unidades.
  unit text not null default '',
  -- Para cuándo lo necesita. Es una fecha sin hora (día de Argentina).
  needed_by date not null,
  -- Presupuesto TOTAL en unidades mínimas de ARGt. Tiene que ser mayor a cero.
  budget_atomic numeric(78, 0) not null check (budget_atomic > 0),
  -- Opcional: dónde tiene que entregar el proveedor ("CABA").
  zone text not null default '',
  -- El MVP solo crea compras abiertas. Si más adelante hay otros estados,
  -- se agregan a esta lista en otra migración.
  status text not null default 'open' check (status in ('open')),
  -- Quién la creó. Si ese usuario se borra, queda null pero la compra sigue.
  created_by uuid references auth.users(id) on delete set null,
  -- now() en timestamptz se guarda siempre en UTC.
  created_at timestamptz not null default now()
);

-- Para buscar rápido las compras de una empresa (y para que borrar una
-- empresa no tenga que recorrer toda la tabla).
create index purchase_requests_company_created_idx
  on public.purchase_requests (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tabla de reglas de pago (una fila por empresa)
-- ---------------------------------------------------------------------------

create table public.purchase_policies (
  -- company_id es la clave: así es imposible que una empresa tenga dos
  -- reglas distintas al mismo tiempo.
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- Ninguna compra puede superar este monto (en unidades mínimas de ARGt).
  max_per_purchase_atomic numeric(78, 0) not null check (max_per_purchase_atomic >= 0),
  -- Hasta este monto el agente paga solo; arriba pide aprobación.
  auto_pay_limit_atomic numeric(78, 0) not null check (auto_pay_limit_atomic >= 0),
  -- true = solo se les paga a los proveedores de la lista.
  only_allowed_suppliers boolean not null default false,
  -- Ids de contactos del CRM (public.contacts) de esta misma empresa.
  -- Es una lista y no una tabla aparte, así que la base no puede poner una
  -- "foreign key": por eso save_purchase_policy revisa cada id a mano.
  allowed_supplier_ids uuid[] not null default '{}',
  -- Quién la cambió por última vez y cuándo.
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Lo que el agente paga solo nunca puede superar el máximo por compra.
  constraint purchase_policies_auto_pay_within_max_check
    check (auto_pay_limit_atomic <= max_per_purchase_atomic)
);

-- ---------------------------------------------------------------------------
-- Permisos de las tablas
-- ---------------------------------------------------------------------------

-- RLS (Row Level Security) hace que cada usuario vea solo las filas que una
-- política le permite. Sin políticas de insert/update/delete, nadie con el
-- rol authenticated puede escribir directo.
alter table public.purchase_requests enable row level security;
alter table public.purchase_policies enable row level security;

-- Primero sacamos todos los permisos y después damos solo el de leer.
-- anon (visitante sin sesión) no recibe nada.
revoke all on public.purchase_requests, public.purchase_policies from public, anon, authenticated;
grant select on public.purchase_requests, public.purchase_policies to authenticated;

-- Admin y vendedor pueden leer las compras de las empresas donde son miembros.
-- El "(select auth.uid())" entre paréntesis hace que Postgres calcule el
-- usuario una sola vez por consulta y no una vez por fila.
create policy "members can read their company purchase requests" on public.purchase_requests
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = purchase_requests.company_id
        and member.user_id = (select auth.uid())
    )
  );

-- Lo mismo para las reglas: el vendedor las puede ver (no cambiar).
create policy "members can read their company purchase policy" on public.purchase_policies
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = purchase_policies.company_id
        and member.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Crear una compra (BUY-01)
-- ---------------------------------------------------------------------------

-- Devuelve {"purchase_request": {...}, "created": true/false}.
--
-- p_request es lo que cargó la persona: product, quantity, unit, needed_by
-- ("AAAA-MM-DD"), budget_atomic (texto) y zone.
--
-- Es "security definer": corre con los permisos del dueño de la función y no
-- con los del usuario. Lo necesitamos porque el usuario no puede escribir la
-- tabla directo ni usar app_private. Por eso mismo la función chequea ella
-- sola quién es el usuario y si es miembro, antes de tocar nada.
--
-- El search_path fijo evita que alguien "esconda" una tabla o función con el
-- mismo nombre en otro esquema. Igual escribimos siempre esquema.nombre.
--
-- Si algo falla en el medio, la excepción deshace TODO lo que hizo la
-- función, incluido el recibo de claim_action. Así el action_id no queda
-- "trabado" a medio guardar.
create function public.create_purchase_request(
  p_company_id uuid,
  p_action_id text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  v_user uuid;
  v_product text;
  v_quantity integer;
  v_unit text;
  v_needed_by date;
  v_budget numeric(78, 0);
  v_zone text;
  v_claimed boolean;
  v_cached_result jsonb;
  v_row public.purchase_requests;
  v_result jsonb;
begin
  -- 1. ¿Quién está creando la compra? auth.uid() sale de la sesión (del
  --    token), no de lo que mande el navegador. Sin sesión, no se crea nada.
  v_user := auth.uid();

  if v_user is null then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: sign in required';
  end if;

  if p_company_id is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: company id is required';
  end if;

  if p_action_id is null or length(btrim(p_action_id)) = 0 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: action id is required';
  end if;

  -- 2. Cualquier miembro de la empresa (admin o vendedor) puede crear una
  --    compra. Alguien de otra empresa, no. Esto va ANTES de mirar los datos
  --    y antes de claim_action, así un extraño nunca recibe un resultado
  --    guardado de otra empresa.
  if not exists (
    select 1 from public.company_members as member
    where member.company_id = p_company_id
      and member.user_id = v_user
  ) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: only company members can create purchase requests';
  end if;

  -- 3. Revisar los datos. El servidor ya los validó con el contrato
  --    (purchaseRequestInputSchema), pero la base vuelve a mirar lo
  --    importante: es la última puerta antes de guardar.
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: request must be a JSON object';
  end if;

  -- Solo estos campos existen. Un campo de más suele ser un error de quien
  -- llama, y no queremos guardarlo en el recibo como si fuera parte de la compra.
  if exists (
    select 1 from jsonb_object_keys(p_request) as field
    where field not in ('product', 'quantity', 'unit', 'needed_by', 'budget_atomic', 'zone')
  ) then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: unexpected field in request';
  end if;

  -- Producto: texto, sin espacios sobrantes, de 1 a 120 caracteres.
  -- (Si falta el campo, jsonb_typeof da null y también cae acá.)
  if jsonb_typeof(p_request -> 'product') is distinct from 'string' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: product must be text';
  end if;

  v_product := btrim(p_request ->> 'product');

  if length(v_product) = 0 or length(v_product) > 120 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: product must have 1 to 120 characters';
  end if;

  -- Cantidad: un número (no un texto) entero entre 1 y 1.000.000.
  -- El "^[0-9]+$" descarta negativos y decimales (por ejemplo 2.5).
  -- Lo pasamos primero a numeric para que un número gigante no rompa el
  -- integer antes de poder compararlo.
  if jsonb_typeof(p_request -> 'quantity') is distinct from 'number'
     or (p_request ->> 'quantity') !~ '^[0-9]+$'
     or (p_request ->> 'quantity')::numeric < 1
     or (p_request ->> 'quantity')::numeric > 1000000 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: quantity must be a whole number between 1 and 1000000';
  end if;

  v_quantity := (p_request ->> 'quantity')::integer;

  -- Unidad: texto opcional (puede ser ""), hasta 30 caracteres.
  if jsonb_typeof(p_request -> 'unit') is distinct from 'string' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: unit must be text';
  end if;

  v_unit := btrim(p_request ->> 'unit');

  if length(v_unit) > 30 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: unit must have at most 30 characters';
  end if;

  -- Fecha: texto "AAAA-MM-DD" que además sea un día que existe (no 30 de
  -- febrero). Si Postgres no la puede leer, avisamos con nuestro mensaje.
  if jsonb_typeof(p_request -> 'needed_by') is distinct from 'string'
     or (p_request ->> 'needed_by') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: needed by must be a date (YYYY-MM-DD)';
  end if;

  begin
    v_needed_by := (p_request ->> 'needed_by')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using
        errcode = '22023',
        message = 'VALIDATION_ERROR: needed by must be a date (YYYY-MM-DD)';
  end;

  -- Presupuesto: TEXTO con un entero de unidades mínimas, mayor a cero.
  -- Si llega como número, lo rechazamos: es la señal de que alguien lo pasó
  -- por un número de JavaScript y pudo haberse redondeado.
  if jsonb_typeof(p_request -> 'budget_atomic') is distinct from 'string'
     or (p_request ->> 'budget_atomic') !~ '^[0-9]+$' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: budget must be a whole number as text';
  end if;

  -- numeric(78,0) entra hasta 78 cifras. Sacamos los ceros de adelante para
  -- contar solo las cifras que valen.
  if length(ltrim(p_request ->> 'budget_atomic', '0')) > 78 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: budget is too large';
  end if;

  v_budget := (p_request ->> 'budget_atomic')::numeric;

  if v_budget <= 0 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: budget must be greater than zero';
  end if;

  -- Zona: texto opcional (puede ser ""), hasta 120 caracteres.
  if jsonb_typeof(p_request -> 'zone') is distinct from 'string' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: zone must be text';
  end if;

  v_zone := btrim(p_request ->> 'zone');

  if length(v_zone) > 120 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: zone must have at most 120 characters';
  end if;

  -- 4. Idempotencia (PLAT-02): si este mismo action_id ya se usó con los
  --    mismos datos (por ejemplo, la persona apretó dos veces o se cortó la
  --    red), devolvemos la MISMA compra de esa vez sin crear otra.
  --    Si se reusa con OTROS datos, claim_action lanza un CONFLICT.
  select claim.claimed, claim.cached_result
    into v_claimed, v_cached_result
    from app_private.claim_action(
      p_company_id,
      'user',
      v_user,
      p_action_id,
      'purchase.create_request',
      p_request
    ) as claim;

  if not v_claimed then
    -- Es la respuesta guardada, con "created" en false: así quien llama sabe
    -- que esta vez no se creó otra compra (lo pide el contrato).
    return v_cached_result || jsonb_build_object('created', false);
  end if;

  -- 5. Guardar la compra.
  insert into public.purchase_requests (
    company_id,
    product,
    quantity,
    unit,
    needed_by,
    budget_atomic,
    zone,
    created_by
  ) values (
    p_company_id,
    v_product,
    v_quantity,
    v_unit,
    v_needed_by,
    v_budget,
    v_zone,
    v_user
  )
  returning * into v_row;

  -- 6. Armar la respuesta con la forma del contrato (purchaseRequestSchema):
  --    el presupuesto como texto, la fecha como "AAAA-MM-DD" y la fecha de
  --    creación en formato ISO en UTC (la "Z" del final quiere decir UTC).
  v_result := jsonb_build_object(
    'purchase_request', jsonb_build_object(
      'id', v_row.id,
      'product', v_row.product,
      'quantity', v_row.quantity,
      'unit', v_row.unit,
      'needed_by', to_char(v_row.needed_by, 'YYYY-MM-DD'),
      'budget_atomic', v_row.budget_atomic::text,
      'zone', v_row.zone,
      'status', v_row.status,
      'created_at', to_char(v_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'created_by', v_row.created_by
    ),
    'created', true
  );

  -- 7. Guardar el resultado en el recibo, para que un reintento con el mismo
  --    action_id reciba esta misma compra.
  perform app_private.complete_action(p_company_id, p_action_id, v_result);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardar las reglas de pago (BUY-02)
-- ---------------------------------------------------------------------------

-- Devuelve {"policy": {...}} con los montos como texto.
--
-- p_policy trae max_per_purchase_atomic (texto), auto_pay_limit_atomic
-- (texto), only_allowed_suppliers (true/false) y allowed_supplier_ids (lista
-- de ids de contactos del CRM).
--
-- Crea la fila de la empresa la primera vez y la REEMPLAZA las siguientes:
-- las reglas valen para todas las compras, no hay historial de versiones.
--
-- Mismo modelo de seguridad que create_purchase_request (security definer,
-- search_path fijo, controles adentro), pero acá solo pueden los admin.
create function public.save_purchase_policy(
  p_company_id uuid,
  p_action_id text,
  p_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  v_user uuid;
  v_max numeric(78, 0);
  v_auto_pay_limit numeric(78, 0);
  v_only_allowed boolean;
  v_supplier_ids uuid[];
  v_claimed boolean;
  v_cached_result jsonb;
  v_row public.purchase_policies;
  v_result jsonb;
begin
  -- 1. Sesión obligatoria (igual que al crear una compra).
  v_user := auth.uid();

  if v_user is null then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: sign in required';
  end if;

  if p_company_id is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: company id is required';
  end if;

  if p_action_id is null or length(btrim(p_action_id)) = 0 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: action id is required';
  end if;

  -- 2. Solo los admin de esa empresa cambian las reglas de pago. El vendedor
  --    las puede ver, pero no cambiar: son las que deciden cuánta plata
  --    puede mover el agente solo.
  if not exists (
    select 1 from public.company_members as member
    where member.company_id = p_company_id
      and member.user_id = v_user
      and member.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: only company admins can edit payment rules';
  end if;

  -- 3. Revisar los datos (el servidor ya los validó con purchasePolicySchema;
  --    la base vuelve a mirar lo importante).
  if p_policy is null or jsonb_typeof(p_policy) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: policy must be a JSON object';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_policy) as field
    where field not in (
      'max_per_purchase_atomic',
      'auto_pay_limit_atomic',
      'only_allowed_suppliers',
      'allowed_supplier_ids'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: unexpected field in policy';
  end if;

  -- Montos: TEXTO con un entero (puede ser "0") que entre en numeric(78,0).
  if jsonb_typeof(p_policy -> 'max_per_purchase_atomic') is distinct from 'string'
     or (p_policy ->> 'max_per_purchase_atomic') !~ '^[0-9]+$'
     or length(ltrim(p_policy ->> 'max_per_purchase_atomic', '0')) > 78 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: max per purchase must be a whole number as text';
  end if;

  if jsonb_typeof(p_policy -> 'auto_pay_limit_atomic') is distinct from 'string'
     or (p_policy ->> 'auto_pay_limit_atomic') !~ '^[0-9]+$'
     or length(ltrim(p_policy ->> 'auto_pay_limit_atomic', '0')) > 78 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: auto pay limit must be a whole number as text';
  end if;

  v_max := (p_policy ->> 'max_per_purchase_atomic')::numeric;
  v_auto_pay_limit := (p_policy ->> 'auto_pay_limit_atomic')::numeric;

  -- Comparamos como numeric (números exactos), no como texto: como texto
  -- "9" sería mayor que "10".
  if v_auto_pay_limit > v_max then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: auto pay limit must not exceed max per purchase';
  end if;

  if jsonb_typeof(p_policy -> 'only_allowed_suppliers') is distinct from 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: only allowed suppliers must be true or false';
  end if;

  v_only_allowed := (p_policy -> 'only_allowed_suppliers')::boolean;

  -- Proveedores: una lista de hasta 100 ids con forma de uuid.
  if jsonb_typeof(p_policy -> 'allowed_supplier_ids') is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: allowed supplier ids must be a list';
  end if;

  if jsonb_array_length(p_policy -> 'allowed_supplier_ids') > 100 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: allowed supplier ids must have at most 100 items';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_policy -> 'allowed_supplier_ids') as item(value)
    where jsonb_typeof(item.value) <> 'string'
       or (item.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: allowed supplier ids must be uuids';
  end if;

  -- Pasamos la lista de JSON a un uuid[] de Postgres, en el mismo orden.
  select coalesce(array_agg(item.value::uuid order by item.position), '{}'::uuid[])
    into v_supplier_ids
    from jsonb_array_elements_text(p_policy -> 'allowed_supplier_ids')
         with ordinality as item(value, position);

  -- Con el filtro prendido y la lista vacía, el agente no le podría pagar a
  -- nadie: es casi seguro un error, así que lo frenamos.
  if v_only_allowed and cardinality(v_supplier_ids) = 0 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: allowed suppliers required';
  end if;

  -- Cada id tiene que ser un contacto del CRM de ESTA empresa. Un id de otra
  -- empresa (o que no existe) da el mismo error, así no se puede usar esta
  -- función para averiguar contactos ajenos.
  if exists (
    select 1 from unnest(v_supplier_ids) as supplier(id)
    where not exists (
      select 1 from public.contacts as contact
      where contact.company_id = p_company_id
        and contact.id = supplier.id
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: unknown supplier';
  end if;

  -- 4. Idempotencia: mismo action_id y mismos datos devuelve lo de esa vez;
  --    mismo action_id con otros datos da CONFLICT.
  select claim.claimed, claim.cached_result
    into v_claimed, v_cached_result
    from app_private.claim_action(
      p_company_id,
      'user',
      v_user,
      p_action_id,
      'purchase.save_policy',
      p_policy
    ) as claim;

  if not v_claimed then
    return v_cached_result;
  end if;

  -- 5. Crear o reemplazar la fila de la empresa. "on conflict (company_id)"
  --    quiere decir: si ya hay una fila con esta empresa, en vez de fallar,
  --    actualizala con los valores nuevos ("excluded" son los que intentamos
  --    insertar). Así dos guardados al mismo tiempo nunca crean dos filas.
  insert into public.purchase_policies as policy (
    company_id,
    max_per_purchase_atomic,
    auto_pay_limit_atomic,
    only_allowed_suppliers,
    allowed_supplier_ids,
    updated_by,
    updated_at
  ) values (
    p_company_id,
    v_max,
    v_auto_pay_limit,
    v_only_allowed,
    v_supplier_ids,
    v_user,
    now()
  )
  on conflict (company_id) do update set
    max_per_purchase_atomic = excluded.max_per_purchase_atomic,
    auto_pay_limit_atomic = excluded.auto_pay_limit_atomic,
    only_allowed_suppliers = excluded.only_allowed_suppliers,
    allowed_supplier_ids = excluded.allowed_supplier_ids,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_row;

  -- 6. Respuesta con la forma del contrato (purchasePolicySchema): montos
  --    como texto y la lista de ids como lista de textos.
  v_result := jsonb_build_object(
    'policy', jsonb_build_object(
      'max_per_purchase_atomic', v_row.max_per_purchase_atomic::text,
      'auto_pay_limit_atomic', v_row.auto_pay_limit_atomic::text,
      'only_allowed_suppliers', v_row.only_allowed_suppliers,
      'allowed_supplier_ids', to_jsonb(v_row.allowed_supplier_ids)
    )
  );

  -- 7. Guardar el resultado en el recibo para los reintentos.
  perform app_private.complete_action(p_company_id, p_action_id, v_result);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------

-- Por defecto Postgres deja que cualquiera ejecute una función nueva. Lo
-- sacamos y dejamos solo a los usuarios con sesión (authenticated).
revoke all on function public.create_purchase_request(uuid, text, jsonb) from public, anon;
grant execute on function public.create_purchase_request(uuid, text, jsonb) to authenticated;

revoke all on function public.save_purchase_policy(uuid, text, jsonb) from public, anon;
grant execute on function public.save_purchase_policy(uuid, text, jsonb) to authenticated;
