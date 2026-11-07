# ORD-02 · Comparador de cotizaciones

El comparador consume los servicios públicos publicados de BUY-01, QUO-02,
ORD-01 y BUY-03. Es una lectura: abrirla no llama a proveedores, no guarda
cotizaciones, no crea órdenes y no inicia pagos. La aceptación con llamadas
telefónicas reales y una explicación generada por IA requiere evidencia de ese
recorrido; las pruebas locales y el ejemplo no la acreditan.

## Servicios y rutas

`src/features/crm/server/quote-comparison-workspace.ts` conecta:

| Import público | Firma consumida |
|---|---|
| `agent/server/public.ts` | `getPurchaseRequest(ctx, { purchase_request_id })` |
| `voice/server/public.ts` | `listSupplierQuotes(ctx, { purchase_request_id })` |
| `crm/server/public.ts` | `getSupplier(ctx, { contact_id })` |
| `agent/server/public.ts` | `rankQuotes(ctx, { purchase_request_id, quotes: QuoteForRanking[] })` |

Todos devuelven el `Result<T>` común. Identidad y empresa provienen del contexto
del servidor; los errores no se sustituyen por fixtures. Se valida que compra,
cotizaciones y proveedores correspondan a la empresa activa, sin IDs repetidos.

- `/orders/quotes?purchase_request_id=<UUID>` compara la compra guardada.
- Sin compra seleccionada, la pantalla muestra el selector de compras guardadas
  de ORD-04, con enlaces a solicitar/comparar cotizaciones, nueva compra y ejemplo.
  No pide UUID manual. La lectura mínima del selector usa empresa y RLS;
  la compra seleccionada se resuelve por el servicio público de BUY-01.
- `/orders/quotes/example` es completamente ficticio y de solo lectura. Rotula
  todos los orígenes como datos de prueba, no enlaza proveedores/llamadas reales
  y no ejecuta IA, persistencia ni pagos.

## Cotización y dinero

`src/contracts/supplier-quotes.ts` valida el DTO que QUO-02 publica como
`ComparatorQuote` en `voice/server/quote-import.ts`:

| Campo | Forma |
|---|---|
| `id`, `company_id`, `purchase_request_id`, `supplier_contact_id` | UUID internos |
| `unit_price` | `{ amount_atomic: string, currency: ARS / USD / ARGt, decimals: 0..18 }` o `null`; ARGt exige escala 18 |
| `can_supply` | `yes`, `partial`, `no`, `unknown` |
| `available_quantity`, `minimum_order_quantity` | Entero 0..1.000.000.000 o `null` |
| `lead_time_days` | Entero 0..365 o `null` |
| `lead_time_text`, `payment_terms`, `notes` | Texto hasta 2.000 caracteres o `null` |
| `price_includes_vat`, `delivery_included`, `accepts_argt` | `yes`, `no`, `unknown` |
| `summary`, `created_at` | Texto hasta 2.000 caracteres; fecha ISO UTC |
| `source` | `call` + UUID/transport `mock/web/phone`; `web` + URL HTTP(S); `example` + etiqueta |

QUO-02 normaliza precios ARS/USD a enteros string con escala 2. La tabla y la
extracción son responsabilidad de Bautista; este módulo no duplica SQL ni
escrituras de `supplier_quotes`. La normalización desde el precio numérico de
QUO-01 vive en su adaptador publicado. Ausencias permanecen `null`/`unknown`.
La wallet y el DNC pertenecen al CRM; el comparador no los modifica.

La vista conserva moneda y escala originales. `quoteTotal` multiplica
`BigInt(amount_atomic)` por la cantidad entera sin flotantes; rechaza más de 78
cifras y muestra “Total fuera de rango”. Este límite no sustituye `uint256` ni
la validación de Pagos.

Para BUY-03, `server/quote-ranking-adapter.ts` proyecta el precio unitario:

- ARS: equivalencia **nominal** 1 ARS = 1 ARGt, consistente con
  `purchases.ts::pesosToAtomic`. Centavos ARS se multiplican por `10^16`.
- ARGt: conserva su entero con escala 18; QUO-02 actual no devuelve esa moneda.
- USD o precio desconocido: `unit_price_atomic: null`; no hay fuente de cambio
  ni conversión automática USD→ARGt.

Se proyectan también identidad, nombre, stock, plazo, aceptación de ARGt y
origen. BUY-03 no recibe `can_supply`, mínimos, IVA ni costo de entrega; la
pantalla los conserva visibles para la revisión humana. Si devuelve elegible
una cotización que declaró `can_supply: no`, la recomendación se representa
como incompatible, sin inventar un stock.
BUY-03 limita la etiqueta de proveedor a 120 unidades UTF-16. Para nombres CRM
más largos se envía una etiqueta con elipsis sin dividir pares sustitutos;
el UUID y el nombre completo de la fila se conservan. La etiqueta no identifica
ni autoriza al proveedor: para eso se utiliza su UUID.

## Ranking y límites

`QuoteRankingSchema` reutiliza `purchases.ts::rankQuotesOutputSchema`; no hay
heurística propia presentada como IA. Se muestran los `position`, `eligible`,
`reasons`, `policy`, `explanation` y `explanation_source` reales. La procedencia
es “IA” o “Reglas”; el ejemplo siempre se identifica como ilustrativo.
`recommended_quote_id: null` es válido si no hay proveedor que califique.
Calificar en el ranking no constituye una aprobación de orden ni de pago.

El adaptador verifica que el resultado incluya exactamente las cotizaciones
enviadas, con proveedor/nombre correctos, posiciones únicas y total exacto
precio×cantidad. La recomendada debe ser la primera elegible por posición.
Ante fallo de ranking se conserva la tabla con un error explícito; nunca se
selecciona un proveedor de respaldo localmente.

BUY-03 admite hasta **20** cotizaciones. Con 21..99, se conserva toda la tabla
y se muestra el límite sin mandar un subconjunto. QUO-02 limita su lector a
**100** sin cursor/count; si devuelve exactamente 100, se rechaza la lectura
porque no puede acreditarse que esté completa. Una paginación o señal de
completitud debe acordarse con Bautista antes de ampliar ese caso.

## Enlace con ORD-03

ORD-03 está integrado en `main` por PR #36. Las filas guardadas cuyo origen no
sea `example` conectan `CreatePurchaseOrderButton` de
`components/purchase-order-create-button.tsx`. La acción es humana y explícita;
montar la pantalla no envía un POST. El widget pasa solo el UUID de la cotización
y un `action_id` estable, conservado para recuperar la misma orden si el
resultado es incierto. Empresa, importe y snapshots de wallet se validan de
nuevo en servidor; el navegador no envía importes ni destinos.

El ejemplo global y las filas `source.kind: example` no muestran esa acción.
Crear una orden no implica aprobarla ni pagarla. PAY-02 sigue deshabilitado en
CRM: leer `getPurchaseOrder` no autoriza una firma. Tomás y Nano deben acordar
el claim atómico y conectar el puerto con `availability: ready` explícito antes
de habilitar pagos; la presencia del stub público no alcanza. Ver
`ORD03-INTEGRATION.md` para el contrato y las validaciones vigentes.
