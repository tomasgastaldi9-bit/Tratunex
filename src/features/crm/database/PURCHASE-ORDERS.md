# ORD-03 · Órdenes desde cotizaciones

`purchase-orders.sql` es una propuesta de Nano, sin aplicar al Supabase
compartido. Tomás coordina su migración y la revisión de integración con PAY.
Requiere PLAT-02/03, CRM-03, ORD-01, BUY-01/02 y `supplier_quotes` de QUO-02.
El preflight falla explícitamente si faltan las tablas necesarias; no crea ni
modifica tablas de Agente o Voz.

## Estado de integración y bloqueo conocido

QUO-02 ya está integrado en main por PR #35 (`d83096a`, migración
`20261107180000_add_supplier_quotes.sql`): ofrece `unit_price numeric(14,2)` y
monedas `ARS`, `USD` o `unknown`. Las órdenes ARS usan la convención de
liquidación nominal **1 ARS = 1 ARGt** que ya publica
[`pesosToAtomic`](../../../contracts/purchases.ts), la sección de compras del
[`README de Agente`](../../agent/README.md) y el brief v3. Conservan el precio
y moneda ARS originales, calculan `amount_atomic` exacto a escala 18 y quedan
con `pricing_status: ready`. Esto aplica una regla del producto; no consulta ni
afirma una cotización de mercado.

USD sigue con `pricing_status: pending_conversion` y `amount_atomic: null`:
no hay una conversión acordada para esa moneda y no puede aprobarse para pagar.
Una orden ARS antigua que haya quedado pendiente permanece intacta hasta que un
admin ejecute `refreshPurchaseOrder` y vuelva a revisar su nueva versión.

La propuesta también admite una futura cotización expresada directamente en
ARGt. Para ARS nominal y ARGt calcula `unit_price × quantity × 10^18` con
`numeric` exacto, exige un entero
positivo menor que `2^256` y devuelve el resultado como string. Una fracción de
unidad atómica o un desbordamiento se rechaza antes de guardar. Los precios
originales y totales cotizados también se devuelven como strings decimales.

**Esta entrega no autoriza atómicamente un pago, no firma, no transmite ARGt y
no registra un pago como completado.** `approved` solo registra la aprobación
humana de una orden y sus snapshots. `getPurchaseOrder` es lectura; no sustituye
una reserva/validación de pago. El puerto que PAY usará para reclamar una orden
requiere revisión de Tomás, revalidación de las condiciones y reglas de
idempotencia por orden. No se publica un `claimForPayment` en esta propuesta.

## Datos y operaciones

`purchase_orders` guarda una única orden por empresa y cotización. Conserva
precio original, moneda, cantidad de la compra, proveedor, destino de cobro y
versión de billetera, más snapshots privados de cotización, compra, proveedor y
política. Su FK de cotización y proveedor incluye la empresa. La compra se
consulta por ID y empresa en el dispatcher; no se altera la tabla de Agente
para agregar una restricción compuesta.

`orders_execute(p_ctx, p_operation, p_input)` devuelve `Result<T>`:

- `createPurchaseOrder({ supplier_quote_id })` → `{ order, created }`. El servidor
  carga todos los datos; no acepta monto, proveedor, billetera, política ni
  identidad enviados por el navegador. Una nueva acción sobre la misma
  cotización devuelve la orden existente sin actualizar silenciosamente sus
  snapshots. Cualquier miembro puede crearla.
- `getPurchaseOrder({ order_id })` → `{ order }`. Solo datos visibles para esa
  empresa. `listPurchaseOrders({ limit? })` devuelve `{ items }`, máximo 100,
  predeterminado 50, orden de creación descendente.
- `refreshPurchaseOrder({ order_id, expected_version })` → `{ order }`. Solo
  admin y órdenes `awaiting_approval`. Vuelve a cargar las condiciones actuales,
  conserva ID/cotización, incrementa versión y exige una nueva revisión humana.
  No modifica una orden aprobada, incluso si las condiciones cambiaron.
- `approvePurchaseOrder({ order_id, expected_version })` → `{ order }`. Solo
  admin. Comprueba la versión bajo lock y exige snapshots idénticos a los datos
  actuales; cualquier cambio de compra, cotización, contacto, billetera o reglas
  devuelve `CONFLICT`. Recargar la página no actualiza snapshots: hace falta la
  acción explícita de actualización y volver a revisarlos.

Para aprobar se requiere monto ARGt listo, billetera configurada en Arbitrum,
cotización que no sea de ejemplo, aceptación ARGt confirmada y disponibilidad
compatible con cantidad y mínimo de compra conocidos. No se autoriza un
`can_supply: unknown` ni un stock confirmado insuficiente. La política del
dueño debe existir: se comprueban máximo por compra, presupuesto de la compra
y lista de proveedores permitidos. Una aprobación humana cubre el umbral de
aprobación manual; nunca salta el máximo o la lista. Una política nueva o
cambiada después del snapshot exige actualizar la orden.

Las etiquetas de fuente describen los registros de QUO-02; esta propuesta no
prueba que un registro `web`/`call` provenga de una integración externa real.
La evidencia y la frontera de pago quedan pendientes de la integración revisada.

## Autoridad y transacciones

RLS limita lecturas por membresía. Usuarios y `service_role` no escriben la
tabla directamente. La RPC pública es `SECURITY INVOKER`; el dispatcher y sus
helpers permanecen en `app_private`, con `search_path` vacío y permisos acotados.
`anon` no ejecuta la RPC. Un claim de rol dentro del JSON no otorga privilegios.

Cada operación verifica la identidad y membresía antes incluso de devolver un
recibo cacheado. Crear/aprobar/actualizar exige actor usuario; aprobar y
actualizar revalidan además el rol admin. La membresía y las filas usadas para
la decisión se bloquean hasta terminar la transacción. Orden y recibo PLAT-02
se guardan juntos. Acciones repetidas reproducen su snapshot; otros datos con
el mismo ID generan conflicto. Errores y carreras revierten el recibo nuevo
sin dejar una orden parcial. No hay reintentos automáticos ni llamadas externas.

## Pruebas locales

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/verify-purchase-orders-db.mjs
```

El helper solo conecta a loopback y a `tratunex_contacts_verify`. Si no existe
`supplier_quotes`, el script crea una tabla propia de verificación con un
comentario identificador, tipos compatibles con los campos del draft y una
extensión **ficticia** de moneda/precio ARGt para probar el camino futuro.
No instala la migración de Voz ni crea su tabla `calls`. Si ya existe una tabla
de cotizaciones que no pertenece a ese fixture, se detiene y no la altera.
Esta tabla auxiliar no demuestra que QUO-02 soporte ARGt.

El 2026-11-07, PostgreSQL **17.11** aprobó **64 comprobaciones, exit 0**:
concurrencia/idempotencia de creación y aprobación; ARS nominal 1:1 con centavos
exactos a escala 18 y aprobación humana; USD pendiente sin conversión;
ARS histórico pendiente recuperado únicamente con actualización explícita;
ARGt de 18 decimales, uint256 máximo, rechazo de desbordamiento/subunidad;
snapshots desactualizados y recuperación explícita; política/allowlist/budget;
billetera, fuente y disponibilidad; admin/membresía antes del caché; RLS/ACL;
compatibilidad DTO; rollback conjunto e insert fallido forzado. El trigger de
fallo y todos los registros aleatorios de cada ejecución se limpian al terminar;
se preservan tablas y datos anteriores. La corrección local de la propuesta
validó los cuerpos `prosrc` de sus dos funciones y la definición/nombre de su
constraint anterior antes de reemplazarlos. El hash de todas las filas
preexistentes permaneció idéntico; una orden ARS histórica siguió pendiente.

El fixture HTTP de QA añade únicamente la RPC `orders_execute` a su lista
permitida. Auth/PostgREST son sustitutos locales sobre PostgreSQL real. No
demuestra Supabase remoto, telefonía, conversión de moneda ni pagos onchain.
