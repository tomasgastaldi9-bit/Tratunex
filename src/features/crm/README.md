# CRM · Contratos y contactos

CRM-02 / TRA-54 publica los DTOs y schemas Zod en `src/contracts/crm.ts` y las
siete firmas del brief en `server/public.ts`, marcado `server-only`.
CRM-03 / TRA-55 implementa contactos persistidos sin cambiar esas firmas.

```ts
import type { ActionCtx, Ctx } from "@/contracts/common";
import type { CallResultV1, UpsertContactInput } from "@/contracts/crm";
import {
  crmIntegration, upsertContact, getContact, recordCallResult,
  scheduleFollowup, claimDueFollowups, completeFollowup, failFollowup,
} from "@/features/crm/server/public";
```

`Ctx`, `ActionCtx` y `Result<T>` pertenecen al contrato común de Plataforma.
El servidor construye el contexto desde sesión, webhook o cron verificado.
Cada intención de mutación conserva su `action_id` en los reintentos.

## Modo por operación

`crmIntegration.operations` declara explícitamente:

- `getContact`, `upsertContact`, `updateContact` y `listContacts`: persistencia
  Supabase mediante `contacts_execute`. Una RPC ausente devuelve
  `PROVIDER_UNAVAILABLE`; no se reemplaza por fixtures.
- `createDeal`, `setDealStage`, `listDeals` y `listActivities`: persistencia
  mediante `pipeline_execute`, agregada en CRM-04.
- `recordCallResult` y las cuatro funciones de seguimientos: **mock en memoria**
  hasta sus tickets de implementación. Admiten solo las dos empresas ficticias
  publicadas y no representan resultados reales de Voz.

Para desarrollo sin base, los consumidores pueden optar expresamente por
`server/mock-public.ts`. Allí las siete funciones siguen simuladas. No se
selecciona automáticamente cuando una sesión o la base falla. Su estado se
pierde al reiniciar y no comprueba membresías reales. Los fixtures usan números
reservados y dominios `.example`.

## Contactos persistidos

`/contacts` ofrece búsqueda por nombre, organización o teléfono, filtros de
origen y no-contactar, y páginas de 50 registros. Los filtros se ejecutan en SQL
sobre toda la empresa antes del límite. `/contacts/[id]` muestra y edita el
contacto, incluido el teléfono. La UI consume el kit de Vale sin modificarlo.

`upsertContact` deduplica por teléfono E.164 o dominio dentro de la empresa. Si
ambos señalan contactos diferentes, devuelve `CONFLICT`. Un
`do_not_contact: true` no se revierte al editar o reimportar. La operación
aditiva `updateContact(ctx, {contact_id, ...input})` edita un ID concreto y
rechaza colisiones, conservando la firma del importador de Tomás.

El usuario se revalida contra sesión y membresía. Las consultas conservan su
JWT y RLS; un error de acceso nunca deriva a credenciales de servicio. SQL
revalida autoridad antes de devolver recibos. Contacto y recibo idempotente se
guardan en una misma transacción.

La propuesta está en `database/contacts.sql`. **Tomás debe versionarla y
aplicarla al Supabase compartido**. CRM-03 no aplica migraciones remotas,
no crea deals/tareas ni procesa llamadas reales.

## Pipeline · CRM-04

`/pipeline` muestra las siete etapas del brief con el kit de Vale. Desde el
tablero se busca un contacto de toda la empresa y se crea una oportunidad. La
ficha de contacto enlaza sus oportunidades. Crear contacto o reimportarlo no
crea oportunidades adicionales automáticamente: cada nueva oportunidad es una
intención explícita y puede haber varias para el mismo contacto.

Cada tarjeta ofrece un selector y guardado manual de etapa. El navegador envía
`expected_stage`; si otra persona cambió la etapa, el servidor devuelve
`CONFLICT` en lugar de sobrescribirla. Repetir una acción devuelve su resultado
original y no duplica oportunidades ni actividades. Guardar la misma etapa no
agrega actividad. Los cierres manuales pertenecen a una persona; las reglas
automáticas sobre etapas terminales corresponden a CRM-05.

El tablero pagina de a 50 y sus contadores describen la página visible. Los
filtros de etapa/contacto se aplican en la base antes de paginar; las métricas
globales se entregan en CRM-08. La búsqueda del selector consulta el servidor
y permite recorrer páginas de contactos.

`database/pipeline.sql` es una propuesta incremental: requiere contactos y
recibos existentes, crea `deals` y `activity_log`, y no modifica migraciones
aplicadas. Tomás coordina su versión y aplicación compartida. Las actividades
se leen en orden cronológico descendente con cursor estable.

## API del navegador

- `GET /api/crm/contacts`: filtros `limit`, `cursor`, `query`, `source`,
  `do_not_contact`; devuelve `Result<{items, next_cursor}>`.
- `POST /api/crm/contacts`: upsert.
- `GET /api/crm/contacts/[id]`: contacto de la empresa activa.
- `PATCH /api/crm/contacts/[id]`: edición del ID de la ruta.
- `GET/POST /api/crm/deals`: lista filtrada / creación explícita.
- `POST /api/crm/deals/[id]/stage`: `input: {stage, expected_stage?}`.
- `GET /api/crm/activities`: lista privada, filtro opcional `contact_id`.

Las mutaciones reciben `{action_id, input}`. En contactos, `input` usa
`UpsertContactInput`. Ninguna ruta acepta identidad ni empresa. El header
`Idempotency-Key`, si está, debe coincidir
con `action_id`. Se exigen JSON y `Origin` del mismo sitio. Respuestas privadas
y no cacheables. La UI bloquea el doble envío y conserva la acción ambigua.

## Verificación

```powershell
npm test
npm run typecheck
npm run lint
npm run build
node --test src/features/crm/preparation/verify.mjs
```

La prueba pública conserva las siete firmas y comprueba la separación del mock
explícito. La evidencia de concurrencia, RLS y transacciones está en
`database/README.md`. El navegador usa sustitutos locales de Auth/PostgREST y
Postgres real; no demuestra el Supabase alojado ni telefonía real.
