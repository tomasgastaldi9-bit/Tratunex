# AGT-02 Base de conocimiento — plan de implementación

> Para agentes: se ejecuta con superpowers:subagent-driven-development. Cada tarea tiene su propio worktree y su rama; el controlador las integra en `feat/TRA-34-base-conocimiento`.

**Objetivo:** que un admin cargue en `/agent/knowledge` la lista de productos/servicios (con precio orientativo opcional) y preguntas frecuentes de su empresa, con un contador visible de 6.000 caracteres, y que "Guardar conocimiento" cree UNA versión nueva del agente con la lista completa.

**Spec (fuente de verdad):** [`src/features/agent/README.md`](../../../src/features/agent/README.md) (decisiones 1–10, "Funciones SQL", errores) y el contrato [`src/contracts/agent.ts`](../../../src/contracts/agent.ts) (sección "Base de conocimiento" y `saveAgentKnowledge`). Ambos ya están en la rama base. Si este plan los contradice, ganan ellos.

## Global Constraints

- Tocá **solo** los archivos de tu tarea. No edites `src/contracts/**`, `src/components/ui/**`, `src/lib/**`, `src/app/layout.tsx`, `src/app/globals.css`, migraciones existentes ni `package.json`. No agregues dependencias.
- Si necesitás cambiar el contrato o el README, no lo hagas: reportá `NEEDS_CONTEXT`.
- Comentarios **en español, simples**, para alguien que está aprendiendo a programar: explicá el *por qué*.
- Toda función del servidor devuelve `Result<T>` de `src/contracts/common.ts`. Un error nunca se convierte en éxito ni en datos inventados. `company_id` sale siempre de `Ctx`.
- Vitest no resuelve `@/`: en archivos que importa un test, los imports con valor usan ruta relativa.
- Tailwind lee los comentarios: nada con forma de clase incompleta en comentarios (ver `docs/DESIGN.md`).
- No corras `next dev` ni `next build`. Sí: `npx vitest run <archivos>`, `npm run typecheck`, `npx eslint <archivos>`.
- En tu worktree, `node_modules` ya está enlazado. No commitees `node_modules`, `tsconfig.tsbuildinfo`, `next-env.d.ts` ni `.superpowers/`.
- Commit en tu rama, Conventional Commits en español (`feat(TRA-34): …`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No hagas push.

---

### Task 1: Base de datos — columna `knowledge` y función `save_agent_section`

**Archivos:**
- Crear: `supabase/migrations/20261107164500_add_agent_knowledge.sql`
- Crear: `supabase/tests/database/agent_sections.test.sql`

**Leé antes:** `supabase/migrations/20261107153700_add_agent_profiles.sql` (la función actual `save_agent_profile`, su estilo, grants y comentarios), `supabase/tests/database/agent_profiles.test.sql` (estilo de pruebas, datos de prueba) y el README (decisiones 8–10, "Funciones SQL", tabla de errores).

**Migración (NO edites la migración de AGT-01; esta es nueva):**
1. `alter table public.agent_profiles add column knowledge jsonb` con check: null o `jsonb_typeof(knowledge) = 'array'`.
2. `create function public.save_agent_section(p_company_id uuid, p_action_id text, p_base_version integer, p_section text, p_value jsonb) returns jsonb` — `plpgsql`, `security definer`, `set search_path = pg_catalog, public, app_private, extensions`, mismo orden que `save_agent_profile`:
   1. `auth.uid()` null → `42501`, `FORBIDDEN: sign in required`.
   2. Validar: `p_company_id` no null; `p_action_id` no vacío; `p_section` en `('profile','knowledge','instructions','criteria')`; `p_value` objeto para `profile`/`instructions`/`criteria` y array para `knowledge`; `p_base_version` null o `>= 1`. Si no → `22023`, mensaje que empiece con `VALIDATION_ERROR:`.
   3. No admin de la empresa → `42501`, `FORBIDDEN: only company admins can edit the agent`.
   4. `claim_action` con operación `'agent.save_company_profile'` si `p_section = 'profile'` (payload `jsonb_build_object('base_version', p_base_version, 'profile', p_value)`, EXACTAMENTE el de AGT-01), si no `'agent.save_' || p_section` (payload `jsonb_build_object('base_version', p_base_version, 'section', p_section, 'value', p_value)`). Si no se reclamó → devolver el resultado guardado.
   5. Lock por empresa (mismo que AGT-01).
   6. Leer la versión vigente.
   7. Si `p_section <> 'profile'` y no hay versiones → `22023`, `VALIDATION_ERROR: profile required`.
   8. Si `p_base_version` no coincide con la vigente (mismas reglas que AGT-01) → `P0001`, `CONFLICT: stale base version`.
   9. Si la sección vigente es igual a `p_value` (`is not distinct from`) → `{"version": <vigente>, "created": false}`.
   10. Si no, insertar la versión siguiente con `p_value` en la columna de la sección y **copiando todas las demás** (`profile`, `knowledge`, `instructions`, `criteria`) de la vigente → `{"version": <nueva>, "created": true}`.
   11. `complete_action` y devolver.
   Para elegir la columna sin SQL dinámico, usá `case` por sección en el insert.
3. `create or replace function public.save_agent_profile(...)` con la MISMA firma, que solo devuelve `public.save_agent_section(p_company_id, p_action_id, p_base_version, 'profile', p_profile)`. Así un perfil nuevo ya no pierde el conocimiento.
4. Grants: `revoke all … from public, anon`; `grant execute … to authenticated` para `save_agent_section` (y re-aplicá los de `save_agent_profile` si el `create or replace` los cambiara).

**Pruebas pgTAP (`agent_sections.test.sql`)**, en transacción con `rollback`. Datos propios (ids distintos de `agent_profiles.test.sql`): admin A y vendedor V de Empresa A, admin B de Empresa B. Como mínimo:
1. Conocimiento sin perfil → `VALIDATION_ERROR: profile required`.
2. A guarda perfil (v1) y después conocimiento con base 1 → v2; v2 conserva el `profile` de v1 y tiene el `knowledge`.
3. A guarda un perfil nuevo con base 2 (vía `save_agent_profile`) → v3 **conserva el `knowledge`** de v2 (la regresión que esta tarea evita).
4. Mismo conocimiento otra vez con base 3 → `created: false`.
5. Reintento con el mismo `action_id` y mismos datos → mismo resultado, sin fila nueva; mismo `action_id` con otros datos → `CONFLICT`.
6. Base vieja → `CONFLICT: stale base version`.
7. `p_section` inválida, y objeto en vez de array para `knowledge` → `VALIDATION_ERROR`.
8. V (vendedor) y B (otra empresa) no pueden guardar (`42501`).
9. `anon` no puede ejecutar `save_agent_section`.
Además, las pruebas de `agent_profiles.test.sql` tienen que seguir pasando sin cambios.

**Verificación:** desde `/Users/valentinodonayo/hack-ba/tratunex-agt01-verify` hay un Supabase local corriendo (puertos 553xx; no toques su `supabase/config.toml` ni resetees su base). Copiá ahí tu migración y tu test, aplicá con `npx --yes supabase@2.117.0 migration up --local --include-all` y corré `npx --yes supabase@2.117.0 test db --local`. Pegá la salida exacta. Después borrá de ese worktree los dos archivos que copiaste (la migración ya aplicada queda en la base local; está bien).

---

### Task 2: Servidor — `saveAgentKnowledge` y lectura del conocimiento

**Archivos:**
- Crear: `src/features/agent/server/save-errors.ts` (+ `save-errors.test.ts`)
- Crear: `src/features/agent/server/section-service.ts` (+ `section-service.test.ts`)
- Modificar: `src/features/agent/server/profile-service.ts` (+ su test)
- Modificar: `src/features/agent/server/public.ts` (hoy `saveAgentKnowledge` es un esqueleto que responde "no implementado"; mantené las firmas)

**Leé antes:** contrato (`saveAgentKnowledge`, `knowledgeSchema`, `agentProfileVersionSchema` con `knowledge`), README ("Funciones SQL", tabla de errores), y `profile-service.ts` + su test (patrón a seguir).

- `save-errors.ts`: mové ahí la traducción de errores de guardado que hoy está en `profile-service.ts` (sin cambiar sus mensajes ni su `console.error`), y agregá el caso `VALIDATION_ERROR: profile required` → `VALIDATION_ERROR`, `"Primero completá y guardá el perfil de empresa."`, `retryable: false` (va ANTES del `VALIDATION_ERROR` genérico). `profile-service.ts` la importa desde ahí.
- `profile-service.ts`: la lectura de `agent_profiles` también trae la columna `knowledge` (el esquema de versión ya la acepta, con `null` por defecto).
- `section-service.ts`: `createSectionService(getClient)` devuelve `{ saveAgentKnowledge }` con el tipo `SaveAgentKnowledge`. Valida `actionCtxSchema` y `saveAgentKnowledgeInputSchema` (usá el valor parseado), exige `actor_type === "user"` (mismo mensaje que el perfil), llama `rpc("save_agent_section", { p_company_id: ctx.company_id, p_action_id: ctx.action_id, p_base_version: input.base_version, p_section: "knowledge", p_value: <lista parseada> })`, traduce errores con `save-errors.ts` y valida la salida con `saveAgentKnowledgeOutputSchema` (si no cumple → `PROVIDER_ERROR`, `"La base respondió algo inesperado al guardar."`).
- `public.ts`: arma `saveAgentKnowledge` con `createRequestSupabaseClient()` (escritura) y saca el esqueleto.

**Pruebas:** cada rama de `section-service` (ctx inválido, lista inválida, actor no usuario, éxito con params exactos y lista normalizada, cada error traducido incluido `profile required`, excepción, salida inesperada); `save-errors` con cada prefijo; y en `profile-service.test.ts` que la lectura pide `knowledge` y que una fila con `knowledge` se devuelve parseada.

**Verificación:** `npx vitest run src/features/agent/server`, `npm run typecheck`, `npx eslint src/features/agent/server`.

---

### Task 3: Pantalla — `/agent/knowledge` y resumen

**Archivos:**
- Crear: `src/app/agent/knowledge/page.tsx`
- Crear: `src/app/agent/knowledge/actions.ts`
- Crear: `src/features/agent/components/KnowledgeEditor.tsx`
- Crear: `src/features/agent/components/knowledge-form-data.ts` (+ `knowledge-form-data.test.ts`)
- Modificar: `src/app/agent/page.tsx`

**Leé antes:** `docs/DESIGN.md`, los comentarios de cada componente del kit que uses, `src/app/agent/profile/**`, `src/features/agent/components/ProfileForm.tsx`, `AccessAlert.tsx` y `profile-form-data.ts` (seguí EXACTAMENTE el mismo patrón: contexto, `AccessAlert`, `action_id` por render, `key={actionId}`, reglas de `action_id` y URL de éxito con funciones puras), el contrato y el README.

**`/agent/knowledge` (`page.tsx`):** `PageHeader` "Base de conocimiento", descripción "Productos, precios orientativos y preguntas frecuentes que el agente puede usar en la llamada.". Estados, en este orden:
- Sin contexto → `AccessAlert`. Error al leer → `Alert tone="danger"` con su mensaje.
- Sin perfil (no hay versión): `EmptyState` "Primero completá el perfil de empresa" + "El conocimiento se guarda junto con el perfil del agente." con un link-botón "Completar perfil" a `/agent/profile` si `can_edit`; si no, descripción "Pedile a una persona admin que complete el perfil." sin botón.
- `?saved=N&created=1` → `Alert tone="success"` "Guardamos la versión N" + "Se va a usar en las próximas llamadas."; `created=0` → `Alert tone="info"` "No había cambios" + "Seguís en la versión N."
- `can_edit` false → `Alert tone="info"` "Solo una persona admin puede cambiar el conocimiento" + "Lo podés ver, pero no editar." y el editor en solo lectura.
- Renderiza `<KnowledgeEditor key={actionId} …>` con la lista vigente (`current.knowledge ?? []`), `base_version`, `action_id` y `can_edit`.

**`KnowledgeEditor.tsx` (`"use client"`):** la lista vive en estado de React (los campos son controlados, así React 19 no la vacía al enviar).
- Contador siempre visible arriba: "N de 6.000 caracteres" con `knowledgeTextLength` y `KNOWLEDGE_TEXT_MAX` del contrato (formato con punto de miles, `es-AR`). Tono neutro; `warning` desde el 90 %; `danger` si se pasa, con el mensaje "Te pasaste del máximo. Acortá textos o sacá ítems." y el botón de guardar deshabilitado.
- Cada ítem en un contenedor blanco con borde (`bg-canvas border border-line rounded-card`, NO una `Card` gris: "nada gris sobre gris"), con una etiqueta de tipo (`Badge`: "Producto o servicio" / "Pregunta frecuente") y botón "Sacar" (`IconButton` o `Button` ghost con ícono y `label` accesible "Sacar <nombre o pregunta>").
  - Producto: `Input` "Nombre" (requerido, `maxLength` del contrato), `Textarea` "Descripción" (opcional), `Input` "Precio orientativo" (opcional, hint "Ejemplo: Desde $3.200 + IVA. El agente no va a inventar precios que no estén acá.").
  - Pregunta: `Input` "Pregunta" (requerida), `Textarea` "Respuesta" (requerida).
- Botones "Agregar producto" y "Agregar pregunta" (secondary, con ícono) al final de la lista; el ítem nuevo recibe el foco.
- Lista vacía: `EmptyState` "Todavía no cargaste conocimiento" + "Sumá tus productos o las preguntas que más te hacen." con los dos botones de agregar.
- Campo oculto `knowledge` con `JSON.stringify(lista)`, más `base_version` y `action_id` ocultos. Botón `primary` "Guardar conocimiento" con `loading` ("Guardando…") y guard contra doble envío.
- Errores por ítem debajo de cada campo (claves `"<índice>.<campo>"`), y uno general en `Alert tone="danger"` arriba del botón.
- `can_edit` false: todos los campos deshabilitados (`fieldset disabled`), sin botones de agregar, sacar ni guardar.
- Celular: todo en una columna, sin scroll horizontal a 375 px.

**`knowledge-form-data.ts` (lógica pura, probada):**
- `readKnowledgeForm(formData)` → `{ action_id, input: { base_version, knowledge } }`: `knowledge` es el JSON del campo oculto (si no es JSON válido o no es una lista → lista inválida que falla la validación, nunca tira excepción); `base_version` número (vacío → `NaN`/inválido, que falla la validación).
- `knowledgeFieldErrors(error)`: de un `ZodError` de `saveAgentKnowledgeInputSchema` arma `{ "<índice>.<campo>": mensaje }` para errores de ítems, y `{ _list: mensaje }` para errores de la lista entera (máximo de ítems o de caracteres). Un mensaje por clave.
- Reusá las funciones puras de `action_id` y URL de éxito de `profile-form-data.ts` si sirven tal cual (importalas); si necesitás una URL distinta (`/agent/knowledge?...`), agregá una función equivalente acá, sin tocar el comportamiento de las de perfil.

**`actions.ts` (`"use server"`):** `saveKnowledgeAction(prevState, formData)` igual que la de perfil: leer, validar (error → estado con `fieldErrors`, mensaje "Revisá los campos marcados.", la lista que mandó la persona y un `action_id` nuevo), `getCompanyContext()`, `saveAgentKnowledge`, mismas reglas de `action_id` según `retryable`, y `redirect("/agent/knowledge?saved=<v>&created=<1|0>")`.

**`/agent` (`page.tsx`):** el paso "Base de conocimiento" del `ProgressCard` está hecho si la versión vigente tiene al menos un ítem; la fila "Base de conocimiento" deja de decir "Próximamente" y muestra un link-botón "Abrir" a `/agent/knowledge` (igual que la del perfil). No cambies nada más de esa página.

**Pruebas (`knowledge-form-data.test.ts`):** `readKnowledgeForm` con lista válida, JSON roto, `base_version` vacío; `knowledgeFieldErrors` con error en un campo de un ítem y con el error de la lista entera.

**Verificación:** `npx vitest run src/features/agent/components`, `npm run typecheck`, `npx eslint src/app/agent src/features/agent/components`.
