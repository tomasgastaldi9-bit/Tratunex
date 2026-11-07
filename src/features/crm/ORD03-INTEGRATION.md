# ORD-03 · Contrato mínimo para PAY-02

Schema: `src/contracts/purchase-orders.ts`. Entrada de servidor:
`src/features/crm/server/public.ts` (`server-only`). Usa `Ctx`, `ActionCtx` y
`Result<T>` de `src/contracts/common.ts`.

```ts
getPurchaseOrder(ctx, { order_id }): Promise<Result<{ order: PurchaseOrder }>>
createPurchaseOrder(actionCtx, { supplier_quote_id }): Promise<Result<{ order: PurchaseOrder; created: boolean }>>
approvePurchaseOrder(actionCtx, { order_id, expected_version }): Promise<Result<{ order: PurchaseOrder }>>
refreshPurchaseOrder(actionCtx, { order_id, expected_version }): Promise<Result<{ order: PurchaseOrder }>>
listPurchaseOrders(ctx, { limit? }): Promise<Result<{ items: PurchaseOrder[] }>>
```

La disponibilidad de cada operación la determina su export en `server/public.ts`.
Tomás consume la lectura; no recibe destino ni monto desde el navegador.

| Campos de `PurchaseOrder` | Forma y uso |
|---|---|
| `id`, `company_id`, `purchase_request_id`, `supplier_quote_id`, `supplier_contact_id` | UUID; vínculos resueltos dentro de la empresa |
| `product`, `quantity`, `unit`, `supplier_name`, `quote_source` | Snapshot comercial; cantidad entera 1..1.000.000; origen `call | web | example` |
| `quoted_unit_price`, `quoted_total`, `quoted_currency` | Textos decimales exactos de la oferta; moneda `ARS | USD | ARGt` |
| `amount_atomic` | String entero positivo ARGt, 18 decimales, hasta 78 cifras y menor que `2**256`; o `null` |
| `pricing_status` | `ready | pending_conversion`; `ready` exige monto no nulo |
| `status`, `version` | `awaiting_approval | approved`; versión entera positiva |
| `wallet`, `wallet_version` | Snapshot `{ chain: 'base' | 'arbitrum', address } | null` y versión entera no negativa del destino ORD-01 |
| `approved_by`, `approved_at` | UUID de la persona y fecha ISO UTC; ambos null mientras espera aprobación |
| `created_at`, `updated_at` | ISO UTC |

ARS usa la equivalencia nominal ya publicada por BUY-01/02 en
`src/contracts/purchases.ts` (`pesosToAtomic`): **1 ARS = 1 ARGt nominal** para
este MVP, sin afirmar una cotización de mercado. SQL conserva el precio ARS y
calcula el total en unidades ARGt de 18 decimales con aritmética decimal exacta,
incluidos centavos, sin pasar por `number`. La ficha muestra la equivalencia y
el importe explícito para revisión humana. USD queda `pending_conversion` con
`amount_atomic: null`, sin inventar un cambio. Una orden ARS antigua pendiente
puede actualizarse mediante `refreshPurchaseOrder`, con una nueva revisión.
La cotización y compra se leen del servidor;
la creación no acepta cantidad, precio, destino o empresa adicionales del cliente.
Cada mutación conserva `action_id`; su recibo y cambio son transaccionales.
La aprobación comprueba `expected_version` bajo bloqueo y exige monto y billetera.

**La lectura no autoriza a firmar.** El DTO no incluye huella de política ni un
claim de pago. Tomás y Nano deben acordar una reserva atómica que revalide empresa,
orden/versión, aprobación, política BUY-02 vigente y proveedor/destino/`wallet_version`.
Cambiar la billetera o condiciones aprobadas invalida la aprobación. PAY-02 valida
dirección no cero, red/token configurados y límites uint256; el snapshot de lectura
no sustituye esas comprobaciones ni debe quedar vigente por una simple lectura.

Puerto de Pagos previsto por el brief:
`payInvoice(actionCtx, { order_id }): Promise<Result<{ payment: OrderPayment }>>`.
La propuesta `OrderPaymentSchema` lleva `id`, estado, hash/link nullable, importe
atómico, `token: 'ARGt'` y `chain: 'arbitrum'`. **Un hash no confirma el pago**:
solo `confirmed`, tras recibo verificado por Pagos, permite mostrar pagada.
`reserved/prepared/submitted/pending/unknown` no permiten otro pago a ciegas;
`reverted/failed` se muestran explícitamente. El link debe corresponder al hash
en `https://arbiscan.io/tx/<hash>`. La idempotencia de pago es por `order_id`.

PAY-02 PR #30 (`78cd6a1`) publica `payInvoice` como stub que siempre devuelve
`PROVIDER_UNAVAILABLE`. La mera presencia de esa función no habilita pagos:
el puerto de CRM requiere `availability: "ready"` explícito, además de la revisión
del claim. Con `"unavailable"` no se llama al stub ni se guarda una aprobación.
Sus reservas privadas no se conectan como atajo.
No se habilitan pagos hasta acordar el claim y conectar el validador de Tomás.
No se exponen claves ni transacciones firmadas. La aceptación live queda pendiente.

QUO-02 está integrado en `main` por PR #35 (`d83096a`): su
`supplier_quotes` usa `unit_price numeric(14,2)`, moneda ARS/USD/unknown y
`source` texto con `call_id` separado. No se duplica esa tabla ni se asume el DTO
propuesto de ORD-02 como estructura persistida.

La lista y ficha viven en `/orders` y `/orders/[id]`. El comparador puede usar
`CreatePurchaseOrderButton` de `crm/components/purchase-order-create-button.tsx`
con la cotización seleccionada. Su conexión al comparador de ORD-02 sigue pendiente;
el botón no pide IDs internos a la persona. `refreshPurchaseOrder` solo actualiza
snapshots de órdenes pendientes; nunca reemplaza una orden aprobada que pudiera
tener un intento de pago en curso. La consulta de estado duradera corresponde a
PAY-02 y todavía debe conectarse.
