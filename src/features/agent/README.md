# Módulo Agente (dueña: Vale)

El dashboard donde cada empresa "entrena" a su agente de voz: qué vende, a quién, cómo habla, qué sabe y cómo decide si alguien es cliente potencial. Fuente de verdad: [`docs/BRIEF.md`](../../../docs/BRIEF.md) (§5, §7, §10) y el contrato [`src/contracts/agent.ts`](../../contracts/agent.ts).

**Leé este archivo antes de tocar el módulo.** Si una decisión de acá cambia, se cambia acá primero.

## Decisiones de estructura

1. **Una versión = toda la configuración.** Guardar cualquier sección (perfil, instrucciones, criterios, conocimiento) crea la versión siguiente de la empresa: 1, 2, 3… Cada llamada guarda ese único número (`agent_version` en `CallResultV1`) y las métricas de AGT-08 agrupan por él.
2. **Las versiones nunca se pisan.** Cada guardado agrega una fila en `agent_profiles`; la versión vigente es la de número más alto. Al guardar una sección, la fila nueva copia las demás secciones de la versión anterior.
3. **Sin cambios, sin versión nueva.** Si el perfil que llega es igual al vigente, se responde `{ version: <la vigente>, created: false }`.
4. **Nadie pisa el trabajo de otro.** El formulario manda `base_version` (la versión que estaba viendo). Si mientras tanto alguien guardó otra, el servidor responde `CONFLICT` en vez de pisarla.
5. **Solo los admin guardan.** Admin y vendedor pueden ver; solo `role = 'admin'` en `company_members` puede guardar. La base es la que decide (no alcanza con ocultar el botón).
6. **Una página por sección.** `/agent` es el resumen; cada sección tiene su página y su carpeta, así cada ticket toca archivos distintos.
7. **Tono y horario viven en el Perfil.** AGT-03 (instrucciones) no repite el tono.

## Mapa de archivos por ticket

| Ticket | Página | Archivos |
|---|---|---|
| AGT-01 Perfil | `/agent`, `/agent/profile` | `src/app/agent/layout.tsx`, `src/app/agent/page.tsx`, `src/app/agent/profile/**`, `src/features/agent/components/ProfileForm.tsx`, `src/features/agent/components/DayPicker.tsx`, `src/features/agent/server/**`, migración y test de `agent_profiles` |
| AGT-02 Conocimiento | `/agent/knowledge` | `src/app/agent/knowledge/**`, tabla `knowledge_items` |
| AGT-03 Instrucciones | `/agent/instructions` | `src/app/agent/instructions/**`, columna `instructions` (ya existe) |
| AGT-04 Criterios | `/agent/criteria` | `src/app/agent/criteria/**`, columna `criteria` (ya existe) |
| AGT-05 getAgentConfig | — | `src/features/agent/server/agent-config.ts` |
| AGT-06 Prueba web | `/agent/test` | `src/app/agent/test/**` |
| AGT-07 Plantillas | dentro de `/agent` | tabla `industry_templates` |

## Base de datos

### Tabla `public.agent_profiles` (solo se agregan filas)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `company_id` | `uuid` not null | FK `companies(id)` on delete cascade |
| `version` | `integer` not null | `>= 1`, único junto con `company_id` |
| `profile` | `jsonb` not null | objeto con la forma de `companyProfileSchema` |
| `instructions` | `jsonb` null | lo llena AGT-03 |
| `criteria` | `jsonb` null | lo llena AGT-04 |
| `created_by` | `uuid` null | FK `auth.users(id)` on delete set null |
| `created_at` | `timestamptz` not null | `now()`, siempre UTC |

Permisos: RLS activado. `authenticated` puede **leer** las filas de las empresas donde es miembro. Nadie puede insertar, editar ni borrar directo: solo a través de la función de guardado. `anon` no tiene acceso.

### Funciones SQL (las llama el servidor con el cliente de la sesión)

```sql
-- true si el usuario de la sesión es admin de esa empresa.
public.can_edit_agent_profile(p_company_id uuid) returns boolean

-- Guarda el perfil como versión nueva. Devuelve {"version": n, "created": bool}.
public.save_agent_profile(
  p_company_id uuid,
  p_action_id text,
  p_base_version integer,   -- null si es la primera versión
  p_profile jsonb
) returns jsonb
```

`save_agent_profile` usa la idempotencia de PLAT-02 (`app_private.claim_action` / `complete_action`) con la operación `'agent.save_company_profile'` y el payload `{"base_version": …, "profile": …}`. Mismo `action_id` y mismos datos → mismo resultado; mismo `action_id` con otros datos → `CONFLICT`.

Errores: la función lanza excepciones cuyo mensaje empieza con el código, igual que las de PLAT-02:

| Mensaje empieza con | Cuándo | El servidor responde |
|---|---|---|
| `FORBIDDEN:` (SQLSTATE `42501`) | no es admin o no es miembro | `FORBIDDEN` |
| `CONFLICT: stale base version` | `p_base_version` no es la vigente | `CONFLICT` ("Alguien guardó cambios mientras editabas…") |
| `CONFLICT:` (otro) | `action_id` reusado con otros datos | `CONFLICT` |
| `VALIDATION_ERROR:` | datos con forma inválida | `VALIDATION_ERROR` |

## Servidor (`src/features/agent/server/`)

- `public.ts` (`import "server-only"`) es lo único que importan otros módulos y las páginas. Exporta `getAgentProfile` y `saveCompanyProfile` con las firmas de `src/contracts/agent.ts`.
- La lógica vive en archivos sin `server-only`, que reciben el cliente de Supabase desde afuera, para poder probarlos con Vitest y un cliente falso.
- Vitest no resuelve el alias `@/`. En archivos que importa un test, los imports con valor van con ruta relativa (`../../../contracts/agent`); `import type` con `@/` sí funciona.
- Toda respuesta es `Result<T>` (`src/contracts/common.ts`). Un error de la base nunca se convierte en éxito.

## `action_id` (sin duplicados)

- La página genera un `action_id` nuevo (`crypto.randomUUID()`) cada vez que se muestra y lo pone en un campo oculto del formulario.
- Si guardar sale bien, se redirige a la misma página: se genera otro `action_id` para el próximo guardado.
- Si falla con `retryable: true` (la base no respondió), se **conserva** el mismo `action_id` para reintentar: si en realidad se había guardado, la base devuelve el mismo resultado.
- Si falla con `retryable: false` (datos inválidos, permisos, conflicto), se usa un `action_id` **nuevo** para el próximo intento.

## Pantallas

Siguen [`docs/DESIGN.md`](../../../docs/DESIGN.md) y usan solo el kit `src/components/ui/**` (sin colores sueltos). Siempre tres estados: vacío, cargando (`<Button loading>`) y error (`<Alert tone="danger">` que diga qué pasó y qué hacer). Textos con verbo y en criollo. Probar en compu y en celular (375 px).

## Modo

El perfil se guarda en la base real (Supabase). Sin variables de Supabase, la pantalla muestra un error explícito: nunca datos inventados.
