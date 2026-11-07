# CRM-03 · Propuesta de persistencia de contactos

`contacts.sql` es una **propuesta sin aplicar al Supabase compartido**. Tomás
coordina su revisión, versión y migración. Requiere las migraciones existentes
PLAT-02 (recibos idempotentes) y PLAT-03 (empresas y membresías). No modifica esas
migraciones ni crea deals, tareas, resultados de llamadas o tablas de Voz.

La tabla `public.contacts` tiene RLS de lectura por membresía y claves únicas
por empresa + teléfono E.164 y empresa + dominio web normalizado. Los clientes
no pueden escribir directamente, incluido `service_role`; las mutaciones pasan
por la RPC transaccional `contacts_execute(p_ctx, p_operation, p_input)`.

El dispatcher privilegiado reside en `app_private`, con `search_path` vacío.
Comprueba `auth.uid()`, actor y membresía vigente **antes** de devolver un recibo
cacheado. Voz/sistema requieren el rol SQL `service_role`; un campo del JSON o
un claim de rol no lo reemplazan. El wrapper público es `SECURITY INVOKER` y
`anon` no tiene permiso para ejecutarlo. Los helpers y recibos siguen privados.

## Operaciones

- `getContact`: `{ contact_id }` → `{ contact }`, filtrado por empresa.
- `upsertContact`: input CRM-02 → `{ contact, created }`. Deduplica por teléfono
  E.164 o dominio (sin protocolo, `www.`, puerto, ruta ni mayúsculas). Si ambos
  identifican contactos distintos, devuelve `CONFLICT`, sin fusionarlos.
- `updateContact`: `{ contact_id, ...input CRM-02 }` → `{ contact }`. Edita el ID
  indicado y admite cambiar el teléfono. Colisiones con otro contacto producen
  `CONFLICT`. Un import o edición nunca revierte `do_not_contact: true`.
- `listContacts`: `{ limit?, cursor?, query?, source?, do_not_contact? }` →
  `{ items, next_cursor }`. Límite predeterminado 50, máximo 100, orden UUID
  ascendente, cursor exclusivo. `query` busca texto literal, sin distinguir
  mayúsculas, en nombre, organización y teléfono. `source` acepta `csv`,
  `firecrawl` o `manual`; `do_not_contact` acepta las cadenas `true` o `false`.
  Los filtros se aplican a toda la empresa antes de paginar.

Todas las respuestas usan `Result<T>`. Cada mutación reclama y completa el
recibo PLAT-02 en la misma transacción que el contacto. Mismo `action_id` y
datos devuelven el mismo snapshot; otros datos/actor/operación dan `CONFLICT`.
Los errores revierten tanto el cambio como el recibo nuevo. Un lock por empresa
serializa imports/ediciones concurrentes y los índices únicos refuerzan la
deduplicación. No hay llamadas externas ni reintentos automáticos.

## Verificación local reproducible

Se usó PostgreSQL **17.11** en loopback, puerto **55439**, y una base nueva
`tratunex_contacts_verify`. La base de verificación anterior se conservó.
`contacts-test-fixture.sql` solo admite ese nombre y sustituye las funciones de
Auth: no demuestra GoTrue, PostgREST, firmas JWT ni un despliegue Supabase.

Con PostgreSQL iniciado y la base vacía creada:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
$env:PGCLIENTENCODING = 'UTF8'
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f src/features/crm/database/contacts-test-fixture.sql
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f supabase/migrations/20261107142954_add_idempotent_action_receipts.sql
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f supabase/migrations/20261107144610_add_company_membership.sql
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f src/features/crm/database/contacts.sql
node src/features/crm/verification/verify-contacts-db.mjs
```

El 2026-11-07, la última orden terminó con **exit 0 y 63 comprobaciones
aprobadas**. Incluye ocho conexiones con la misma acción, cinco imports con
acciones diferentes, edición y lectura desde conexiones nuevas, deduplicación
por dominio/teléfono, no-contactar persistente, filtros/paginación, RLS, actor
falso, claim de rol falso, membresía revocada antes del caché, ACL de helpers y
tabla, rollback conjunto y aislamiento entre dos empresas. El script limpia
únicamente los UUID aleatorios creados por su propia ejecución.

La validación SQL también rechaza puertos no numéricos o mayores que 65535,
host vacío, controles, barras invertidas y espacios alrededor de las URLs, tanto
en `website` como en `source.url`. La suite comprueba que esos errores no dejan
contacto ni recibo y que los DTO de lectura/lista siguen validando con Zod.
La RPC admite hosts ASCII sin IDNA, IPv4 decimal canónica de cuatro octetos e
IPv6 entre corchetes. Rechaza hosts DNS con etiqueta final numérica/hexadecimal,
IPv4 inválida o abreviada y A-labels `xn--` sin un normalizador IDNA. Es un
subconjunto explícito para conservar DTOs compatibles con el parser URL del
navegador; no intenta implementar todas las variantes WHATWG.
