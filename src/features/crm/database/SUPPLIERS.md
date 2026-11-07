# TRA-74 · Proveedores y billetera de cobro

`suppliers.sql` es una propuesta incremental sobre CRM-03 (`contacts.sql`) y
PLAT-02/03. Tomás coordina su versión y aplicación al Supabase compartido.
No modifica contactos ni migraciones anteriores. La verificación descrita aquí
se ejecutó únicamente en PostgreSQL local.

`supplier_profiles` identifica el rol proveedor por su existencia, con clave
`(company_id, contact_id)` y FK compuesta al contacto de esa misma empresa.
Conserva la billetera en columnas separadas del contacto. Reimportar o editar
datos comerciales nunca escribe esas columnas. `created` en `upsertSupplier`
indica que se creó el perfil, incluso si el contacto ya existía.

La billetera es una pareja completa de red (`base` o `arbitrum`) y dirección
`0x` de 20 bytes distinta de cero, o es `null`. Se conserva el casing cargado
por la persona. Esta validación es sintáctica: no comprueba checksum ERC-55,
propiedad, titularidad, saldo, token ni capacidad de recibir un pago. PAY debe
realizar sus verificaciones antes de firmar. Esta propuesta no firma ni envía
transacciones, no guarda claves privadas y no presenta un pago como realizado.
Las redes corresponden al destino de cobro del brief v3; no se introducen ARGt
de testnet ni montos ficticios presentados como fondos reales.

## DTO y operaciones SQL

El proveedor devuelve todo `ContactDTO` más `is_supplier: true`,
`collection_wallet: { chain, address } | null`, `wallet_version` y
`wallet_updated_at: UTC | null`.

`suppliers_execute(p_ctx, p_operation, p_input)` devuelve `Result<T>`:

- `upsertSupplier`: input de `upsertContact` → `{ supplier, created }`. Usuarios
  autenticados o servidores verificados pueden importar/marcar un proveedor.
  No acepta wallet, versión, identidad ni metadatos de rol en el input.
- `updateSupplier`: input de `updateContact` por ID → `{ supplier }`. Solo una
  persona; exige que el perfil proveedor ya exista.
- `setSupplierWallet`: `{ contact_id, collection_wallet, expected_wallet_version }`
  → `{ supplier }`. Solo una persona. Bloquea la fila y compara la versión antes
  de guardar. Una versión anterior devuelve `CONFLICT`. Cada cambio real
  incrementa la versión y actualiza su fecha UTC. Guardar la misma red/dirección
  comparada sin distinguir mayúsculas conserva la representación original y no
  consume versión. Quitar una billetera también incrementa la versión. El estado
  inicial pendiente tiene versión 0 y fecha `null`.
- `getSupplier`: `{ contact_id }` → `{ supplier }`. Un contacto sin perfil o de
  otra empresa devuelve `NOT_FOUND`.
- `listSuppliers`: filtros de contactos más `wallet_status: pending | configured`
  → `{ items, next_cursor }`. Solo incluye perfiles existentes, orden UUID
  ascendente, límite predeterminado 50 y máximo 100. Búsqueda literal sin
  distinguir mayúsculas en nombre, organización o teléfono, filtros por fuente
  y no-contactar aplicados antes de paginar.

## Autoridad y atomicidad

La tabla tiene RLS de lectura por membresía. Los clientes, incluido
`service_role`, no escriben directamente. La RPC pública es `SECURITY INVOKER`;
el dispatcher privilegiado permanece en `app_private`, con `search_path` vacío.
Comprueba identidad y membresía antes de devolver incluso un recibo cacheado.
Voz/sistema requieren el rol SQL `service_role`; un campo o claim JSON no otorga
esa autoridad. Los cambios de billetera y la edición de proveedor rechazan
Voz/sistema antes de consultar recibos. `anon` y los helpers no tienen acceso
directo de ejecución.

La importación usa dos recibos PLAT-02 dentro de la misma transacción:

1. Acción externa original, operación `crm.upsertSupplier`/`crm.updateSupplier`.
2. Acción interna estable `suppliers:contact:<action_id>`, delegada al dispatcher
   CRM-03 para validar y guardar el contacto.

Contacto, perfil y ambos recibos se revierten juntos si falla cualquier paso.
Repetir una acción devuelve exactamente su snapshot anterior; reutilizarla con
otros datos u operación produce `CONFLICT`. El recibo interno usa un prefijo
reservado para esta integración: una colisión con otra acción se informa como
conflicto. No se cambia el contrato de los importadores de contactos y un
`do_not_contact` existente sigue protegido por CRM-03.

## Verificación reproducible

Requiere la base aislada `tratunex_contacts_verify` con CRM-03 instalado.
Preserva los datos y tablas previos. El helper solo conecta a loopback y a ese
nombre de base.

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
$env:PGCLIENTENCODING = 'UTF8'
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f src/features/crm/database/suppliers.sql
node src/features/crm/verification/verify-suppliers-db.mjs
```

El 2026-11-07, PostgreSQL **17.11** aprobó **70 comprobaciones, exit 0**.
Cubren ocho imports concurrentes con una acción, deduplicación, promoción de un
contacto existente, wallet y reimportaciones simultáneas, conflicto entre dos
versiones, no-op por casing, limpieza de billetera, rechazos de metadatos y
red/dirección inválidas, constraints de tabla, RLS/ACL, actores falsos,
aislamiento por empresa, filtros/paginación y compatibilidad `SupplierDTO`.

También se verificó rollback de contacto, perfil y ambos recibos, incluyendo un
fallo forzado al insertar el perfil después de guardar el contacto. El trigger
de prueba solo afecta la empresa UUID aleatoria de esa ejecución y se elimina
al terminar. El script limpia únicamente sus propios registros. La membresía
revocada impide recuperar resultados cacheados de importación y billetera.

El fixture de Auth sustituye GoTrue/JWT. Estos resultados no demuestran
Supabase remoto, PostgREST real, una billetera verificada ni pagos onchain.
