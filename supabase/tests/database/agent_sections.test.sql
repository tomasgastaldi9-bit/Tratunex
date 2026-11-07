-- Pruebas de AGT-02: columna knowledge y función save_agent_section.
--
-- Lo más importante que cuidan estas pruebas: guardar UNA sección crea una
-- versión nueva que copia TODAS las demás. En especial, guardar un perfil
-- nuevo no puede borrar el conocimiento que ya estaba cargado.
--
-- Todo corre dentro de una transacción y al final se hace rollback: así las
-- pruebas no dejan basura en la base y se pueden correr las veces que sea.
begin;
select plan(49);

-- ---------------------------------------------------------------------------
-- Datos de prueba (se cargan con el rol del test, que puede escribir todo)
-- ---------------------------------------------------------------------------
-- Usamos ids distintos a los de agent_profiles.test.sql para que se note que
-- son otros datos y nunca se mezclen.
--   A = admin de Empresa A
--   V = vendedor de Empresa A (puede ver, no puede guardar)
--   B = admin de Empresa B (no tiene nada que ver con Empresa A)
insert into auth.users (id, email) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'secciones-admin-a@example.test'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'secciones-vendedor-a@example.test'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'secciones-admin-b@example.test');
insert into public.companies (id, name) values
  ('55555555-5555-4555-8555-555555555555', 'Empresa A (secciones)'),
  ('66666666-6666-4666-8666-666666666666', 'Empresa B (secciones)');
insert into public.company_members (company_id, user_id, role) values
  ('55555555-5555-4555-8555-555555555555', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin'),
  ('55555555-5555-4555-8555-555555555555', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'vendedor'),
  ('66666666-6666-4666-8666-666666666666', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'admin');

-- A partir de acá actuamos como un usuario logueado (rol authenticated).
-- request.jwt.claim.sub es lo que lee auth.uid() para saber quién es.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);

-- ---------------------------------------------------------------------------
-- Primero el perfil: sin versiones no se puede cargar conocimiento
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-no-profile-1', null, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas."}]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: profile required',
  'conocimiento sin ningún perfil guardado da VALIDATION_ERROR: profile required'
);

-- Aunque mande una base_version, si no hay versiones lo que falta es el
-- perfil (no es un problema de "alguien guardó antes que vos").
select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-no-profile-2', 1, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas."}]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: profile required',
  'conocimiento con base_version pero sin versiones también pide el perfil'
);

-- ---------------------------------------------------------------------------
-- Perfil (v1) y después conocimiento (v2)
-- ---------------------------------------------------------------------------

select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-profile-1', null, 'profile',
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"professional_warm","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 1, "created": true}'::jsonb,
  'A guarda el perfil con save_agent_section y se crea la versión 1'
);

select is(
  (select knowledge from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 1),
  null::jsonb,
  'la versión 1 todavía no tiene conocimiento (null = nunca se cargó)'
);

-- Instrucciones y criterios todavía no tienen pantalla (AGT-03 y AGT-04), así
-- que los cargamos a mano en la versión 1 para comprobar que se copian.
-- authenticated no puede editar la tabla: volvemos un momento al rol del test.
reset role;
update public.agent_profiles
   set instructions = '{"opening":"Presentarse y preguntar por el encargado"}'::jsonb,
       criteria = '{"min_employees":5}'::jsonb
 where company_id = '55555555-5555-4555-8555-555555555555'
   and version = 1;
set local role authenticated;

select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-1', 1, 'knowledge',
    '[{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"},{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."}]'::jsonb
  ),
  '{"version": 2, "created": true}'::jsonb,
  'conocimiento sobre la versión 1 crea la versión 2'
);

select is(
  (select knowledge from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 2),
  '[{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"},{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."}]'::jsonb,
  'la versión 2 tiene el conocimiento nuevo'
);

select is(
  (select profile from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 2),
  (select profile from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 1),
  'la versión 2 conserva el perfil de la versión 1'
);

select is(
  (select jsonb_build_object('instructions', instructions, 'criteria', criteria)
     from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 2),
  '{"instructions":{"opening":"Presentarse y preguntar por el encargado"},"criteria":{"min_employees":5}}'::jsonb,
  'la versión 2 conserva las instrucciones y los criterios de la versión 1'
);

select is(
  (select created_by from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 2),
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
  'la versión 2 guarda quién la creó'
);

-- ---------------------------------------------------------------------------
-- Perfil nuevo (v3) con save_agent_profile: NO pierde el conocimiento
-- ---------------------------------------------------------------------------

select is(
  public.save_agent_profile(
    '55555555-5555-4555-8555-555555555555', 'sec-profile-2', 2,
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"formal","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 3, "created": true}'::jsonb,
  'un perfil distinto sobre la versión 2 (con save_agent_profile) crea la versión 3'
);

-- Esta es la regresión que evita AGT-02: antes, save_agent_profile no copiaba
-- el conocimiento y la versión 3 quedaba sin él.
select is(
  (select knowledge from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 3),
  '[{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"},{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."}]'::jsonb,
  'la versión 3 conserva el conocimiento de la versión 2'
);

select is(
  (select profile ->> 'tone' from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 3),
  'formal',
  'la versión 3 tiene el perfil nuevo'
);

select is(
  (select jsonb_build_object('instructions', instructions, 'criteria', criteria)
     from public.agent_profiles
    where company_id = '55555555-5555-4555-8555-555555555555' and version = 3),
  '{"instructions":{"opening":"Presentarse y preguntar por el encargado"},"criteria":{"min_employees":5}}'::jsonb,
  'la versión 3 conserva las instrucciones y los criterios'
);

-- ---------------------------------------------------------------------------
-- Sin cambios, sin versión nueva
-- ---------------------------------------------------------------------------

select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-2', 3, 'knowledge',
    '[{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"},{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."}]'::jsonb
  ),
  '{"version": 3, "created": false}'::jsonb,
  'el mismo conocimiento sobre la versión 3 responde la vigente sin crear otra'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '55555555-5555-4555-8555-555555555555'),
  3::bigint,
  'guardar el conocimiento sin cambios no agrega filas'
);

-- ---------------------------------------------------------------------------
-- Idempotencia: reintentos con el mismo action_id
-- ---------------------------------------------------------------------------

-- Reintento del guardado de conocimiento de antes (como si se hubiera cortado
-- la red): mismo action_id y mismos datos devuelve lo mismo que esa vez,
-- aunque ahora la vigente sea la 3.
select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-1', 1, 'knowledge',
    '[{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"},{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."}]'::jsonb
  ),
  '{"version": 2, "created": true}'::jsonb,
  'reintento con el mismo action_id y los mismos datos devuelve el mismo resultado'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '55555555-5555-4555-8555-555555555555'),
  3::bigint,
  'el reintento no crea otra fila'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-1', 1, 'knowledge',
    '[{"kind":"faq","question":"¿Aceptan transferencia?","answer":"Sí."}]'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'mismo action_id con otro conocimiento da CONFLICT'
);

-- El perfil se guarda con la MISMA operación y los MISMOS datos de recibo en
-- las dos funciones. Por eso un reintento de save_agent_profile reconoce un
-- guardado hecho con save_agent_section('profile') y al revés.
select is(
  public.save_agent_profile(
    '55555555-5555-4555-8555-555555555555', 'sec-profile-1', null,
    '{"industry":"distributor","offering":"Insumos de limpieza para comercios","target_customer":"Almacenes y kioscos","value_proposition":"Entrega en 24 horas","zone":"CABA y GBA","tone":"professional_warm","call_window":{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}}'::jsonb
  ),
  '{"version": 1, "created": true}'::jsonb,
  'save_agent_profile reconoce el reintento de un perfil guardado con save_agent_section'
);

-- Un action_id ya usado para el perfil no se puede reusar para otra sección.
select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-profile-2', 3, 'knowledge', '[]'::jsonb
  )$$,
  'P0001',
  'CONFLICT: action id was reused with different input',
  'reusar el action_id de un perfil para el conocimiento da CONFLICT'
);

-- ---------------------------------------------------------------------------
-- Nadie pisa el trabajo de otro (base_version vieja)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-stale-1', 2, 'knowledge',
    '[{"kind":"faq","question":"¿Aceptan transferencia?","answer":"Sí."}]'::jsonb
  )$$,
  'P0001',
  'CONFLICT: stale base version',
  'conocimiento sobre la versión 2 cuando la vigente es la 3 da CONFLICT'
);

-- null solo vale para el primer perfil. Con versiones, también es viejo.
select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-stale-2', null, 'knowledge',
    '[{"kind":"faq","question":"¿Aceptan transferencia?","answer":"Sí."}]'::jsonb
  )$$,
  'P0001',
  'CONFLICT: stale base version',
  'conocimiento con base_version null cuando ya hay versiones da CONFLICT'
);

-- ---------------------------------------------------------------------------
-- Datos con forma inválida
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-1', 3, 'prices', '{}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: section must be profile, knowledge, instructions or criteria',
  'una sección que no existe da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-2', 3, null, '{}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: section must be profile, knowledge, instructions or criteria',
  'una sección vacía (null) da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-3', 3, 'knowledge',
    '{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí."}'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: knowledge must be a JSON array',
  'un objeto en vez de una lista para el conocimiento da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-4', 3, 'knowledge', null
  )$$,
  '22023',
  'VALIDATION_ERROR: knowledge must be a JSON array',
  'un conocimiento null da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-5', 3, 'profile', '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: profile must be a JSON object',
  'un perfil que no es objeto da VALIDATION_ERROR (mismo mensaje que AGT-01)'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-6', 3, 'instructions', '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: instructions must be a JSON object',
  'instrucciones que no son objeto dan VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-invalid-7', 0, 'knowledge', '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: base version must be 1 or greater',
  'una base_version menor a 1 da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', '   ', 3, 'knowledge', '[]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: action id is required',
  'un action_id vacío da VALIDATION_ERROR'
);

select throws_ok(
  $$select public.save_agent_section(null, 'sec-invalid-8', 3, 'knowledge', '[]'::jsonb)$$,
  '22023',
  'VALIDATION_ERROR: company id is required',
  'sin empresa da VALIDATION_ERROR'
);

-- ---------------------------------------------------------------------------
-- Otras secciones y lista vacía: siempre se copian todas las demás
-- ---------------------------------------------------------------------------

-- Guardar instrucciones (AGT-03 las va a usar) crea la versión 4 y conserva
-- perfil, conocimiento y criterios de la versión 3.
select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-instructions-1', 3, 'instructions',
    '{"opening":"Saludar y presentarse con el nombre de la empresa"}'::jsonb
  ),
  '{"version": 4, "created": true}'::jsonb,
  'instrucciones nuevas sobre la versión 3 crean la versión 4'
);

select ok(
  (select v4.profile = v3.profile
      and v4.knowledge = v3.knowledge
      and v4.criteria = v3.criteria
      and v4.instructions = '{"opening":"Saludar y presentarse con el nombre de la empresa"}'::jsonb
     from public.agent_profiles as v3, public.agent_profiles as v4
    where v3.company_id = '55555555-5555-4555-8555-555555555555' and v3.version = 3
      and v4.company_id = '55555555-5555-4555-8555-555555555555' and v4.version = 4),
  'la versión 4 cambia solo las instrucciones y copia perfil, conocimiento y criterios'
);

-- Los mismos ítems en otro orden son un cambio: la lista se guarda en el
-- orden en que la cargó la empresa.
select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-3', 4, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí, en 24 horas en CABA y GBA."},{"kind":"product","name":"Lavandina 5 L","description":"Bidón para comercios","price_hint":"Desde $3.200 + IVA"}]'::jsonb
  ),
  '{"version": 5, "created": true}'::jsonb,
  'los mismos ítems en otro orden crean la versión 5'
);

-- Una lista vacía (la empresa borró todo) es distinta de null (nunca cargó).
select is(
  public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-knowledge-4', 5, 'knowledge', '[]'::jsonb
  ),
  '{"version": 6, "created": true}'::jsonb,
  'borrar todo el conocimiento (lista vacía) crea la versión 6'
);

select ok(
  (select v6.knowledge = '[]'::jsonb
      and v6.profile = v5.profile
      and v6.instructions = v5.instructions
      and v6.criteria = v5.criteria
     from public.agent_profiles as v5, public.agent_profiles as v6
    where v5.company_id = '55555555-5555-4555-8555-555555555555' and v5.version = 5
      and v6.company_id = '55555555-5555-4555-8555-555555555555' and v6.version = 6),
  'la versión 6 tiene la lista vacía y copia las demás secciones'
);

-- ---------------------------------------------------------------------------
-- Sin sesión, vendedor y otra empresa: no guardan
-- ---------------------------------------------------------------------------

-- Vaciamos el usuario: auth.uid() pasa a ser null, como un token sin "sub".
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-no-session', 6, 'knowledge', '[]'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: sign in required',
  'sin usuario en la sesión da FORBIDDEN'
);

select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-v', 6, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí."}]'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit the agent',
  'V (vendedor) no puede guardar conocimiento'
);

select set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-b', 6, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí."}]'::jsonb
  )$$,
  '42501',
  'FORBIDDEN: only company admins can edit the agent',
  'B (admin de otra empresa) no puede guardar en Empresa A'
);

-- En SU empresa B sí es admin, pero Empresa B no tiene perfil todavía.
select throws_ok(
  $$select public.save_agent_section(
    '66666666-6666-4666-8666-666666666666', 'sec-b-no-profile', null, 'knowledge',
    '[{"kind":"faq","question":"¿Hacen envíos?","answer":"Sí."}]'::jsonb
  )$$,
  '22023',
  'VALIDATION_ERROR: profile required',
  'B en su propia empresa sin perfil recibe VALIDATION_ERROR: profile required'
);

-- ---------------------------------------------------------------------------
-- Revisión con el rol del test (ve todo, sin RLS)
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*) from public.agent_profiles where company_id = '55555555-5555-4555-8555-555555555555'),
  6::bigint,
  'Empresa A tiene exactamente 6 versiones (los errores no agregaron filas)'
);

select is(
  (select count(*) from public.agent_profiles where company_id = '66666666-6666-4666-8666-666666666666'),
  0::bigint,
  'Empresa B sigue sin versiones'
);

-- Cuando save_agent_section falla DESPUÉS de reservar el action_id (por
-- ejemplo "profile required" o CONFLICT), la excepción deshace también el
-- recibo. Así ese action_id no queda trabado a medio guardar.
select ok(
  not exists (
    select 1 from app_private.action_receipts
    where company_id in ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666')
      and action_id in (
        'sec-no-profile-1', 'sec-no-profile-2', 'sec-stale-1', 'sec-stale-2',
        'sec-invalid-1', 'sec-invalid-3', 'sec-no-session', 'sec-v', 'sec-b', 'sec-b-no-profile'
      )
  ),
  'un guardado que falla no deja su recibo de action_id'
);

-- El recibo guarda la operación: el perfil usa la de siempre (AGT-01) y las
-- otras secciones "agent.save_" más el nombre de la sección.
select is(
  (select jsonb_object_agg(action_id, operation)
     from app_private.action_receipts
    where company_id = '55555555-5555-4555-8555-555555555555'
      and action_id in ('sec-profile-1', 'sec-profile-2', 'sec-knowledge-1', 'sec-instructions-1')),
  '{"sec-profile-1":"agent.save_company_profile","sec-profile-2":"agent.save_company_profile","sec-knowledge-1":"agent.save_knowledge","sec-instructions-1":"agent.save_instructions"}'::jsonb,
  'cada recibo tiene la operación de su sección'
);

-- La columna misma rechaza un conocimiento que no sea lista, aunque alguien
-- con todos los permisos intente escribir directo.
select throws_ok(
  $$insert into public.agent_profiles (company_id, version, profile, knowledge)
    values ('66666666-6666-4666-8666-666666666666', 1, '{"tone":"formal"}'::jsonb, '{"kind":"faq"}'::jsonb)$$,
  '23514',
  null,
  'la columna knowledge no acepta un objeto (solo lista o null)'
);

-- Las funciones de guardado corren como su dueño (security definer) y con un
-- search_path fijo; save_agent_profile ya no lo necesita porque solo delega.
select ok(
  (select prosecdef
          and proconfig @> array['search_path=pg_catalog, public, app_private, extensions']
     from pg_catalog.pg_proc
    where oid = 'public.save_agent_section(uuid,text,integer,text,jsonb)'::regprocedure),
  'save_agent_section es security definer con search_path fijo'
);

-- ---------------------------------------------------------------------------
-- anon (sin sesión) no puede ejecutar save_agent_section
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.save_agent_section(
    '55555555-5555-4555-8555-555555555555', 'sec-anon', 6, 'knowledge', '[]'::jsonb
  )$$,
  '42501',
  null,
  'anon no puede ejecutar save_agent_section'
);

reset role;

-- Además de que falle, confirmamos que el motivo es el permiso, y que los
-- usuarios con sesión sí pueden ejecutar las dos funciones.
select ok(
  not has_function_privilege('anon', 'public.save_agent_section(uuid,text,integer,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.save_agent_profile(uuid,text,integer,jsonb)', 'EXECUTE'),
  'anon no tiene permiso de ejecutar save_agent_section ni save_agent_profile'
);

select ok(
  has_function_privilege('authenticated', 'public.save_agent_section(uuid,text,integer,text,jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.save_agent_profile(uuid,text,integer,jsonb)', 'EXECUTE'),
  'authenticated puede ejecutar save_agent_section y save_agent_profile'
);

select * from finish();
rollback;
