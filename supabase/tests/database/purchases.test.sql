-- Pruebas de BUY-01 y BUY-02: compras (create_purchase_request) y reglas de
-- pago (save_purchase_policy).
--
-- Lo más importante que cuidan estas pruebas:
--   * cualquier miembro crea compras, pero nadie de otra empresa las ve ni crea;
--   * un reintento con el mismo action_id no duplica la compra;
--   * solo un admin cambia las reglas, y solo con proveedores de SU empresa;
--   * la plata siempre vuelve como texto, nunca como número.
--
-- Todo corre dentro de una transacción y al final se hace rollback: así las
-- pruebas no dejan basura en la base y se pueden correr las veces que sea.
begin;
select plan(69);

-- ---------------------------------------------------------------------------
-- Datos de prueba (se cargan con el rol del test, que puede escribir todo)
-- ---------------------------------------------------------------------------
-- Ids propios, distintos a los de las otras pruebas, para no mezclar datos.
--   A = admin de Empresa A
--   V = vendedor de Empresa A (crea compras, ve las reglas, no las cambia)
--   B = admin de Empresa B (no tiene nada que ver con Empresa A)
insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'compras-admin-a@example.test'),
  ('c1000000-0000-4000-8000-000000000002', 'compras-vendedor-a@example.test'),
  ('c2000000-0000-4000-8000-000000000001', 'compras-admin-b@example.test');
insert into public.companies (id, name) values
  ('77777777-7777-4777-8777-777777777777', 'Empresa A (compras)'),
  ('88888888-8888-4888-8888-888888888888', 'Empresa B (compras)');
insert into public.company_members (company_id, user_id, role) values
  ('77777777-7777-4777-8777-777777777777', 'c1000000-0000-4000-8000-000000000001', 'admin'),
  ('77777777-7777-4777-8777-777777777777', 'c1000000-0000-4000-8000-000000000002', 'vendedor'),
  ('88888888-8888-4888-8888-888888888888', 'c2000000-0000-4000-8000-000000000001', 'admin');

-- Proveedores en el CRM: dos de Empresa A y uno de Empresa B.
insert into public.contacts (id, company_id, name, organization, phone_e164, source) values
  ('d1000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777',
   'Vasos del Sur', 'Vasos del Sur SRL', '+5491100000001', '{"kind":"manual","label":"Carga manual","url":null}'::jsonb),
  ('d1000000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777',
   'Plásticos Oeste', null, '+5491100000002', '{"kind":"manual","label":"Carga manual","url":null}'::jsonb),
  ('d2000000-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888',
   'Proveedor de B', null, '+5491100000003', '{"kind":"manual","label":"Carga manual","url":null}'::jsonb);

-- A partir de acá actuamos como un usuario logueado (rol authenticated).
-- request.jwt.claim.sub es lo que lee auth.uid() para saber quién es.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);

-- ---------------------------------------------------------------------------
-- BUY-01: un miembro (acá el vendedor) crea una compra
-- ---------------------------------------------------------------------------

-- Guardamos la respuesta en una variable de la transacción ('compras.primera')
-- para poder revisarla en varias pruebas sin volver a llamar a la función.
-- 100000 ARGt = 100000 * 10^18 unidades mínimas.
select lives_ok(
  $$select set_config('compras.primera', public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-1',
    '{"product":"Vasos térmicos de 240 cc","quantity":500,"unit":"unidades","needed_by":"2026-11-09","budget_atomic":"100000000000000000000000","zone":"CABA"}'::jsonb
  )::text, true)$$,
  'V (vendedor) puede crear una compra'
);

select is(
  current_setting('compras.primera')::jsonb -> 'created',
  'true'::jsonb,
  'la respuesta dice created: true'
);

select is(
  (current_setting('compras.primera')::jsonb -> 'purchase_request') - 'id' - 'created_at',
  '{"product":"Vasos térmicos de 240 cc","quantity":500,"unit":"unidades","needed_by":"2026-11-09","budget_atomic":"100000000000000000000000","zone":"CABA","status":"open","created_by":"c1000000-0000-4000-8000-000000000002"}'::jsonb,
  'devuelve la compra con el presupuesto como texto, la fecha AAAA-MM-DD, estado open y quién la creó'
);

select ok(
  (current_setting('compras.primera')::jsonb #>> '{purchase_request,created_at}')
    ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$',
  'created_at viene en formato ISO en UTC'
);

-- V la puede leer directo de la tabla (RLS de lectura para miembros), y el
-- presupuesto quedó exacto, sin redondeos.
select is(
  (select budget_atomic from public.purchase_requests
    where id = (current_setting('compras.primera')::jsonb #>> '{purchase_request,id}')::uuid),
  100000000000000000000000::numeric,
  'V lee su compra y el presupuesto se guardó exacto'
);

-- Reintento (como si se hubiera cortado la red): mismo action_id y mismos
-- datos devuelve la MISMA compra, con created: false.
select lives_ok(
  $$select set_config('compras.reintento', public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-1',
    '{"product":"Vasos térmicos de 240 cc","quantity":500,"unit":"unidades","needed_by":"2026-11-09","budget_atomic":"100000000000000000000000","zone":"CABA"}'::jsonb
  )::text, true)$$,
  'el reintento con el mismo action_id no falla'
);

select is(
  current_setting('compras.reintento')::jsonb -> 'purchase_request',
  current_setting('compras.primera')::jsonb -> 'purchase_request',
  'el reintento devuelve la misma compra (mismo id)'
);

select is(
  current_setting('compras.reintento')::jsonb -> 'created',
  'false'::jsonb,
  'el reintento dice created: false'
);

select is(
  (select count(*) from public.purchase_requests
    where company_id = '77777777-7777-4777-8777-777777777777'),
  1::bigint,
  'el reintento no duplica la compra'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-1',
    '{"product":"Vasos térmicos de 240 cc","quantity":600,"unit":"unidades","needed_by":"2026-11-09","budget_atomic":"100000000000000000000000","zone":"CABA"}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'mismo action_id con otros datos da CONFLICT'
);

-- El admin también puede crear. Unidad y zona son opcionales (texto vacío),
-- y los espacios sobrantes del producto se sacan.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

select is(
  (public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-2',
    '{"product":"  Servilletas  ","quantity":1,"unit":"","needed_by":"2026-12-01","budget_atomic":"5000000000000000000000","zone":""}'::jsonb
  ) -> 'purchase_request') - 'id' - 'created_at',
  '{"product":"Servilletas","quantity":1,"unit":"","needed_by":"2026-12-01","budget_atomic":"5000000000000000000000","zone":"","status":"open","created_by":"c1000000-0000-4000-8000-000000000001"}'::jsonb,
  'A (admin) crea una compra sin unidad ni zona'
);

-- ---------------------------------------------------------------------------
-- BUY-01: datos inválidos
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-1', '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: request must be a JSON object',
  'una lista en vez de un objeto da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-2',
    '{"product":"   ","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: product must have 1 to 120 characters',
  'un producto vacío da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-3',
    '{"quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: product must be text',
  'sin producto da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-4',
    '{"product":"Vasos","quantity":0,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: quantity must be a whole number between 1 and 1000000',
  'cantidad 0 da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-5',
    '{"product":"Vasos","quantity":2.5,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: quantity must be a whole number between 1 and 1000000',
  'una cantidad con decimales da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-6',
    '{"product":"Vasos","quantity":"500","unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: quantity must be a whole number between 1 and 1000000',
  'una cantidad como texto da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-7',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-02-30","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: needed by must be a date (YYYY-MM-DD)',
  'una fecha que no existe (30 de febrero) da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-8',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"09/11/2026","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: needed by must be a date (YYYY-MM-DD)',
  'una fecha con otro formato da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-9',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":1000,"zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: budget must be a whole number as text',
  'un presupuesto como número (no texto) da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-10',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000.5","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: budget must be a whole number as text',
  'un presupuesto con decimales da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-11',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"0","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: budget must be greater than zero',
  'un presupuesto de 0 da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-12',
    '{"product":"Vasos","quantity":500,"needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: unit must be text',
  'sin el campo unidad da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-bad-13',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":"","company_id":"88888888-8888-4888-8888-888888888888"}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: unexpected field in request',
  'un campo de más (por ejemplo otra empresa) da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', '   ',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: action id is required',
  'un action_id vacío da VALIDATION_ERROR'
);

-- ---------------------------------------------------------------------------
-- BUY-01: sin sesión u otra empresa no crean ni ven
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-no-session',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: sign in required',
  'sin usuario en la sesión no se puede crear una compra'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-b',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company members can create purchase requests',
  'B (otra empresa) no puede crear una compra en Empresa A'
);

-- Aunque B use el mismo action_id que usó V, no recibe la compra de A: el
-- control de empresa va antes del recibo guardado.
select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-1',
    '{"product":"Vasos térmicos de 240 cc","quantity":500,"unit":"unidades","needed_by":"2026-11-09","budget_atomic":"100000000000000000000000","zone":"CABA"}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company members can create purchase requests',
  'B no puede leer la compra de A repitiendo su action_id'
);

select is(
  (select count(*) from public.purchase_requests
    where company_id = '77777777-7777-4777-8777-777777777777'),
  0::bigint,
  'B no ve las compras de Empresa A'
);

-- ---------------------------------------------------------------------------
-- BUY-02: el admin guarda las reglas y después las reemplaza
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

-- Máximo 500000 ARGt, paga solo hasta 100000 ARGt, solo a Vasos del Sur.
select is(
  public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-1',
    '{"max_per_purchase_atomic":"500000000000000000000000","auto_pay_limit_atomic":"100000000000000000000000","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001"]}'::jsonb
  ),
  '{"policy":{"max_per_purchase_atomic":"500000000000000000000000","auto_pay_limit_atomic":"100000000000000000000000","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001"]}}'::jsonb,
  'A (admin) guarda las reglas y vuelven con los montos como texto'
);

select is(
  (select jsonb_build_object(
      'max', max_per_purchase_atomic,
      'auto', auto_pay_limit_atomic,
      'ids', allowed_supplier_ids,
      'by', updated_by)
     from public.purchase_policies
    where company_id = '77777777-7777-4777-8777-777777777777'),
  '{"max":500000000000000000000000,"auto":100000000000000000000000,"ids":["d1000000-0000-4000-8000-000000000001"],"by":"c1000000-0000-4000-8000-000000000001"}'::jsonb,
  'la fila de la empresa tiene los montos exactos, la lista y quién la cambió'
);

select is(
  public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-1',
    '{"max_per_purchase_atomic":"500000000000000000000000","auto_pay_limit_atomic":"100000000000000000000000","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001"]}'::jsonb
  ),
  '{"policy":{"max_per_purchase_atomic":"500000000000000000000000","auto_pay_limit_atomic":"100000000000000000000000","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001"]}}'::jsonb,
  'el reintento con el mismo action_id devuelve las mismas reglas'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-1',
    '{"max_per_purchase_atomic":"900000000000000000000000","auto_pay_limit_atomic":"100000000000000000000000","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001"]}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'mismo action_id con otras reglas da CONFLICT'
);

-- Reemplazo: otros montos, sin filtro de proveedores, lista vacía.
-- El límite igual al máximo está permitido.
select is(
  public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-2',
    '{"max_per_purchase_atomic":"200000000000000000000000","auto_pay_limit_atomic":"200000000000000000000000","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  ),
  '{"policy":{"max_per_purchase_atomic":"200000000000000000000000","auto_pay_limit_atomic":"200000000000000000000000","only_allowed_suppliers":false,"allowed_supplier_ids":[]}}'::jsonb,
  'A reemplaza las reglas (límite igual al máximo, sin filtro)'
);

-- Con el filtro apagado igual se puede guardar una lista (queda lista para
-- cuando se prenda), y se respeta el orden.
select is(
  public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-3',
    '{"max_per_purchase_atomic":"0","auto_pay_limit_atomic":"0","only_allowed_suppliers":false,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000002","d1000000-0000-4000-8000-000000000001"]}'::jsonb
  ),
  '{"policy":{"max_per_purchase_atomic":"0","auto_pay_limit_atomic":"0","only_allowed_suppliers":false,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000002","d1000000-0000-4000-8000-000000000001"]}}'::jsonb,
  'A guarda montos en 0 y una lista con el filtro apagado'
);

-- V (vendedor) puede ver las reglas de su empresa: siempre hay UNA fila.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*) from public.purchase_policies
    where company_id = '77777777-7777-4777-8777-777777777777'),
  1::bigint,
  'V ve las reglas de su empresa y reemplazar no agregó filas'
);

select is(
  (select max_per_purchase_atomic from public.purchase_policies
    where company_id = '77777777-7777-4777-8777-777777777777'),
  0::numeric,
  'la fila tiene los valores del último guardado'
);

-- ---------------------------------------------------------------------------
-- BUY-02: quién NO puede guardar
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-v',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit payment rules',
  'V (vendedor) no puede cambiar las reglas'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-b',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit payment rules',
  'B (admin de otra empresa) no puede cambiar las reglas de A'
);

select is(
  (select count(*) from public.purchase_policies
    where company_id = '77777777-7777-4777-8777-777777777777'),
  0::bigint,
  'B no ve las reglas de Empresa A'
);

select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-no-session',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: sign in required',
  'sin usuario en la sesión no se pueden guardar reglas'
);

-- ---------------------------------------------------------------------------
-- BUY-02: reglas inválidas (como admin A)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

-- Como texto, "9" es mayor que "10" (se compara letra por letra). Por eso la
-- base compara como número: acá el límite (10) supera al máximo (9) y falla.
select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-1',
    '{"max_per_purchase_atomic":"9","auto_pay_limit_atomic":"10","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: auto pay limit must not exceed max per purchase',
  'lo que paga solo mayor al máximo da VALIDATION_ERROR (compara como número)'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-2',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":true,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: allowed suppliers required',
  'filtro de proveedores prendido sin ningún proveedor da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-3',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":true,"allowed_supplier_ids":["d1000000-0000-4000-8000-000000000001","d2000000-0000-4000-8000-000000000001"]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: unknown supplier',
  'un proveedor de otra empresa da VALIDATION_ERROR: unknown supplier'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-4',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":["d9000000-0000-4000-8000-000000000009"]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: unknown supplier',
  'un proveedor que no existe da VALIDATION_ERROR: unknown supplier (aunque el filtro esté apagado)'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-5',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":true,"allowed_supplier_ids":["no-es-un-id"]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: allowed supplier ids must be uuids',
  'un id con forma inválida da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-6',
    '{"max_per_purchase_atomic":1000,"auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: max per purchase must be a whole number as text',
  'un máximo como número (no texto) da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-7',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"-1","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: auto pay limit must be a whole number as text',
  'un límite negativo da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-8',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":"true","allowed_supplier_ids":[]}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: only allowed suppliers must be true or false',
  'el filtro como texto da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-9',
    jsonb_build_object(
      'max_per_purchase_atomic', '1000',
      'auto_pay_limit_atomic', '500',
      'only_allowed_suppliers', false,
      'allowed_supplier_ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 101))
    )
  )$$,
  '22023',
  'VALIDATION_ERROR: allowed supplier ids must have at most 100 items',
  'más de 100 proveedores da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-bad-10',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[],"currency":"USD"}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: unexpected field in policy',
  'un campo de más da VALIDATION_ERROR'
);

-- ---------------------------------------------------------------------------
-- Nadie escribe las tablas directo (ni siquiera el admin)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.purchase_requests (company_id, product, quantity, needed_by, budget_atomic)
    values ('77777777-7777-4777-8777-777777777777', 'Vasos', 1, '2026-11-09', 1)$$,
  '42501',
  null,
  'authenticated no puede insertar directo en purchase_requests'
);

select throws_ok(
  $$update public.purchase_requests set quantity = 1$$,
  '42501',
  null,
  'authenticated no puede editar directo purchase_requests'
);

select throws_ok(
  $$delete from public.purchase_requests$$,
  '42501',
  null,
  'authenticated no puede borrar directo de purchase_requests'
);

select throws_ok(
  $$insert into public.purchase_policies (company_id, max_per_purchase_atomic, auto_pay_limit_atomic)
    values ('88888888-8888-4888-8888-888888888888', 1, 1)$$,
  '42501',
  null,
  'authenticated no puede insertar directo en purchase_policies'
);

select throws_ok(
  $$update public.purchase_policies set auto_pay_limit_atomic = 0$$,
  '42501',
  null,
  'authenticated no puede editar directo purchase_policies'
);

select throws_ok(
  $$delete from public.purchase_policies$$,
  '42501',
  null,
  'authenticated no puede borrar directo de purchase_policies'
);

-- ---------------------------------------------------------------------------
-- Revisión con el rol del test (ve todo, sin RLS)
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*) from public.purchase_requests
    where company_id = '77777777-7777-4777-8777-777777777777'),
  2::bigint,
  'Empresa A tiene exactamente 2 compras (los errores y el reintento no agregaron)'
);

-- Cuando una función falla, la excepción deshace también el recibo del
-- action_id. Así ese action_id no queda trabado.
select ok(
  not exists (
    select 1 from app_private.action_receipts
    where company_id = '77777777-7777-4777-8777-777777777777'
      and action_id not in ('buy-1', 'buy-2', 'rules-1', 'rules-2', 'rules-3')
  ),
  'los intentos que fallaron no dejaron recibo'
);

select is(
  (select jsonb_object_agg(action_id, operation)
     from app_private.action_receipts
    where company_id = '77777777-7777-4777-8777-777777777777'),
  '{"buy-1":"purchase.create_request","buy-2":"purchase.create_request","rules-1":"purchase.save_policy","rules-2":"purchase.save_policy","rules-3":"purchase.save_policy"}'::jsonb,
  'cada recibo tiene su operación'
);

-- Las tablas se defienden solas aunque alguien con todos los permisos
-- escriba directo.
select throws_ok(
  $$insert into public.purchase_requests (company_id, product, quantity, needed_by, budget_atomic)
    values ('88888888-8888-4888-8888-888888888888', 'Vasos', 1, '2026-11-09', 0)$$,
  '23514',
  null,
  'la tabla no acepta un presupuesto de 0'
);

select throws_ok(
  $$insert into public.purchase_requests (company_id, product, quantity, needed_by, budget_atomic, status)
    values ('88888888-8888-4888-8888-888888888888', 'Vasos', 1, '2026-11-09', 1, 'paid')$$,
  '23514',
  null,
  'la tabla solo acepta el estado open'
);

select throws_ok(
  $$insert into public.purchase_policies (company_id, max_per_purchase_atomic, auto_pay_limit_atomic)
    values ('88888888-8888-4888-8888-888888888888', 10, 11)$$,
  '23514',
  null,
  'la tabla no acepta lo que paga solo mayor al máximo'
);

select ok(
  (select bool_and(prosecdef
          and proconfig @> array['search_path=pg_catalog, public, app_private, extensions'])
     from pg_catalog.pg_proc
    where oid in (
      'public.create_purchase_request(uuid,text,jsonb)'::regprocedure,
      'public.save_purchase_policy(uuid,text,jsonb)'::regprocedure
    )),
  'las dos funciones son security definer con search_path fijo'
);

-- ---------------------------------------------------------------------------
-- anon (sin sesión) no tiene acceso a nada
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select * from public.purchase_requests$$,
  '42501',
  null,
  'anon no puede leer purchase_requests'
);

select throws_ok(
  $$select * from public.purchase_policies$$,
  '42501',
  null,
  'anon no puede leer purchase_policies'
);

select throws_ok(
  $$select public.create_purchase_request(
    '77777777-7777-4777-8777-777777777777', 'buy-anon',
    '{"product":"Vasos","quantity":500,"unit":"","needed_by":"2026-11-09","budget_atomic":"1000","zone":""}'::jsonb
  )$$,
  '42501',
  null,
  'anon no puede ejecutar create_purchase_request'
);

select throws_ok(
  $$select public.save_purchase_policy(
    '77777777-7777-4777-8777-777777777777', 'rules-anon',
    '{"max_per_purchase_atomic":"1000","auto_pay_limit_atomic":"500","only_allowed_suppliers":false,"allowed_supplier_ids":[]}'::jsonb
  )$$,
  '42501',
  null,
  'anon no puede ejecutar save_purchase_policy'
);

reset role;

-- Además de que falle, confirmamos que el motivo es el permiso, y que los
-- usuarios con sesión sí pueden ejecutar las dos funciones.
select ok(
  not has_function_privilege('anon', 'public.create_purchase_request(uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.save_purchase_policy(uuid,text,jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_purchase_request(uuid,text,jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.save_purchase_policy(uuid,text,jsonb)', 'EXECUTE'),
  'solo authenticated (no anon) puede ejecutar las funciones de compras'
);

select * from finish();
rollback;
