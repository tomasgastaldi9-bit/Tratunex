-- Pruebas de AGT-01: tabla agent_profiles y funciones save_agent_profile /
-- can_edit_agent_profile.
--
-- Todo corre dentro de una transacción y al final se hace rollback: así las
-- pruebas no dejan basura en la base y se pueden correr las veces que sea.
begin;
select plan(34);

-- ---------------------------------------------------------------------------
-- Datos de prueba (se cargan con el rol del test, que puede escribir todo)
-- ---------------------------------------------------------------------------
--   A = admin de Empresa A
--   V = vendedor de Empresa A (puede ver, no puede guardar)
--   B = admin de Empresa B (no tiene nada que ver con Empresa A)
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin-a@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'vendedor-a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin-b@example.test');
insert into public.companies (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Empresa A'),
  ('22222222-2222-4222-8222-222222222222', 'Empresa B');
insert into public.company_members (company_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'vendedor'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin');

-- A partir de acá actuamos como un usuario logueado (rol authenticated).
-- request.jwt.claim.sub es lo que lee auth.uid() para saber quién es.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

-- ---------------------------------------------------------------------------
-- Primer guardado e idempotencia
-- ---------------------------------------------------------------------------

select is(
  public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-1', null,
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"professional_warm","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 1, "created": true}'::jsonb,
  'A guarda el primer perfil y se crea la versión 1'
);

-- Reintento: mismo action_id y mismos datos (como si se hubiera cortado la red).
select is(
  public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-1', null,
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"professional_warm","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 1, "created": true}'::jsonb,
  'repetir el mismo action_id con los mismos datos devuelve el mismo resultado'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'el reintento no crea otra fila'
);

-- Mismo action_id pero con otro perfil: es un error del cliente, no un reintento.
select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-1', null,
    '{"industry":"agency","offering":"Otra cosa","target_customer":"Otro cliente","value_proposition":"Otra propuesta","zone":"","tone":"formal","call_window":{"days":[1],"start":"10:00","end":"12:00"}}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'mismo action_id con otro perfil da CONFLICT'
);

-- ---------------------------------------------------------------------------
-- Sin cambios, sin versión nueva
-- ---------------------------------------------------------------------------

-- Mismo perfil que la versión 1, pero con las claves en otro orden: para jsonb
-- es el mismo objeto, así que no tiene que crear una versión nueva.
select is(
  public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-2', 1,
    '{"call_window":{"start":"09:00","end":"18:00","days":[1,2,3,4,5]},"tone":"professional_warm","zone":"CABA y GBA","value_proposition":"Entrega en 24 horas","target_customer":"Almacenes y kioscos","offering":"Insumos de limpieza para comercios","industry":"distributor"}'::jsonb
  ),
  '{"version": 1, "created": false}'::jsonb,
  'perfil idéntico con action_id nuevo responde la versión vigente sin crear otra'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'guardar sin cambios no agrega filas'
);

-- ---------------------------------------------------------------------------
-- Datos con forma inválida
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-invalid-1', 1, '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: profile must be a JSON object',
  'un perfil que no es objeto JSON da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', '   ', 1, '{"tone":"formal"}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: action id is required',
  'un action_id vacío da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-invalid-2', 0, '{"tone":"formal"}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: base version must be 1 or greater',
  'una base_version menor a 1 da VALIDATION_ERROR'
);

-- ---------------------------------------------------------------------------
-- Versión nueva: copia instrucciones y criterios
-- ---------------------------------------------------------------------------

-- Hoy todavía no existen las pantallas de AGT-03 y AGT-04, así que cargamos
-- instrucciones y criterios a mano en la versión 1. authenticated no puede
-- editar la tabla, por eso volvemos un momento al rol del test.
reset role;
update public.agent_profiles
   set instructions = '{"opening":"Presentarse y preguntar por el encargado"}'::jsonb,
       criteria = '{"min_employees":5}'::jsonb
 where company_id = '11111111-1111-4111-8111-111111111111'
   and version = 1;
set local role authenticated;

select is(
  public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-3', 1,
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"formal","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 2, "created": true}'::jsonb,
  'un perfil distinto sobre la versión 1 crea la versión 2'
);

select is(
  (select instructions from public.agent_profiles
    where company_id = '11111111-1111-4111-8111-111111111111' and version = 2),
  '{"opening":"Presentarse y preguntar por el encargado"}'::jsonb,
  'la versión 2 copia las instrucciones de la versión 1'
);

select is(
  (select criteria from public.agent_profiles
    where company_id = '11111111-1111-4111-8111-111111111111' and version = 2),
  '{"min_employees":5}'::jsonb,
  'la versión 2 copia los criterios de la versión 1'
);

select is(
  (select created_by from public.agent_profiles
    where company_id = '11111111-1111-4111-8111-111111111111' and version = 2),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'la versión 2 guarda quién la creó'
);

-- ---------------------------------------------------------------------------
-- Nadie pisa el trabajo de otro (base_version vieja)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-4', 1,
    '{"industry":"distributor","offering":"Cambio sobre una versión vieja","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"relaxed","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: stale base version',
  'guardar sobre la versión 1 cuando la vigente es la 2 da CONFLICT'
);

-- base_version null significa "es la primera"; si ya hay versiones, también es viejo.
select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-5', null,
    '{"industry":"distributor","offering":"Cambio creyendo que es la primera","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"relaxed","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: stale base version',
  'base_version null cuando ya hay versiones da CONFLICT'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  2::bigint,
  'los conflictos no agregan filas'
);

select is(
  public.can_edit_agent_profile('11111111-1111-4111-8111-111111111111'),
  true,
  'can_edit_agent_profile da true para el admin A'
);

-- ---------------------------------------------------------------------------
-- Sin sesión no se guarda
-- ---------------------------------------------------------------------------

-- Vaciamos el usuario: auth.uid() pasa a ser null, como un token sin "sub".
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-no-session', 2, '{"tone":"formal"}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: sign in required',
  'sin usuario en la sesión da FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- El vendedor V ve, pero no guarda
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  2::bigint,
  'V lee las versiones de su empresa'
);

select is(
  public.can_edit_agent_profile('11111111-1111-4111-8111-111111111111'),
  false,
  'can_edit_agent_profile da false para el vendedor V'
);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-v', 2, '{"tone":"formal"}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit the agent',
  'V no puede guardar el perfil'
);

-- ---------------------------------------------------------------------------
-- B (admin de OTRA empresa) no ve ni toca Empresa A
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'B no ve las versiones de Empresa A'
);

select is(
  public.can_edit_agent_profile('11111111-1111-4111-8111-111111111111'),
  false,
  'can_edit_agent_profile da false para B en Empresa A'
);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-b', 2, '{"tone":"formal"}'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit the agent',
  'B no puede guardar en Empresa A'
);

-- En SU empresa (Empresa B), B es admin, pero Empresa B todavía no tiene
-- ninguna versión. Si B manda base_version 1 (como si estuviera editando una
-- versión 1 que no existe), está desactualizado: tiene que dar CONFLICT.
select throws_ok(
  $$select public.save_agent_profile(
    '22222222-2222-4222-8222-222222222222', 'save-b-stale', 1,
    '{"industry":"agency","offering":"Campañas de publicidad","target_customer":"Comercios de barrio","value_proposition":"Más clientes en un mes","zone":"","tone":"formal","call_window":{"days":[1,2,3],"start":"10:00","end":"17:00"}}'::jsonb
  )$$,
  'P0001',
  'CONFLICT: stale base version',
  'sin versiones y con base_version 1 da CONFLICT'
);

-- ---------------------------------------------------------------------------
-- Nadie escribe la tabla directo (ni siquiera el admin)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

select throws_ok(
  $$insert into public.agent_profiles (company_id, version, profile)
    values ('11111111-1111-4111-8111-111111111111', 3, '{"tone":"formal"}'::jsonb)$$,
  '42501',
  null,
  'authenticated no puede insertar directo en agent_profiles'
);

select throws_ok(
  $$update public.agent_profiles set profile = '{"tone":"formal"}'::jsonb$$,
  '42501',
  null,
  'authenticated no puede editar directo agent_profiles'
);

select throws_ok(
  $$delete from public.agent_profiles$$,
  '42501',
  null,
  'authenticated no puede borrar directo de agent_profiles'
);

-- ---------------------------------------------------------------------------
-- Revisión con el rol del test (ve todo, sin RLS)
-- ---------------------------------------------------------------------------

reset role;

-- Cuando save_agent_profile falla (acá por CONFLICT), la excepción deshace
-- también el recibo que había creado claim_action.
select ok(
  not exists (
    select 1 from app_private.action_receipts
    where company_id = '11111111-1111-4111-8111-111111111111'
      and action_id in ('save-4', 'save-5', 'save-v', 'save-b')
  ),
  'un guardado que falla no deja su recibo de action_id'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '11111111-1111-4111-8111-111111111111'),
  2::bigint,
  'Empresa A sigue teniendo exactamente 2 versiones'
);

-- ---------------------------------------------------------------------------
-- anon (sin sesión) no tiene acceso a nada
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select * from public.agent_profiles$$,
  '42501',
  null,
  'anon no puede leer agent_profiles'
);

select throws_ok(
  $$select public.can_edit_agent_profile('11111111-1111-4111-8111-111111111111')$$,
  '42501',
  null,
  'anon no puede ejecutar can_edit_agent_profile'
);

select throws_ok(
  $$select public.save_agent_profile(
    '11111111-1111-4111-8111-111111111111', 'save-anon', 2, '{"tone":"formal"}'::jsonb
  )$$,
  '42501',
  null,
  'anon no puede ejecutar save_agent_profile'
);

reset role;

-- Además de que falle, confirmamos que el motivo es que anon no tiene el
-- permiso (y no otro error que casualmente tenga el mismo código).
select ok(
  not has_table_privilege('anon', 'public.agent_profiles', 'SELECT')
  and not has_function_privilege('anon', 'public.can_edit_agent_profile(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.save_agent_profile(uuid,text,integer,jsonb)', 'EXECUTE'),
  'anon no tiene permisos sobre la tabla ni sobre las funciones'
);

select * from finish();
rollback;
