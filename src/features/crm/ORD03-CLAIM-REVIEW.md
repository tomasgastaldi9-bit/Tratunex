# ORD-03 / PAY-02 · Revisión de la frontera de pago

Revisión de Nano sobre PAY-02 `13b13b1` / PR #30 y ORD-03 integrado por PR #36
(`d7b04ff`). Es una propuesta concreta para revisión del consumidor; no implementa
un claim ni habilita pagos. El puerto permanece `unavailable`.

## Autoridad requerida desde Órdenes

- `getPurchaseOrder` es lectura. Tampoco basta el resultado cacheado de
  `approvePurchaseOrder`: puede preceder a un cambio de billetera o política.
- La identidad se obtiene de la sesión en el servidor. El claim privado usa
  credenciales de servicio y vuelve a comprobar membresía y rol admin antes
  de cualquier resultado cacheado. No se aceptan identidad, monto, destino,
  aprobación, nonce ni red del navegador.
- El primer claim exige orden aprobada, versión y aprobación persistidas,
  precio listo, red Arbitrum, billetera no cero y snapshots actuales iguales a
  los aprobados. ARS usa la convención nominal publicada por BUY-01/02; USD sin
  conversión sigue bloqueado. Rechaza ejemplos y revalida stock, mínimos,
  aceptación de ARGt, presupuesto, máximo y allowlist.
- Una aprobación humana cubre `needs_approval`, nunca `rejected`. El preflight
  actual llama a `checkBeforePayment`, que rechaza `needs_approval` aunque la
  orden ya esté aprobada. Hay que resolver ese caso con evidencia persistida
  del claim, sin añadir un booleano de aprobación controlable por el cliente.
- `source: "call"` no demuestra telefonía real. El claim debe acordar la
  procedencia admitida: un mock no pasa a ser una oferta externa por ese enum;
  voz web y teléfono se identifican por el registro canónico de llamada.

## Firma propuesta

API del navegador, sin cambios:

```ts
payInvoice(actionCtx, { order_id }): Promise<Result<{ payment: PaymentDTO }>>
```

RPC privada propuesta, solo consumida por el adaptador de Pagos:

```ts
claimOrderPayment(verifiedUserCtx, {
  order_id,
  expected_order_version,
  chain_id, sender, token, // configuración validada del servidor
  observed_pending_nonce, // observación de red; no es el nonce final autorizado
}): Result<{
  reservation: {
    id, state, company_id, order_id, order_version,
    supplier_contact_id, wallet_version,
    chain_id, sender, token, destination, amount_atomic, nonce,
    approved_by, approved_at,
  }
}>
```

El nombre y el SQL final los publica Tomás. El monto y destino se cargan de
Órdenes/Proveedores dentro de la transacción; el nonce se asigna bajo el lock de
la billetera emisora. La reserva guarda además los snapshots de autorización
en almacenamiento privado. No devuelve firmas, claves ni sobre cifrado al
navegador. `expected_order_version` proviene de la orden que el adaptador acaba
de leer, no sustituye la validación transaccional.

## Orden de bloqueos

Orden real de ORD-03 actual (`database/purchase-orders.sql`):

| Operación | Orden de adquisición |
|---|---|
| Aprobar/refrescar | Membresía `SHARE` → recibo de acción → orden `UPDATE` → cotización `SHARE` → compra `SHARE` → perfil de proveedor `SHARE` → contacto `SHARE` → política `SHARE` |
| Crear | Membresía → recibo → advisory por empresa/cotización → orden existente `UPDATE`, o contexto en el mismo orden anterior antes del insert |
| Cambiar billetera ORD-01 | Recibo → perfil `UPDATE`; la lectura final del contacto no toma un lock de fila |

La secuencia del contexto es **perfil antes de contacto**. No invertirla en el
claim. PostgreSQL conserva los locks de fila hasta terminar la transacción;
tomar objetos en un orden consistente evita la inversión típica de deadlock.
Referencia: [PostgreSQL 17 · Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html).

Propuesta para el claim: lock global por `(chain_id, lower(sender))` → membresía
→ exclusión de acción/orden → orden `UPDATE` → contexto en el orden de la tabla
→ reserva/contador de nonce. Todos los caminos de Pagos que necesiten varios
de esos objetos deben respetar la misma secuencia. No llamar al dispatcher de
aprobación después de bloquear la reserva: puede invertir recibo/orden.
No mantener una transacción abierta mientras se consulta una RPC de blockchain.

## Idempotencia y momento de autorización

La reserva actual `reserve_payment_attempt` no verifica la orden y exige que
reintentos repitan acción y nonce. No se conecta como claim sin cambios.

1. Una orden tiene una única intención durable; otra acción sobre la misma
   orden recupera esa intención, sin asignar otro nonce ni crear otra firma.
   Reutilizar una acción para otra orden/configuración produce `CONFLICT`.
   El orquestador actual pasa el mismo `action_id` a aprobación y Pagos. Si el
   claim usa `app_private.claim_action`, necesita un namespace interno separado:
   el recibo común ya pertenece a `crm.approvePurchaseOrder`. Usar recibos
   privados de Pagos o una clave interna derivada y estable, manteniendo la
   clave original para auditoría; no reutilizar literalmente el recibo común
   para otra operación. El API público no debe depender de nuevos IDs por clic.
2. Una observación de nonce más nueva no cambia un replay: se devuelve el nonce
   ya reservado. La unicidad por billetera/red/nonce cruza empresas; un mutex
   en memoria por proceso no basta. El emisor debe usarse mediante ese mismo
   asignador; cambios externos se reconcilian explícitamente.
3. Propuesta a confirmar: el commit del claim es el momento de autorización de
   una intención inmutable. Cambios posteriores no retargetean esa reserva.
   Si se quiere revocación antes de firmar, requiere un protocolo transaccional
   de cancelación/fencing; una segunda lectura seguida de firma vuelve a abrir
   la carrera. No se habilita el puerto sin acordar esta semántica.
4. Una orden aprobada cuyos snapshots cambiaron antes del primer claim falla
   cerrada. Recuperarla necesita revocar aprobación y refrescar de forma
   atómica, solo si no existe intento en curso/preparado. El refresh actual
   prohíbe modificar órdenes aprobadas; no lo salteamos con SQL directo.
5. Respuesta perdida, `unknown`, hash sin recibo o transacción preparada nunca
   autorizan otra transferencia. Consultar la misma reserva; `confirmed`
   requiere recibo y transferencia verificados por Pagos.

## Activación y migraciones

Para conectar `purchase-orders-public.ts`, Pagos debe aportar el claim, firma y
persistencia del intento preparado, recuperación, reconciliación y una lectura
duradera `getOrderPayment(ctx, { order_id })`. La UI debe conservar el estado
tras recargar. Un stub presente no cambia `availability` a `ready`.

Tomás coordina las migraciones compartidas: primero versionar ORD-01
(`supplier_profiles` y RPC), después ORD-03 (`purchase_orders` y RPC), después el
claim, con PLAT-02/03, CRM-03, BUY-01/02 y QUO-02 previamente instalados.
La reserva PAY actual depende de empresas; el futuro claim sí depende de las
órdenes. No reescribir migraciones aplicadas, usar `IF NOT EXISTS` para ocultar
drift ni hacer reset. Antes de aplicar, comparar objetos y registro de
migraciones del entorno destino. No se aplicó nada remoto en esta revisión.

Pruebas requeridas antes de `ready`: doble claim de una orden; dos empresas
usando el mismo emisor; misma acción con otra orden; política/billetera/aprobación
cambiando en concurrencia; pérdida de respuesta al reservar/preparar; recibo
pendiente/revertido/confirmado; permisos antes del replay y ausencia de una
segunda firma/transferencia. Deben usar PostgreSQL real y transporte simulado,
sin fondos de la billetera de demo.
