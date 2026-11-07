# ORD-02 · Propuesta de integración del comparador

Esta entrega es un **draft** de lectura. No declara ORD-02 terminado ni demuestra
la aceptación con cotizaciones de llamadas reales o ranking de IA integrado.
Los schemas de `src/contracts/supplier-quotes.ts` son una propuesta para revisar
con Bautista (QUO-02) y Vale (BUY-03), no un contrato ya conectado.

## Integraciones y rutas

- BUY-01 ya publica `getPurchaseRequest(ctx, { purchase_request_id })` desde
  `src/features/agent/server/public.ts`. El comparador consume esa compra y su
  UUID; no crea otra tabla ni otro identificador de compra.
- `/orders/quotes?purchase_request_id=<UUID>` es la ruta prevista para datos
  de la empresa activa. Mientras falten adaptadores, cotizaciones y recomendación
  se muestran pendientes; no se sustituyen por ejemplos al fallar una lectura.
- `/orders/quotes/example` es una demostración separada de solo lectura. Toda
  cotización y recomendación allí es un ejemplo rotulado como **Datos de prueba**.
  No representa llamadas, búsqueda web, IA, órdenes ni pagos ejecutados.
- QUO-02 y BUY-03 siguen pendientes de conexión y revisión de sus dueños.
- BUY-01 puede enlazar la compra guardada a
  `/orders/quotes?purchase_request_id=<purchase_request.id>`. Ese enlace en el
  módulo de Vale queda pendiente de integración; la pantalla no le pide al dueño
  que copie UUID internos. Sin una compra seleccionada, ofrece crear una compra
  o revisar el ejemplo rotulado.

## Cotización propuesta

`SupplierQuoteSchema` es estricto; los campos siguientes son obligatorios. Los
que admiten `null` representan datos desconocidos, no valores cero inventados.

| Campo | Forma exacta propuesta |
|---|---|
| `id`, `company_id` | UUID |
| `purchase_request_id`, `supplier_contact_id` | UUID de la compra y del contacto proveedor |
| `unit_price` | `QuoteMoney` o `null` |
| `can_supply` | `yes`, `partial`, `no`, `unknown` |
| `available_quantity`, `minimum_order_quantity` | Entero de 0 a 1.000.000.000 o `null` |
| `lead_time_days` | Entero de 0 a 365 o `null` |
| `lead_time_text`, `payment_terms`, `notes` | Texto no vacío, hasta 2.000 caracteres, o `null` |
| `price_includes_vat`, `delivery_included`, `accepts_argt` | `yes`, `no`, `unknown` |
| `summary` | Texto no vacío, hasta 2.000 caracteres |
| `source` | Una de las variantes descritas abajo |
| `created_at` | Fecha y hora ISO UTC |

Las variantes estrictas de `source` son:

```ts
{ kind: 'call', call_id: string, transport: 'mock' | 'web' | 'phone' }
{ kind: 'web', url: string } // URL HTTP(S), hasta 2.048 caracteres
{ kind: 'example', label: string } // texto no vacío, hasta 200 caracteres
```

`call_id` es UUID interno; no es `provider_call_id`. Empresa, compra, proveedor,
llamada y transporte se resuelven en servidor. Una fuente `call` con transporte
`mock` o `web` no se presenta como llamada telefónica real.

## Dinero sin conversión implícita

La propuesta de `QuoteMoney` conserva moneda y escala junto al importe:

```ts
{
  amount_atomic: string; // "0" o entero positivo sin ceros iniciales, hasta 78 cifras
  currency: 'ARS' | 'USD' | 'ARGt';
  decimals: number; // entero entre 0 y 18; ARGt exige exactamente 18
}
```

Por ejemplo, `{ amount_atomic: "150050", currency: "ARS", decimals: 2 }`
representa ARS 1.500,50. El cero es un precio conocido; `unit_price: null`
significa precio no disponible. No se persisten importes como `number`.

`formatQuoteMoney` muestra el importe exacto mediante `BigInt`; `quoteTotal`
multiplica el precio por la cantidad entera de BUY-01, sin cambiar moneda ni
escala. No convierte ARS/USD a ARGt ni compara monedas distintas. Los totales
deben respetar los límites del contrato si se reutilizan como `QuoteMoney`.
El helper rechaza el desborde de 78 cifras y la vista muestra "Total fuera de
rango". Este límite de lectura no sustituye la validación `uint256` de Pagos.

El presupuesto de BUY-01 (`budget_atomic`) ya usa unidades mínimas de ARGt con
18 decimales. No se compara directamente con una cotización ARS o USD. La
escala definitiva de esas monedas y cualquier conversión requieren acuerdo y
metadatos de una fuente de cambio; esta entrega no los inventa ni inicia pagos.

## Mapeo pendiente desde QUO-01

El extractor actual vive en `src/features/voice/server/quote-call.ts`. QUO-02
debe normalizarlo antes de entregar una cotización al comparador.

| Extracción QUO-01 | Destino propuesto / tratamiento |
|---|---|
| `provider_call_id` del reporte | Resolver la llamada guardada y obtener `source.call_id`, empresa, compra, proveedor y transporte |
| `unit_price: number` opcional | Normalizar a entero string, moneda y escala; pendiente acordar conversión exacta de la extracción, sin `Number * 10**18` ni redondeo silencioso |
| `currency: ARS | USD | unknown` opcional | ARS/USD conservan su moneda; si falta o es `unknown`, no asumir moneda ni fabricar `QuoteMoney` |
| `can_supply` | Mismos cuatro valores |
| `available_quantity`, `minimum_order_quantity`, `lead_time_days` opcionales | Mismo campo; ausencia pasa a `null`, conservando el cero válido |
| `lead_time_text`, `payment_terms`, `notes` opcionales | Mismo campo o `null`; respetar los límites del extractor y del DTO |
| `price_includes_vat`, `delivery_included` opcionales | Mismo enum; ausencia pasa a `unknown` |
| `accepts_argt`, `summary` | Mismos campos y enums; no inferir aceptación desde la moneda |
| `spoke_with_person` | No tiene campo equivalente en este DTO; QUO-02 debe definir cómo representar una llamada sin conversación sin inventar condiciones comerciales |
| `do_not_contact_requested` | No se descarta: corresponde al tratamiento de DNC del contacto, separado del DTO de cotización y conservando la preferencia del CRM |

El asistente actual no solicita billeteras por teléfono. Ningún dato de la
extracción puede crear, reemplazar o vaciar `collection_wallet`; el destino se
carga por escrito mediante la acción humana de ORD-01.

## Puertos propuestos y responsabilidades

Los siguientes son **tipos**, no funciones conectadas ni nuevas implementaciones
en dominios ajenos. Ambos reciben `Ctx` y devuelven el `Result<T>` común.

```ts
type ListSupplierQuotes = (
  ctx: Ctx,
  input: { purchase_request_id: string },
) => Promise<Result<{ items: SupplierQuote[] }>>;

type RankSupplierQuotes = (
  ctx: Ctx,
  input: { purchase_request_id: string },
) => Promise<Result<{
  ranking: Array<{ quote_id: string; reason: string }>;
  recommended_quote_id: string;
  explanation: string;
}>>;
```

- QUO-02 (Bautista) y CRM (Nano) revisan el DTO y un único almacenamiento
  `supplier_quotes`. Su ownership es compartido: llamadas de Bautista, resto
  de Nano; Tomás coordina la migración. Este draft no crea SQL duplicado ni una
  tabla paralela. La firma de escritura todavía debe acordarse.
- BUY-03 (Vale) publica `rankQuotes` desde su `server/public.ts`; se propone
  conectarla al puerto `RankSupplierQuotes` después de revisar el schema.
  El comparador no reemplaza esa función por una heurística presentada como IA.
- El comparador (Nano) muestra la compra, las cotizaciones, el recomendado y
  la explicación; no altera condiciones comerciales, wallets ni pagos.

La lista propuesta admite hasta 100 cotizaciones y aún no tiene cursor. Antes
de conectar el almacenamiento, hay que acordar cómo declarar una colección
completa; no truncar resultados silenciosamente para producir un ranking.
El ranking propuesto contiene entre 1 y 100 filas, razones de hasta 2.000
caracteres y una explicación de hasta 4.000.

Además de Zod, el adaptador deberá validar que todas las cotizaciones pertenezcan
a la empresa y compra solicitadas, que sus IDs no se repitan y que todos los IDs
del ranking/recomendado existan en esa misma colección. El recomendado debe
estar incluido en el ranking, sin filas duplicadas. Ante error o datos
incompatibles, se representa el error explícito; no se muestran fixtures como
resultado del proveedor.

## Qué falta para cerrar ORD-02

Revisión de campos y dinero por QUO-02/BUY-03; escritura y lectura de la tabla
compartida con aislamiento e idempotencia; conexión al ranking de Vale;
verificación con tres cotizaciones y su explicación en el recorrido real.
Hasta entonces, el PR permanece draft y no acredita aceptación live.
