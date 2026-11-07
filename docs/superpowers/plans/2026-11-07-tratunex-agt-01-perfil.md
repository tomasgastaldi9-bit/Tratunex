# AGT-01 Perfil de empresa — plan de implementación

> Para agentes: se ejecuta con superpowers:subagent-driven-development. Cada tarea tiene su propio worktree y su rama; el controlador las integra en `feat/TRA-33-perfil-empresa`.

**Objetivo:** que un admin de la empresa cargue el perfil de su agente en `/agent/profile`, que cada guardado cree una versión nueva sin duplicados ni pisadas, y que `/agent` muestre el resumen.

**Spec (fuente de verdad):** [`src/features/agent/README.md`](../../../src/features/agent/README.md) y el contrato [`src/contracts/agent.ts`](../../../src/contracts/agent.ts). Ambos ya están en la rama base. Si algo de este plan los contradice, ganan ellos.

## Global Constraints

- Tocá **solo** los archivos de tu tarea. No edites `src/contracts/**`, `src/components/ui/**`, `src/lib/**`, `src/app/layout.tsx`, `src/app/globals.css`, otras migraciones ni `package.json`. No agregues dependencias.
- Si necesitás cambiar el contrato o el README, no lo hagas: reportá `NEEDS_CONTEXT` explicando qué y por qué.
- Comentarios **en español, simples**, pensados para alguien que está aprendiendo a programar: explicá el *por qué*, no solo el *qué*.
- Toda función del servidor devuelve `Result<T>` de `src/contracts/common.ts`. Un error nunca se convierte en éxito ni en datos inventados.
- `company_id` sale siempre de `Ctx` (del servidor), nunca de lo que mande el navegador.
- Vitest no resuelve `@/`: en archivos que importa un test, los imports con valor usan ruta relativa; `import type` con `@/` funciona.
- Tailwind lee los comentarios: no escribas en comentarios algo con forma de clase incompleta (ver `docs/DESIGN.md`, "Trampas conocidas").
- No corras `next dev` ni `next build` (hay otro servidor de desarrollo usando la carpeta principal). Sí: `npx vitest run <archivos>`, `npm run typecheck`, `npx eslint <archivos>`.
- En tu worktree, enlazá las dependencias en vez de reinstalar: `ln -s /Users/valentinodonayo/hack-ba/Tratunex/node_modules node_modules`.
- Commit en tu rama con mensaje Conventional Commits en español, por ejemplo `feat(TRA-33): tabla agent_profiles con versiones`, terminando con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No hagas push.
- Nunca escribas secretos ni teléfonos reales.

---

### Task 1: Base de datos — tabla `agent_profiles`, funciones y pruebas pgTAP

**Archivos:**
- Crear: `supabase/migrations/20261107153700_add_agent_profiles.sql`
- Crear: `supabase/tests/database/agent_profiles.test.sql`

**Leé antes:** `supabase/migrations/20261107142954_add_idempotent_action_receipts.sql` (cómo usar `app_private.claim_action` / `complete_action`), `supabase/migrations/20261107144610_add_company_membership.sql` (estilo de RLS y grants) y `supabase/tests/database/company_isolation.test.sql` (estilo de pgTAP: usuarios en `auth.users`, `set local role authenticated`, `request.jwt.claim.sub`).

**Tabla `public.agent_profiles`:** exactamente las columnas, tipos y restricciones de la sección "Base de datos" del README. Además: check de que `profile` sea un objeto JSON (`jsonb_typeof`) y de que `instructions`/`criteria` sean null u objeto. Índice único `(company_id, version)`.

**Permisos:** RLS activado. `revoke all` a `public, anon, authenticated`; `grant select` a `authenticated`. Política de lectura: el usuario es miembro (`company_members`) de `company_id`. Sin políticas ni grants de insert/update/delete.

**`public.can_edit_agent_profile(p_company_id uuid) returns boolean`:** `language sql stable`, `security invoker`, `set search_path = pg_catalog, public`. Devuelve si existe una fila en `company_members` con ese `company_id`, `user_id = (select auth.uid())` y `role = 'admin'`.

**`public.save_agent_profile(p_company_id uuid, p_action_id text, p_base_version integer, p_profile jsonb) returns jsonb`:** `language plpgsql`, `security definer`, `set search_path = pg_catalog, public, app_private, extensions`. En este orden:
1. `v_user := auth.uid()`. Si es null → `raise exception using errcode = '42501', message = 'FORBIDDEN: sign in required'`.
2. Validar: `p_company_id` no null, `p_action_id` no vacío (`btrim`), `p_profile` objeto JSON, `p_base_version` null o `>= 1`. Si no → `errcode '22023'`, mensaje que empiece con `VALIDATION_ERROR:`.
3. Si `v_user` no es admin de `p_company_id` (consulta a `company_members`) → `errcode '42501'`, `message 'FORBIDDEN: only company admins can edit the agent'`.
4. `select * from app_private.claim_action(p_company_id, 'user', v_user, p_action_id, 'agent.save_company_profile', jsonb_build_object('base_version', p_base_version, 'profile', p_profile))`. Si `claimed = false` → devolver `cached_result` y terminar.
5. `pg_advisory_xact_lock(hashtextextended('agent_profiles:' || p_company_id::text, 0))` para que dos guardados de la misma empresa no calculen el mismo número.
6. Leer la última versión de la empresa (`order by version desc limit 1`).
7. Si `p_base_version` no coincide con la versión vigente (incluye: no hay versiones y `p_base_version` no es null, o hay versiones y `p_base_version` es null o distinto) → `errcode 'P0001'`, `message 'CONFLICT: stale base version'`.
8. Si hay versión vigente y su `profile = p_profile` (igualdad de `jsonb`) → resultado `{"version": <vigente>, "created": false}`.
9. Si no, insertar `version = coalesce(vigente, 0) + 1`, `profile = p_profile`, `instructions` y `criteria` copiados de la vigente (null si no hay), `created_by = v_user` → resultado `{"version": <nueva>, "created": true}`.
10. `perform app_private.complete_action(p_company_id, p_action_id, <resultado>)` y devolver el resultado.

Grants de ambas funciones: `revoke all ... from public, anon`; `grant execute ... to authenticated`.

**Pruebas pgTAP (`agent_profiles.test.sql`)**, en una transacción con `rollback` al final. Datos: usuario A admin de Empresa A, usuario V vendedor de Empresa A, usuario B admin de Empresa B. Probar como mínimo:
1. A guarda el primer perfil (`base_version` null) → `{"version": 1, "created": true}`.
2. Repetir el mismo `action_id` con los mismos datos → mismo resultado y sigue habiendo 1 fila.
3. Mismo `action_id` con otro perfil → lanza error con `CONFLICT`.
4. Perfil idéntico con `action_id` nuevo y `base_version` 1 → `{"version": 1, "created": false}` y no hay fila nueva.
5. Perfil distinto con `base_version` 1 → versión 2.
6. Guardar otra vez con `base_version` 1 (vieja) → lanza `CONFLICT: stale base version`.
7. La versión nueva copia `instructions` y `criteria` de la anterior (cargalos con el rol del test antes de cambiar de rol).
8. V lee las versiones de Empresa A, `can_edit_agent_profile` da false para V y true para A, y V no puede guardar (`42501`).
9. B no ve filas de Empresa A y no puede guardar en Empresa A (`42501`).
10. `insert`/`update`/`delete` directo en `agent_profiles` como `authenticated` falla (`42501`).
11. `anon` no puede leer la tabla ni ejecutar las funciones.

**Verificación:** si Docker está corriendo, `npx supabase@2.117.0 start` (la misma versión que usa el CI) y `npx supabase@2.117.0 test db --local` desde tu worktree; reportá la salida exacta. Si Docker no está disponible, reportalo como `DONE_WITH_CONCERNS` diciendo que las pruebas de base no se pudieron correr (no inventes resultados).

---

### Task 2: Servidor — `getAgentProfile` y `saveCompanyProfile`

**Archivos:**
- Crear: `src/features/agent/server/profile-service.ts`
- Crear: `src/features/agent/server/profile-service.test.ts`
- Modificar: `src/features/agent/server/public.ts` (hoy es un esqueleto que responde "no implementado"; mantené las firmas)

**Leé antes:** `src/contracts/agent.ts`, `src/contracts/common.ts`, `src/features/agent/README.md` (secciones "Funciones SQL", "Servidor" y la tabla de errores), `src/lib/supabase/request.ts`, y `src/lib/auth/company.test.ts` como ejemplo de cómo se prueba con un cliente falso.

**`profile-service.ts`:** exporta `createProfileService(getClient: () => Promise<SupabaseClient>)` (tipo de `@supabase/supabase-js`, como `import type`) que devuelve `{ getAgentProfile, saveCompanyProfile }` con los tipos `GetAgentProfile` y `SaveCompanyProfile` del contrato. Sin `server-only` (para poder probarlo).

`getAgentProfile(ctx)`:
- Valida `ctx` con `ctxSchema`; si falla → `VALIDATION_ERROR`, `retryable: false`.
- Lee de `agent_profiles` las columnas `version, profile, created_at, created_by`, filtrando por `ctx.company_id`, la de `version` más alta (`maybeSingle`).
- Llama `rpc("can_edit_agent_profile", { p_company_id: ctx.company_id })`.
- Si alguna consulta devuelve error o tira excepción → `PROVIDER_UNAVAILABLE`, mensaje `"No pudimos leer la configuración del agente. Probá de nuevo en un rato."`, `retryable: true`.
- Valida la fila con `agentProfileVersionSchema`; si no cumple → `PROVIDER_ERROR`, mensaje `"La versión guardada tiene un formato inesperado."`, `retryable: false`.
- Devuelve `{ current: <versión o null>, can_edit: <booleano> }`.

`saveCompanyProfile(ctx, input)`:
- Valida `ctx` con `actionCtxSchema` y `input` con `saveCompanyProfileInputSchema` (usá el valor parseado: viene normalizado, con días ordenados y textos sin espacios sobrantes). Si falla → `VALIDATION_ERROR` con el mensaje del primer problema, `retryable: false`.
- Si `ctx.actor_type !== "user"` → `FORBIDDEN`, mensaje `"Solo una persona admin puede cambiar el agente."`, `retryable: false`.
- Llama `rpc("save_agent_profile", { p_company_id: ctx.company_id, p_action_id: ctx.action_id, p_base_version: input.base_version, p_profile: <perfil parseado> })`.
- Traduce los errores de la base según el mensaje y el código:
  - código `42501` o mensaje que empieza con `FORBIDDEN` → `FORBIDDEN`, `"Solo una persona admin de la empresa puede cambiar el agente."`, `retryable: false`
  - mensaje que empieza con `CONFLICT: stale base version` → `CONFLICT`, `"Alguien guardó cambios mientras editabas. Recargá la página para ver la última versión."`, `retryable: false`
  - otro mensaje que empieza con `CONFLICT` → `CONFLICT`, `"Este guardado ya se usó con otros datos. Recargá la página y probá de nuevo."`, `retryable: false`
  - mensaje que empieza con `VALIDATION_ERROR` → `VALIDATION_ERROR`, `"Hay datos con un formato inválido. Revisalos y probá de nuevo."`, `retryable: false`
  - cualquier otro error o excepción → `PROVIDER_UNAVAILABLE`, `"No pudimos guardar. Revisá tu conexión y probá de nuevo."`, `retryable: true`
- Valida la respuesta con `saveCompanyProfileOutputSchema`; si no cumple → `PROVIDER_ERROR`, `"La base respondió algo inesperado al guardar."`, `retryable: false`.

**`public.ts`:** conserva `import "server-only"` y las dos exportaciones con sus tipos. Arma el servicio con el cliente real: para `getAgentProfile`, `createRequestSupabaseClient({ readOnlyCookies: true })` (se llama desde páginas del servidor, que no pueden escribir cookies); para `saveCompanyProfile`, `createRequestSupabaseClient()`. Sacá el esqueleto "no implementado".

**Pruebas (`profile-service.test.ts`, Vitest, cliente falso):** cada rama de arriba al menos una vez: ctx inválido, perfil inválido, actor que no es usuario, sin versiones (`current: null`), versión válida, fila con formato roto, error de lectura, cada traducción de error de `save_agent_profile`, excepción en el rpc, respuesta inesperada, y que el rpc recibe `ctx.company_id`, `ctx.action_id` y el perfil normalizado (días ordenados).

**Verificación:** `npx vitest run src/features/agent/server`, `npm run typecheck`, `npx eslint src/features/agent/server`. Reportá la salida exacta.

---

### Task 3: Pantallas — `/agent` y `/agent/profile`

**Archivos:**
- Crear: `src/app/agent/layout.tsx`
- Crear: `src/app/agent/page.tsx`
- Crear: `src/app/agent/profile/page.tsx`
- Crear: `src/app/agent/profile/actions.ts`
- Crear: `src/features/agent/components/ProfileForm.tsx`
- Crear: `src/features/agent/components/DayPicker.tsx`
- Crear: `src/features/agent/components/profile-form-data.ts`
- Crear: `src/features/agent/components/profile-form-data.test.ts`

**Leé antes:** `docs/DESIGN.md` completo, los comentarios de arriba de cada componente que uses en `src/components/ui/`, `src/app/ui/page.tsx` (ejemplos), `src/contracts/agent.ts`, `src/features/agent/README.md` (secciones "action_id" y "Pantallas"), `src/features/agent/server/public.ts` (firmas; hoy responde "no implementado", la tarea 2 lo completa en paralelo), `src/features/platform/server/public.ts` y `docs/PLATFORM_AUTH.md` (cómo obtener `Ctx`).

**`layout.tsx`:** envuelve a los hijos en `AppShell`, como dice `docs/DESIGN.md`.

**Contexto en las páginas (servidor):** `getCompanyContext(undefined, { readOnlyCookies: true })`. Si falla, no se muestra el formulario sino un `Alert`:
- `VALIDATION_ERROR` (no hay empresa elegida) → `tone="warning"`, "Elegí una empresa para seguir", con un `Link` con estilo de botón (`buttonStyles`) a `/login/companies`.
- `FORBIDDEN` → `tone="warning"`, "Iniciá sesión para ver tu agente", con link a `/login`.
- `PROVIDER_UNAVAILABLE` u otro → `tone="danger"`, "No pudimos comprobar tu acceso", "Probá de nuevo en un rato."
Si `getAgentProfile` falla, `Alert tone="danger"` con su `message`.

**`/agent` (`page.tsx`):** `PageHeader` título "Agente", descripción "Lo que tu agente sabe de tu empresa y cómo habla en cada llamada.". Debajo:
- Un `Badge` con "Versión N" si hay versión, o "Sin configurar" (`tone="warning"`) si no.
- `ProgressCard` título "Configuración del agente" con los pasos en este orden: "Perfil de empresa" (hecho si hay versión), "Instrucciones del vendedor", "Criterios de cliente potencial", "Base de conocimiento" (estos tres, no hechos por ahora). Acción: link con estilo de botón a `/agent/profile` que dice "Completar perfil" si no hay versión y "Editar perfil" si hay.
- Una lista (`ul` + `ListItem`) con las cuatro secciones: "Perfil de empresa" con link "Abrir" a `/agent/profile`; las otras tres con `Badge` "Próximamente" y sin link.

**`/agent/profile` (`page.tsx`):** `PageHeader` título "Perfil de empresa", descripción "Qué vende tu empresa, a quién, cómo habla el agente y cuándo puede llamar.". Lee `searchParams` (en Next 16 es una `Promise`):
- `saved=N&created=1` → `Alert tone="success"` "Guardamos la versión N" + "La próxima llamada ya la usa."
- `saved=N&created=0` → `Alert tone="info"` "No había cambios" + "Seguís en la versión N."
- Si `can_edit` es false → `Alert tone="info"` "Solo una persona admin puede cambiar el perfil" + "Lo podés ver, pero no editar."
Genera un `action_id` nuevo con `crypto.randomUUID()` en cada render y renderiza `ProfileForm` con: valores iniciales (los de la versión vigente, o vacíos con `DEFAULT_TONE` y `DEFAULT_CALL_WINDOW` del contrato), `base_version` (número o null), `action_id` y `can_edit`.

**`profile-form-data.ts` (lógica pura, probada):**
- `readProfileForm(formData)`: arma `{ action_id, input: { base_version, profile } }` desde los campos del formulario. Nombres de campo: `industry`, `offering`, `target_customer`, `value_proposition`, `zone`, `tone`, `days` (varios, uno por casilla), `start`, `end`, `base_version` (oculto; `""` = null), `action_id` (oculto). Los días llegan como texto: convertilos a número.
- `profileFieldErrors(error)`: convierte un `ZodError` de `saveCompanyProfileInputSchema` en `{ [campo]: mensaje }` con las claves de arriba (`profile.call_window.days` → `days`, `profile.call_window.end` → `end`, `profile.offering` → `offering`, etc.). Un mensaje por campo (el primero).

**`actions.ts` (`"use server"`):** `saveProfileAction(prevState, formData)` para `useActionState`:
1. `readProfileForm` y validación con `saveCompanyProfileInputSchema`. Si falla → estado de error con `fieldErrors`, mensaje general "Revisá los campos marcados.", los valores que escribió la persona y un `action_id` **nuevo**.
2. `getCompanyContext()` (por defecto, desde una acción). Si falla → estado de error con su mensaje.
3. `saveCompanyProfile({ ...ctx, action_id }, input)`. Si falla → estado de error con su `message`, los valores escritos y el `action_id`: el **mismo** si `retryable` es true, uno **nuevo** si es false (ver README, "action_id").
4. Si sale bien → `redirect("/agent/profile?saved=<version>&created=<1|0>")`.
El tipo del estado se exporta para que lo use `ProfileForm`.

**`ProfileForm.tsx` (`"use client"`):** usa `useActionState(saveProfileAction, …)`.
- Campos con el kit: `Select` "Rubro" (opciones de `INDUSTRY_LABELS`, con placeholder "Elegí el rubro"), `Textarea` "Qué vende tu empresa", "A quién le vende" y "Propuesta de valor" (`maxLength` = `PROFILE_TEXT_MAX`), `Input` "Zona" (opcional, hint "Dónde están tus clientes. Ejemplo: CABA y GBA.", `maxLength` = `PROFILE_ZONE_MAX`), `Select` "Tono del agente" (`TONE_LABELS`), `DayPicker`, `Input type="time"` "Desde" y "Hasta" con hint "Hora de Argentina". Todos con `required` salvo Zona. Campos ocultos `base_version` y `action_id`.
- React 19 vacía el formulario después de cada envío: para no perder lo que escribió la persona cuando hay error, usá los valores devueltos en el estado como valores iniciales y cambiá la `key` del formulario en cada respuesta.
- Muestra el error de cada campo (prop `error` del kit) y, si hay mensaje general, un `Alert tone="danger"` arriba del botón.
- Botón `primary` "Guardar perfil" con `loading` mientras envía (texto "Guardando…").
- Si `can_edit` es false: todo dentro de un `fieldset disabled` y sin botón de guardar.
- En celular todo en una columna; desde tablet, "Desde"/"Hasta" lado a lado y Rubro/Tono lado a lado.

**`DayPicker.tsx`:** `fieldset` con `legend` "Días para llamar" y 7 casillas (`input type="checkbox" name="days" value="1".."7"`) con aspecto de botón-pastilla: sin marcar `bg-surface`, marcada `bg-ink text-white`, `rounded-control`, mínimo 40 px de alto, foco visible. Texto visible corto ("Lun", "Mar"…) pero nombre accesible completo (`WEEKDAY_LABELS`). Recibe los días marcados al inicio, `error` y `disabled`. Muestra el error debajo con el mismo estilo que los demás campos.

**Pruebas (`profile-form-data.test.ts`):** `readProfileForm` con días múltiples, `base_version` vacío y con número, zona vacía; `profileFieldErrors` mapeando un error de texto, de días y de hora de fin.

**Verificación:** `npx vitest run src/features/agent/components`, `npm run typecheck`, `npx eslint src/app/agent src/features/agent/components`. Reportá la salida exacta. La prueba visual en el navegador la hace el controlador después de integrar.
