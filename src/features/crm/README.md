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
- `upsertSupplier`, `updateSupplier`, `getSupplier`, `listSuppliers` y
  `setSupplierWallet`: persistencia mediante `suppliers_execute` en ORD-01.
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
aplicarla al Supabase compartido**. Esta entrega no aplica migraciones remotas,
no crea deals/tareas ni procesa llamadas reales.

## Proveedores · ORD-01 / TRA-74

El brief v3 reutiliza contactos para proveedores. `/suppliers` y
`/suppliers/[id]` ofrecen lista, búsqueda y filtros en servidor, ficha y edición
de datos comerciales. Cada proveedor mantiene el UUID del contacto; la tabla
`supplier_profiles` agrega el rol y destino de cobro sin modificar los contratos
de CRM-03 ni las migraciones aplicadas.

La billetera se carga en una acción humana separada, con red y dirección juntas.
La API de importación no admite billeteras y conserva la existente al reimportar.
`expected_wallet_version` rechaza ediciones desactualizadas; una respuesta
ambigua conserva la misma acción para recuperar su resultado. Los actores
`voice/system` no pueden editar ni vaciar el destino, tampoco por RPC directa.

Se valida la sintaxis de dirección EVM y se rechaza la dirección cero. No se
afirma checksum verificado, propiedad, saldo ni autorización para pagar. Este
módulo no firma transacciones. Ver las firmas y límites de integración en
[`CONTRACTS-V3.md`](CONTRACTS-V3.md) y la propuesta incremental
[`database/suppliers.sql`](database/suppliers.sql), que Tomás coordina para la
base compartida.

API: `GET/POST /api/crm/suppliers`, `GET/PATCH /api/crm/suppliers/[id]` y
`POST /api/crm/suppliers/[id]/wallet`. Las dos primeras mutaciones usan el
payload de contacto existente. Wallet recibe `{collection_wallet,
expected_wallet_version}`; todas conservan el envelope `{action_id,input}`.

## API del navegador

- `GET /api/crm/contacts`: filtros `limit`, `cursor`, `query`, `source`,
  `do_not_contact`; devuelve `Result<{items, next_cursor}>`.
- `POST /api/crm/contacts`: upsert.
- `GET /api/crm/contacts/[id]`: contacto de la empresa activa.
- `PATCH /api/crm/contacts/[id]`: edición del ID de la ruta.

POST/PATCH reciben `{action_id, input}`. `input` usa `UpsertContactInput` y no
acepta identidad ni empresa. El header `Idempotency-Key`, si está, debe coincidir
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
