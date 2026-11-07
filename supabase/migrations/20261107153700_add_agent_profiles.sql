-- AGT-01: perfil de empresa del agente de voz, con versiones.
--
-- Idea general (ver src/features/agent/README.md):
--   * Cada guardado AGREGA una fila nueva (versión 1, 2, 3...). Nunca se pisa
--     una versión vieja, así cada llamada puede decir con qué versión se hizo.
--   * La versión vigente es la de número más alto.
--   * Nadie escribe la tabla directo: solo la función save_agent_profile, que
--     controla permisos, conflictos y duplicados en un solo lugar.

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------

create table public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  -- Si se borra la empresa, se borran sus versiones: no tienen sentido solas.
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Número de versión dentro de la empresa. Empieza en 1.
  version integer not null check (version >= 1),
  -- El perfil siempre tiene que ser un objeto JSON (no una lista, ni un texto).
  -- La forma exacta de sus campos la valida el servidor con companyProfileSchema.
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  -- Las llenan AGT-03 y AGT-04 más adelante. Pueden estar vacías (null),
  -- pero si tienen algo, tiene que ser un objeto JSON.
  instructions jsonb check (instructions is null or jsonb_typeof(instructions) = 'object'),
  criteria jsonb check (criteria is null or jsonb_typeof(criteria) = 'object'),
  -- Quién guardó. Si ese usuario se borra, queda null pero la versión sigue.
  created_by uuid references auth.users(id) on delete set null,
  -- now() en timestamptz se guarda siempre en UTC.
  created_at timestamptz not null default now()
);

-- Una empresa no puede tener dos veces la misma versión. Es la última red de
-- seguridad si dos guardados llegaran a calcular el mismo número. Además este
-- índice hace rápido buscar "la última versión de esta empresa".
create unique index agent_profiles_company_version_key
  on public.agent_profiles (company_id, version);

-- ---------------------------------------------------------------------------
-- Permisos de la tabla
-- ---------------------------------------------------------------------------

-- RLS (Row Level Security) hace que cada usuario vea solo las filas que una
-- política le permite. Sin políticas de insert/update/delete, nadie con el
-- rol authenticated puede escribir directo.
alter table public.agent_profiles enable row level security;

-- Primero sacamos todos los permisos y después damos solo el de leer.
-- anon (visitante sin sesión) no recibe nada.
revoke all on public.agent_profiles from public, anon, authenticated;
grant select on public.agent_profiles to authenticated;

-- Admin y vendedor pueden leer las versiones de las empresas donde son miembros.
-- El "(select auth.uid())" entre paréntesis hace que Postgres calcule el
-- usuario una sola vez por consulta y no una vez por fila.
create policy "members can read their company agent profiles" on public.agent_profiles
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = agent_profiles.company_id
        and member.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- ¿Puede editar? (para mostrar u ocultar el botón Guardar)
-- ---------------------------------------------------------------------------

-- Devuelve true si el usuario de la sesión es admin de esa empresa.
-- Es "security invoker": corre con los permisos de quien la llama, así que
-- solo puede ver sus propias membresías (por la RLS de company_members).
-- Ocultar el botón no alcanza como seguridad: save_agent_profile vuelve a
-- chequear el rol adentro de la base.
create function public.can_edit_agent_profile(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.company_members as member
    where member.company_id = p_company_id
      and member.user_id = (select auth.uid())
      and member.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Guardar el perfil como versión nueva
-- ---------------------------------------------------------------------------

-- Devuelve {"version": n, "created": true/false}.
--
-- Es "security definer": corre con los permisos del dueño de la función y no
-- con los del usuario. Lo necesitamos porque el usuario no puede escribir la
-- tabla directo ni usar app_private. Por eso mismo la función chequea ella
-- sola quién es el usuario y si es admin, antes de tocar nada.
--
-- El search_path fijo evita que alguien "esconda" una tabla o función con el
-- mismo nombre en otro esquema. Igual escribimos siempre esquema.nombre.
--
-- Si algo falla en el medio (por ejemplo un CONFLICT), la excepción deshace
-- TODO lo que hizo la función, incluido el recibo de claim_action. Así el
-- action_id no queda "trabado" a medio guardar.
create function public.save_agent_profile(
  p_company_id uuid,
  p_action_id text,
  p_base_version integer,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  v_user uuid;
  v_claimed boolean;
  v_cached_result jsonb;
  v_current_version integer;
  v_current_profile jsonb;
  v_current_instructions jsonb;
  v_current_criteria jsonb;
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

  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION_ERROR: profile must be a JSON object';
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
  --    Si se reusa con OTROS datos, claim_action lanza un CONFLICT.
  --    Esto sirve para los reintentos: si la red se cortó pero la base sí
  --    guardó, el segundo intento no crea una versión repetida.
  select claim.claimed, claim.cached_result
    into v_claimed, v_cached_result
    from app_private.claim_action(
      p_company_id,
      'user',
      v_user,
      p_action_id,
      'agent.save_company_profile',
      jsonb_build_object('base_version', p_base_version, 'profile', p_profile)
    ) as claim;

  if not v_claimed then
    return v_cached_result;
  end if;

  -- 5. Candado por empresa: si dos personas guardan al mismo tiempo, la
  --    segunda espera acá a que termine la primera. Sin esto, las dos podrían
  --    leer "la última es la 3" y las dos intentar crear la 4.
  --    El candado se suelta solo cuando termina la transacción.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent_profiles:' || p_company_id::text, 0)
  );

  -- 6. Leer la versión vigente (la de número más alto). Si la empresa todavía
  --    no tiene ninguna, todas estas variables quedan en null.
  select profile_row.version,
         profile_row.profile,
         profile_row.instructions,
         profile_row.criteria
    into v_current_version,
         v_current_profile,
         v_current_instructions,
         v_current_criteria
    from public.agent_profiles as profile_row
   where profile_row.company_id = p_company_id
   order by profile_row.version desc
   limit 1;

  -- 7. ¿La persona estaba editando la versión vigente? Si mientras tanto
  --    alguien guardó otra, frenamos para no pisarle el trabajo.
  --    "is distinct from" compara tratando dos null como iguales, así cubre
  --    todos los casos de una vez:
  --      * no hay versiones y base es null  -> iguales, se sigue (primera vez)
  --      * no hay versiones y base es 1     -> distintos, CONFLICT
  --      * vigente es 2 y base es null o 1  -> distintos, CONFLICT
  if p_base_version is distinct from v_current_version then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT: stale base version';
  end if;

  if v_current_version is not null and v_current_profile = p_profile then
    -- 8. Sin cambios, sin versión nueva. La igualdad de jsonb no mira el
    --    orden de las claves, así que {"a":1,"b":2} es igual a {"b":2,"a":1}.
    v_result := jsonb_build_object('version', v_current_version, 'created', false);
  else
    -- 9. Crear la versión siguiente. Las otras secciones (instrucciones y
    --    criterios) se copian de la vigente, porque cada versión es la foto
    --    completa de la configuración del agente.
    v_new_version := coalesce(v_current_version, 0) + 1;

    insert into public.agent_profiles (
      company_id,
      version,
      profile,
      instructions,
      criteria,
      created_by
    ) values (
      p_company_id,
      v_new_version,
      p_profile,
      v_current_instructions,
      v_current_criteria,
      v_user
    );

    v_result := jsonb_build_object('version', v_new_version, 'created', true);
  end if;

  -- 10. Guardar el resultado en el recibo, para que un reintento con el mismo
  --     action_id reciba exactamente esta misma respuesta.
  perform app_private.complete_action(p_company_id, p_action_id, v_result);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------

-- Por defecto Postgres deja que cualquiera ejecute una función nueva. Lo
-- sacamos y dejamos solo a los usuarios con sesión (authenticated).
revoke all on function public.can_edit_agent_profile(uuid) from public, anon;
grant execute on function public.can_edit_agent_profile(uuid) to authenticated;

revoke all on function public.save_agent_profile(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.save_agent_profile(uuid, text, integer, jsonb) to authenticated;
