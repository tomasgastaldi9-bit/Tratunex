# Tratunex — Brief del MVP (v3: agente de compras)

**Tratunex es un agente de compras para pymes:** busca proveedores, les pide cotización (incluso llamándolos), elige el mejor según las reglas que pone el dueño, explica por qué y **le paga en pesos digitales (ARGt de Twin)** dentro de límites de gasto.

Este documento es la **fuente de verdad** del proyecto: alcance, reparto, datos y reglas. Si algo de código, de Linear o de otro documento lo contradice, gana este brief; para cambiarlo, abrí un PR que lo modifique.

- Tareas: proyecto **Tratunex MVP** en Linear, equipo `TRA` (TRA-63 a TRA-78).
- Cómo trabajar con ramas, commits y PR: [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md).

---

## 1. Qué construimos

Una pyme (ejemplo de la demo: **Sur Insumos**) necesita reponer un insumo. Hoy el dueño busca proveedores a mano, llama a varios, compara en una planilla y paga por transferencia. Tratunex hace ese trabajo con un agente:

1. El dueño carga **qué necesita** y **sus reglas** (presupuesto, cuánto puede pagar el agente solo).
2. El agente **busca proveedores** en la web.
3. El agente **pide cotización**, incluso llamando por teléfono.
4. El agente **compara y elige** al mejor, y **explica** por qué.
5. Si está dentro de las reglas, **paga en ARGt**; si no, pide aprobación. Cada pago queda con su transacción verificable.

## 2. Qué cambió respecto del v2

El v2 era un prospector de **clientes** por llamada con CRM. El mentor nos pidió enfocar en **proveedores y pagos con Belo o Twin**. Lo construido se reutiliza:

| Ya hecho | Uso en v3 |
|---|---|
| Login, multiempresa, RLS, kit de UI, deploy | Igual |
| Prospección con Firecrawl | Buscar **proveedores** |
| Contactos del CRM | Proveedores, con su billetera de cobro |
| Voz: Twilio + Vapi, webhook, análisis de fin de llamada | El agente **llama al proveedor y pide cotización** |
| Perfil de empresa del agente | Datos de la pyme compradora |

Quedan sin usar en la demo: pipeline de clientes, tareas de seguimiento, base de conocimiento. No se borran; solo se esconden del menú.

## 3. Tracks y lo que exigen

| Track | Cierre | Qué exige | Cómo lo cumplimos |
|---|---|---|---|
| **Twin · Stablecoins** | **18:00** | Usar una Twin Stablecoin y mostrar **al menos una transacción onchain real** con hash en el explorer. Repo público con README que indique token, red y contratos. | El pago al proveedor es una transferencia real de **ARGt**. |
| **Belo** (consigna 4: "un agente que maneja tu plata") | **17:30** | Agente de IA que paga con reglas del usuario y **explica cada movimiento**. Pesa: problema real 30%, funciona de punta a punta 25%, llevable a producto 25%, uso de IA 20%. | Reglas del dueño en el servidor + explicación de cada decisión. Cotización ARS/USDT con la API pública de Belo (la única pública; la de pagos se pide a ventas). |
| Avalanche (opcional) | — | Contrato propio verificado en Avalanche, interfaz web, "por qué Avalanche". | Solo si sobra tiempo: contrato de política de pagos que transfiere ARGt. |

Confirmar con la organización si un proyecto puede competir en más de un track.

## 4. Recorrido de la demo

| Paso | Qué se ve | Real o explicado |
|---|---|---|
| 1. Necesidad | "500 vasos para el lunes, máximo $X; hasta $Y paga solo" | Real |
| 2. Proveedores | Lista con la fuente de cada uno | Real (Firecrawl) |
| 3. Cotizaciones | Una llamada real a un compañero que hace de proveedor + 2 cotizaciones de ejemplo rotuladas | Llamada real (Vapi) |
| 4. Elección | Ranking y explicación en lenguaje natural | Real (IA) |
| 5. Pago | Aprobar y pagar en ARGt; hash con link al explorer; equivalente en ARS/USDT según Belo | **Real (Twin)** |
| 6. Lo que viene | Proveedor cobra en Belo y pasa a pesos a su CVU; **seguimiento de proveedores**: el agente confirma entrega y factura, avisa atrasos y prevé los próximos pagos; verificación del proveedor (KYB); compras recurrentes | Solo en el pitch |

Los datos de ejemplo se rotulan siempre como "Datos de prueba". Nunca presentamos un mock como integración real.

## 5. Equipo, ownership y tareas

Cada persona hace frontend y backend de su parte. Leer código ajeno está permitido; editarlo requiere acuerdo con su dueño.

| Persona | Rol v3 | Tareas (Linear) | Carpetas |
|---|---|---|---|
| Tomás | **Pagos en Twin** y prospección | PAY-01 a 03 (TRA-63 a 65), SUP-01 (TRA-66), deploy final (TRA-32) | `src/features/payments/**`, `src/features/discovery/**`, `src/features/platform/**`, `src/lib/**`, configuración raíz, migraciones compartidas, deploy |
| Vale | **Necesidad de compra, reglas y elección con IA** | BUY-01 a 03 (TRA-67 a 69) | `src/features/agent/**`, `src/app/agent/**`, `src/app/purchases/new/**` |
| Bautista | **Cotizar llamando** y precio de Belo | QUO-01 a 04 (TRA-70 a 73), DEMO-01 (TRA-78) | `src/features/voice/**`, `src/app/calls/**`, `src/app/api/voice/**` |
| Nano | **Proveedores, comparador y órdenes** | ORD-01 a 04 (TRA-74 a 77) | `src/features/crm/**`, `src/app/contacts/**`, `src/app/suppliers/**`, `src/app/orders/**`, layout, navegación y UI compartida |

Dependencias clave:

| Quién espera | Qué | De quién |
|---|---|---|
| Nano · ORD-03 pagar | `payInvoice` | Tomás · PAY-02 |
| Tomás · PAY-02 | reglas del dueño (`checkPurchasePolicy`) | Vale · BUY-02 |
| Nano · ORD-02 comparador | cotizaciones de la llamada | Bautista · QUO-02 |
| Nano · ORD-02 | ranking y explicación | Vale · BUY-03 |
| Todos | ARGt en la billetera del agente | Tomás · PAY-01 |

Revisión de PR: el equipo revisa y mergea sin esperar a un revisor fijo; la CI tiene que estar en verde.

## 6. Stack

Lo del v2 más:

| Capa | Elección |
|---|---|
| Pagos | **ARGt (Twin)**, ERC-20 de 18 decimales, transferencia con **viem** desde la billetera del agente |
| Red | **Base** (recomendada): pool ARGt/USDC en Uniswap para conseguir ARGt, feed ARS/USD de Chainlink y explorer basescan. Alternativa: Arbitrum, si los mentores dan ARGt ahí. Usar siempre dirección **+** red |
| Cotización ARS/USDT | API pública de Belo: `GET https://api.belo.app/public/price` (bid, ask, mid por par) |
| Cotización por teléfono | Vapi + Twilio (asistente "cotizador") |

Contratos ARGt (docs de Twin): Base `0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD` · Arbitrum `0x59863989d080B22476DB95656d0C3CC18be92214` · Polygon `0x50464bE58912745447E24EB3bbDedcee10D3E056`. La misma dirección puede ser otro token en otra red.

- **No existe ARGt en testnets.** Los "ARGt" de Sepolia y Base Sepolia son imitaciones que Twin no emitió: no se usan. La demo paga en la red principal con montos mínimos.
- **Cómo conseguir ARGt:** pedirlos a los mentores de Twin (venue o Discord `discord.gg/whU99xqnZ`) o, si el equipo decide poner plata, cambiar unos US$3 de USDC por ARGt en app.twin.finance (Base) y sumar un poco de ETH para el gas.
- **Pasar pesos a ARGt:** feed ARS/USD de Chainlink en Base, `0xaf992a6ad37b4878cF9c31f082B178860e268cE3` (lectura gratis).
- **Belo:** no publica API de pagos (el acceso se pide a ventas) y hoy no recibe ARGt desde billeteras externas. Usamos solo su API de precios; el cobro del proveedor en Belo va en el pitch.

## 7. Pagos: reglas que no se negocian

- **La clave privada de la billetera del agente vive solo en variables de entorno** (Vercel / `.env.local`). Nunca en el repo, en Linear ni en un chat.
- **Las reglas del dueño se aplican en el servidor** antes de firmar: monto máximo, aprobación arriba de un umbral, solo proveedores permitidos.
- **Un pago por orden:** `payInvoice` es idempotente por `order_id`; un doble clic o un reintento nunca paga dos veces.
- **El agente nunca cambia la billetera del proveedor:** la carga una persona en el CRM.
- **Cada pago guarda su hash** y se muestra con link al explorer.
- **Los ARGt son plata real** (1 ARGt ≈ 1 peso): la billetera del agente tiene solo lo justo para la demo.

### Excepción autorizada para la demo

Tomás autorizó una única demostración con una necesidad y cotización **ficticias,
rotuladas como datos de ejemplo**, y una transferencia real de **1 ARGt** entre
las dos billeteras de prueba bajo su control en Arbitrum. No se presenta la
cotización como una oferta real. El destinatario autorizado es
`0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1`; el emisor es la billetera del
agente documentada en el README.

Esta excepción solo se habilita para la empresa y la orden de prueba autorizadas,
con aprobación humana, política y presupuesto vigentes, y mediante una ruta
aislada que conserve la reserva única por orden, el nonce global y la protección
contra retransmisiones. La pantalla debe advertir que los datos son ficticios,
que la transferencia es real y que no puede cancelarse desde la aplicación.
Las cotizaciones de ejemplo siguen bloqueadas en el flujo ordinario. El monto,
la red y las billeteras se verifican en el servidor y la base, no se aceptan del
navegador; habilitar la excepción requiere revisión y pruebas específicas.
La habilitación se retira al terminar la demostración.

## 8. Datos nuevos

Todas las tablas llevan `company_id` y RLS por membresía.

| Tabla | Dueño | Para qué |
|---|---|---|
| `purchase_requests` | Vale | Qué se necesita: producto, cantidad, fecha, presupuesto, zona |
| `purchase_policies` | Vale | Reglas del dueño: máximo, umbral de aprobación, proveedores permitidos |
| `supplier_quotes` | Bautista (llamadas) / Nano (resto) | Cotización: proveedor, precio unitario, stock, plazo, acepta ARGt, origen (llamada / web / ejemplo) |
| `purchase_orders` | Nano | Orden desde la cotización elegida y su estado |
| `payments` | Tomás | Pago en ARGt: monto, red, token, billetera destino, hash, estado |

La billetera de cobro del proveedor va en su contacto del CRM.

## 9. Contratos mínimos

```ts
// Tomás · src/features/payments/server/public.ts
payInvoice(actionCtx, { order_id }): Result<{ payment: { id, status, tx_hash, explorer_url, amount_atomic, token, chain } }>

// Vale · src/features/agent/server/public.ts
checkPurchasePolicy(ctx, { amount_atomic, supplier_contact_id }): Result<{ decision: 'auto_pay' | 'needs_approval' | 'rejected', reason }>
rankQuotes(ctx, { purchase_request_id }): Result<{ ranking: QuoteRank[], recommended_quote_id, explanation }>

// Bautista · src/features/voice/server/public.ts
requestQuoteCall(actionCtx, { supplier_contact_id, purchase_request_id }): Result<{ call }>
getBeloPrice(pair): Result<{ bid, ask, mid, fetched_at }>
```

`Ctx`, `ActionCtx` y `Result<T>` siguen siendo los de `src/contracts/common.ts`. Importes de dinero como string entero (`amount_atomic`, 18 decimales para ARGt); nunca `float`.

## 10. Variables de entorno nuevas

```dotenv
PAYMENT_CHAIN=base
ARGT_TOKEN_ADDRESS=
PAYMENT_RPC_URL=
AGENT_WALLET_PRIVATE_KEY=
PAYMENT_EXPLORER_URL=
```

Se suman a las del v2 (Supabase, Firecrawl, Vapi). Valores por un canal privado.

## 11. Cronograma (sábado 7/11)

| Hora | Qué |
|---|---|
| 14:00–14:15 | Alinear al equipo; conseguir ARGt (mentores de Twin o cambio en app.twin.finance) |
| 14:15–16:30 | Construir en paralelo |
| 16:30–17:10 | Integrar en el deploy, README de Twin con hash, video de respaldo |
| 17:10–17:25 | Ensayo y entrega (Belo 17:30, Twin 18:00) |

## 12. Terminado

- [ ] Una compra con reglas cargadas.
- [ ] Proveedores encontrados con su fuente.
- [ ] Al menos una cotización que viene de una llamada real.
- [ ] El agente recomienda y explica.
- [ ] **Un pago real en ARGt con hash verificable en el explorer**, sin pagar dos veces.
- [ ] README con token, red, contrato y hash. Repo público.
- [ ] Video de respaldo y entregas hechas a tiempo.
