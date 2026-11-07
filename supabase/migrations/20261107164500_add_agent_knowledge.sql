-- AGT-02: base de conocimiento del agente y una sola función para guardar
-- cualquier sección de su configuración.
--
-- Idea general (ver src/features/agent/README.md, decisiones 8 a 10):
--   * El conocimiento (productos y preguntas frecuentes) se guarda como una
--     lista dentro de cada versión, en la columna nueva "knowledge". No hay
--     tabla aparte: cada versión sigue siendo la foto completa del agente.
--   * save_agent_section guarda UNA sección (perfil, conocimiento,
--     instrucciones o criterios) con las mismas reglas que ya tenía el perfil,
--     y la versión nueva copia TODAS las demás secciones de la vigente.
--   * save_agent_profile sigue existiendo con la misma firma, pero ahora solo
--     llama a save_agent_section. Así las reglas viven en un solo lugar, y
--     guardar un perfil nuevo ya no pierde el conocimiento.
--
-- La migración de AGT-01 (20261107153700_add_agent_profiles.sql) ya está
-- aplicada en las bases, por eso no se edita: todo cambio va acá.

-- ---------------------------------------------------------------------------
-- Columna knowledge
-- ---------------------------------------------------------------------------

-- null = nunca se cargó conocimiento (por ejemplo, las versiones creadas
-- antes de AGT-02). Una lista vacía [] = la empresa borró todo.
-- La base solo exige que sea una lista; la forma de cada ítem (producto o
-- pregunta, largos máximos) la valida el servidor con knowledgeSchema.
--
-- Como la columna puede ser null y no tiene valor por defecto, agregarla no
-- reescribe la tabla: las filas que ya existen quedan con null.
--
-- Permisos: no hace falta tocar nada. authenticated ya puede leer la tabla
-- entera (con la RLS de AGT-01, solo las filas de su empresa), y eso incluye
-- las columnas nuevas. Escribir directo sigue prohibido para todos.
alter table public.agent_profiles
  add column knowledge jsonb
  constraint agent_profiles_knowledge_check
  check (knowledge is null or jsonb_typeof(knowledge) = 'array');

-- ---------------------------------------------------------------------------
-- Guardar una sección como versión nueva
-- ---------------------------------------------------------------------------

-- Devuelve {"version": n, "created": true/false}.
--
-- p_section dice qué sección se guarda: 'profile', 'knowledge',
-- 'instructions' o 'criteria'. p_value es el contenido nuevo de esa sección.
--
-- Es "security definer": corre con los permisos del dueño de la función y no
-- con los del usuario. Lo necesitamos porque el usuario no puede escribir la
-- tabla directo ni usar app_private. Por eso mismo la función chequea ella
-- sola quién es el usuario y si es admin, antes de tocar nada.
--
-- El search_path fijo evita que alguien "esconda" una tabla o función con el
-- mismo nombre en otro esquema. Igual escribimos siempre esquema.nombre.
--
-- Si algo falla en el medio (por ejemplo "profile required" o un CONFLICT),
-- la excepción deshace TODO lo que hizo la función, incluido el recibo de
-- claim_action. Así el action_id no queda "trabado" a medio guardar.
create function public.save_agent_section(
  p_company_id uuid,
  p_action_id text,
  p_base_version integer,
  p_section text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  v_user uuid;
  v_expected_type text;
  v_operation text;
  v_payload jsonb;
  v_claimed boolean;
  v_cached_result jsonb;
  v_current_version integer;
  v_current_profile jsonb;
  v_current_knowledge jsonb;
  v_current_instructions jsonb;
  v_current_criteria jsonb;
  v_current_value jsonb;
  v_new_version integer;
  v_result jsonb;
begin
  -- 1. ¿Quién está guardando? auth.uid() sale de la sesión (del token), no
  --    de lo que mande el navegador. Sin sesión, no se guarda nada.
  v_user := auth.uid();

  if v_user is null then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: sign in required';
  end if;

  -- 2. Revisar la forma de los datos antes de hacer cualquier otra cosa.
  --    Los mensajes del perfil son los mismos que en AGT-01, así el servidor
  --    y las pruebas de antes siguen funcionando igual.
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

  -- Solo estas cuatro secciones existen. Chequearlo acá también nos permite
  -- elegir la columna con un "case" más abajo, sin armar SQL con texto.
  if p_section is null
     or p_section not in ('profile', 'knowledge', 'instructions', 'criteria') then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: section must be profile, knowledge, instructions or criteria';
  end if;

  -- El conocimiento es una lista (array); las demás secciones son objetos.
  if p_section = 'knowledge' then
    v_expected_type := 'array';
  else
    v_expected_type := 'object';
  end if;

  -- Para el perfil el mensaje queda "profile must be a JSON object", igual
  -- que en AGT-01. p_section ya es una de las cuatro, no viene texto libre.
  if p_value is null or jsonb_typeof(p_value) <> v_expected_type then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: ' || p_section || ' must be a JSON ' || v_expected_type;
  end if;

  -- null significa "es la primera versión"; si viene un número, tiene que ser 1 o más.
  if p_base_version is not null and p_base_version < 1 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: base version must be 1 or greater';
  end if;

  -- 3. Solo los admin de esa empresa pueden guardar. El vendedor puede ver,
  --    pero no editar. Y alguien de otra empresa no puede ni ver ni editar.
  if not exists (
    select 1 from public.company_members as member
    where member.company_id = p_company_id
      and member.user_id = v_user
      and member.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN: only company admins can edit the agent';
  end if;

  -- 4. Idempotencia (PLAT-02): si este mismo action_id ya se guardó con los
  --    mismos datos, devolvemos el resultado de esa vez sin crear nada nuevo.
  --    Si se reusa con OTROS datos (u otra sección), claim_action lanza un
  --    CONFLICT.
  --
  --    Para el perfil usamos EXACTAMENTE la operación y los datos de AGT-01.
  --    Si los cambiáramos, un reintento de un guardado hecho antes de esta
  --    migración no se reconocería y daría CONFLICT.
  --    Las otras secciones usan "agent.save_" + la sección (por ejemplo
  --    'agent.save_knowledge') y guardan también el nombre de la sección.
  if p_section = 'profile' then
    v_operation := 'agent.save_company_profile';
    v_payload := jsonb_build_object('base_version', p_base_version, 'profile', p_value);
  else
    v_operation := 'agent.save_' || p_section;
    v_payload := jsonb_build_object(
      'base_version', p_base_version,
      'section', p_section,
      'value', p_value
    );
  end if;

  select claim.claimed, claim.cached_result
    into v_claimed, v_cached_result
    from app_private.claim_action(
      p_company_id,
      'user',
      v_user,
      p_action_id,
      v_operation,
      v_payload
    ) as claim;

  if not v_claimed then
    return v_cached_result;
  end if;

  -- 5. Candado por empresa (el mismo de AGT-01): si dos personas guardan al
  --    mismo tiempo, la segunda espera acá a que termine la primera. Sin
  --    esto, las dos podrían leer "la última es la 3" y las dos intentar
  --    crear la 4. El candado se suelta solo cuando termina la transacción.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent_profiles:' || p_company_id::text, 0)
  );

  -- 6. Leer la versión vigente (la de número más alto) con TODAS sus
  --    secciones. Si la empresa todavía no tiene ninguna, quedan en null.
  select profile_row.version,
         profile_row.profile,
         profile_row.knowledge,
         profile_row.instructions,
         profile_row.criteria
    into v_current_version,
         v_current_profile,
         v_current_knowledge,
         v_current_instructions,
         v_current_criteria
    from public.agent_profiles as profile_row
   where profile_row.company_id = p_company_id
   order by profile_row.version desc
   limit 1;

  -- 7. Primero el perfil: toda versión necesita uno. Si la empresa no tiene
  --    ninguna versión, no se puede guardar conocimiento, instrucciones ni
  --    criterios. Va antes del chequeo de base_version para que la pantalla
  --    diga "completá el perfil" y no "alguien guardó antes que vos".
  if p_section <> 'profile' and v_current_version is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: profile required';
  end if;

  -- 8. ¿La persona estaba editando la versión vigente? Si mientras tanto
  --    alguien guardó otra, frenamos para no pisarle el trabajo.
  --    "is distinct from" compara tratando dos null como iguales (mismas
  --    reglas que AGT-01):
  --      * no hay versiones y base es null  -> iguales, se sigue (primer perfil)
  --      * no hay versiones y base es 1     -> distintos, CONFLICT
  --      * vigente es 2 y base es null o 1  -> distintos, CONFLICT
  if p_base_version is distinct from v_current_version then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT: stale base version';
  end if;

  -- 9. ¿Qué tiene hoy la sección que se quiere guardar?
  v_current_value := case p_section
    when 'profile' then v_current_profile
    when 'knowledge' then v_current_knowledge
    when 'instructions' then v_current_instructions
    when 'criteria' then v_current_criteria
  end;

  if v_current_version is not null and v_current_value is not distinct from p_value then
    -- Sin cambios, sin versión nueva. En un objeto, la igualdad de jsonb no
    -- mira el orden de las claves ({"a":1,"b":2} es igual a {"b":2,"a":1}).
    -- En una lista sí importa el orden: reordenar los ítems es un cambio.
    v_result := jsonb_build_object('version', v_current_version, 'created', false);
  else
    -- 10. Crear la versión siguiente. La sección que se guarda toma el valor
    --     nuevo y TODAS las demás se copian de la vigente, porque cada
    --     versión es la foto completa de la configuración del agente.
    --     Cada "case" elige, columna por columna, si va el valor nuevo o el
    --     que ya estaba.
    v_new_version := coalesce(v_current_version, 0) + 1;

    insert into public.agent_profiles (
      company_id,
      version,
      profile,
      knowledge,
      instructions,
      criteria,
      created_by
    ) values (
      p_company_id,
      v_new_version,
      case when p_section = 'profile' then p_value else v_current_profile end,
      case when p_section = 'knowledge' then p_value else v_current_knowledge end,
      case when p_section = 'instructions' then p_value else v_current_instructions end,
      case when p_section = 'criteria' then p_value else v_current_criteria end,
      v_user
    );

    v_result := jsonb_build_object('version', v_new_version, 'created', true);
  end if;

  -- 11. Guardar el resultado en el recibo, para que un reintento con el mismo
  --     action_id reciba exactamente esta misma respuesta.
  perform app_private.complete_action(p_company_id, p_action_id, v_result);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_agent_profile pasa a delegar en save_agent_section
-- ---------------------------------------------------------------------------

-- Misma firma que en AGT-01 (mismos parámetros, mismo tipo de respuesta), así
-- quien ya la usaba no nota ningún cambio. "create or replace" cambia solo el
-- cuerpo de la función; no se borra ni se crea otra.
--
-- Antes copiaba solo instrucciones y criterios, y un perfil nuevo dejaba la
-- versión sin conocimiento. Ahora todo pasa por save_agent_section, que copia
-- todas las secciones.
--
-- Es "security invoker" (corre con los permisos de quien la llama) porque no
-- necesita ningún poder extra: solo llama a save_agent_section, que el
-- usuario con sesión ya puede ejecutar y que hace todos los controles.
create or replace function public.save_agent_profile(
  p_company_id uuid,
  p_action_id text,
  p_base_version integer,
  p_profile jsonb
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select public.save_agent_section(p_company_id, p_action_id, p_base_version, 'profile', p_profile);
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------

-- Por defecto Postgres deja que cualquiera ejecute una función nueva. Lo
-- sacamos y dejamos solo a los usuarios con sesión (authenticated).
revoke all on function public.save_agent_section(uuid, text, integer, text, jsonb) from public, anon;
grant execute on function public.save_agent_section(uuid, text, integer, text, jsonb) to authenticated;

-- "create or replace" conserva los permisos que ya tenía save_agent_profile.
-- Igual los volvemos a escribir para que se lean acá y queden seguros.
revoke all on function public.save_agent_profile(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.save_agent_profile(uuid, text, integer, jsonb) to authenticated;
