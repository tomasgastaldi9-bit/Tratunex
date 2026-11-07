# Compras v3 · Contratos del módulo CRM

ORD-01 / TRA-74 implementa proveedores del brief v3 de la PR #24.
El pipeline v2 se conserva en la PR #25; no forma parte de esta entrega.

## Proveedores

Las firmas de contactos de CRM-03 permanecen intactas. Cada proveedor conserva
su UUID de contacto. `supplier_profiles` agrega el rol y destino de cobro sin
reescribir el esquema de contactos ni sus migraciones.

```ts
type SupplierDTO = ContactDTO & {
  is_supplier: true;
  collection_wallet: null | { chain: 'base' | 'arbitrum'; address: string };
  wallet_version: number;
  wallet_updated_at: string | null; // UTC
};
```

Los schemas están en `src/contracts/crm.ts`; las funciones de servidor se
importan de `src/features/crm/server/public.ts`:

- `upsertSupplier(actionCtx, UpsertContactInput)` → `Result<{supplier, created}>`.
  `created` indica perfil de proveedor nuevo, aunque el contacto ya existiera.
  Importadores verificados pueden cargar datos comerciales; el input no admite
  una billetera. Deduplica usando el contrato existente de contactos.
- `updateSupplier(actionCtx, UpdateContactInput)` → `Result<{supplier}>`.
  Edición humana por ID; no cambia el destino de cobro.
- `getSupplier(ctx, {contact_id})` → `Result<{supplier}>`.
- `listSuppliers(ctx, filters)` → `Result<{items, next_cursor}>`.
- `setSupplierWallet(actionCtx, {contact_id, collection_wallet,
  expected_wallet_version})` → `Result<{supplier}>`. Solo una persona autenticada
  puede modificarla; una versión desactualizada da `CONFLICT`.

Crear o editar contacto/perfil/recibos ocurre en una transacción. La billetera
tiene su propia acción humana, con recibo idempotente y versión. Reimportar un
proveedor conserva el destino y su versión. Vaciarlo requiere una acción humana
explícita con `collection_wallet: null` y la versión actual.

Red y dirección forman un único valor. Se valida sintaxis EVM de 20 bytes y se
rechaza la dirección cero. Se conserva el casing introducido; no se afirma
verificación de checksum ERC-55, propiedad, saldo ni habilitación para pagar.
Pagos debe validar el destino y la red configurada antes de firmar. El CRM no
contiene claves privadas, dirección del token ni configuración RPC.

## Límites con los demás módulos

Tomás consume el proveedor mediante `getSupplier` y coordina la migración. Una
orden aprobada debe ligar el destino a su `wallet_version`; un cambio posterior
no debe modificar silenciosamente el destino aprobado.

El asistente cotizador obtiene condiciones comerciales y no solicita la
billetera por teléfono. Ningún dato de una llamada autoriza a cambiar
`collection_wallet`: la dirección se carga por escrito mediante la acción humana.

`payInvoice`, `checkPurchasePolicy` y `rankQuotes` siguen los nombres del brief.
Los DTO de cotizaciones/órdenes se definirán con sus implementaciones antes de
conectar ORD-02/03. No se presenta como pago real un fixture ni un hash inventado.
