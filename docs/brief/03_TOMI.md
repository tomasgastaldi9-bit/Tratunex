# Plan de desarrollo de Tomi

**Brief final de implementación · Contrato técnico v1.0 · Brief v1.2 · Equipo: Vale, Bauti, Tomi y Nano.**

Tomi desarrolla pedidos, cobros y pagos a proveedores, además del bootstrap y el entorno compartido. El producto completo incluye prospección de Vale, voz de Bauti y CRM de Nano. Tu dominio convierte acciones comerciales en pedidos y transferencias verificadas. Leer primero [00_GENERAL.md](00_GENERAL.md): allí están los nombres definitivos de contratos, estados, IDs y límites de edición.

## 1. Entregas y ownership

Tu entrega final permite cotizar, confirmar una venta, generar un enlace público y verificar un cobro en testnet. También permite confirmar una compra y pagar automáticamente a un proveedor permitido dentro de límites. El pedido y el pago conservan estados independientes.

Podés modificar:

```text
src/features/commerce/**
src/app/orders/**
src/app/payments/**
src/app/pay/[token]/**
src/app/api/commerce/**
src/app/api/public/payments/**
src/app/api/jobs/tick/route.ts
src/app/api/health/**
src/app/login/**
src/contracts/commerce.ts
src/contracts/common.ts
src/lib/supabase/**
src/lib/auth.ts
src/lib/env.ts
src/lib/http.ts
src/proxy.ts
src/fixtures/common.ts
package.json y package-lock.json
configuraciones raíz, .env.example y configuración de despliegue
```

Nano posee layout, CSS global, navegación y componentes compartidos. Vale posee datos del negocio y catálogo. Bauti posee voz. Si necesitás cambiar sus contratos o archivos, pedí el cambio con su motivo. Todos pueden aportar migraciones; vos coordinás orden y aplicación remota.

## 2. Bootstrap durante los primeros 45 minutos

La meta es entregar una base importable y desplegada, no completar comercio antes de que los demás empiecen. Vale acompaña la configuración inicial durante unos 20 minutos.

1. Usar Node 24 y npm, crear el repositorio privado `hackatwin` y configurar un proyecto Supabase y uno Vercel para integración.
2. Crear Next con TypeScript, Tailwind, ESLint, App Router, `src/` y alias `@/*`. Ejecutar una sola vez:

```bash
npx create-next-app@latest hackatwin --ts --tailwind --eslint --app --src-dir --use-npm --import-alias '@/*'
cd hackatwin
npm install --save-exact @supabase/supabase-js @supabase/ssr zod viem @vapi-ai/web lucide-react server-only
npm install --save-dev --save-exact vitest @playwright/test
```

3. Fijar también las versiones resueltas de los paquetes generados y conservar lockfile. Publicar scripts `dev`, `build`, `start`, `lint` con `eslint .`, `typecheck` con `tsc --noEmit`, `test` con `vitest run` y `test:e2e` con `playwright test`.
4. Crear clientes Supabase SSR y administración separados. Marcar el administrador `server-only`. Validar variables con Zod. Proveer `requireBusinessContext()` a los módulos.
5. Configurar login email/contraseña y usuarios precreados para la demo; sin flujo de registro nuevo. Crear membresías explícitas al negocio. Validar JWT según la guía SSR actual, no confiar en el objeto de `getSession()` por sí solo. Configurar actualización de sesión en `src/proxy.ts`, sin redirigir webhooks o checkout público al login.
6. Crear los contratos comunes, IDs y fixtures del general; recibir schemas de cada propietario. Publicar helpers HTTP y errores tipados.
7. Crear esquema base en orden de dependencias y RLS. Publicar el commit `chore/bootstrap`; todos crean sus ramas desde él.
8. Desplegar healthcheck y URL estable. Dar a Bauti la URL de webhook y a Nano el login y los IDs del negocio de prueba.

Si un proveedor todavía no está configurado, el repositorio arranca con su adaptador mock explícito. El backend informa capacidades sin secretos. El equipo sigue implementando con los mismos DTO mientras vos conectás la infraestructura.

## 3. Datos y contratos de comercio

Tablas de tu módulo: `orders`, `order_items`, `payments`, `commerce_actions`, `commerce_effects`, `purchase_policies` y `purchase_budget_reservations`. Añadir una reserva de presupuesto persistente para compras; no calcular presupuesto sólo en memoria. Toda fila lleva negocio e IDs consistentes. Moneda de demo USDC, importes en `amount_atomic` como string, cantidades enteras y aritmética BigInt. Guardar snapshots de producto, precio y cantidades en los ítems para que un cambio de catálogo no reescriba pedidos anteriores.

`orders`: `id`, `business_id`, `contact_id`, `opportunity_id` opcional, `call_id` opcional, `direction: sale|purchase`, `status: draft|confirmed|cancelled`, `total_amount_atomic`, `created_at`.

`payments`: `id`, `business_id`, `order_id`, `direction: incoming|outgoing`, `status: pending|submitted|confirmed|failed|expired`, red, contrato, decimales, importe, receptor, emisor esperado cuando se conoce, token público opaco para cobros, hash, índice de log, timestamps y error.

Exponer en `src/features/commerce/server/public.ts`:

```ts
createQuote(actionCtx, {
  contact_id, opportunity_id?, call_id?, direction,
  items: [{ product_id, quantity, quoted_unit_amount_atomic? }]
})
confirmOrder(actionCtx, { order_id })
createPaymentRequest(actionCtx, { order_id })
verifyPayment(actionCtx, { payment_id, tx_hash })
executeSupplierPayment(actionCtx, { order_id })
listContactOrders(ctx, { contact_id })
getPurchasePolicy(ctx)
updatePurchasePolicy(actionCtx, input)
processCommerceJobs(ctx, { limit })
```

Todas devuelven `Result<T>`. Publicar DTO de pedido, ítems y pago antes de las 9:45. `createQuote` devuelve un pedido `draft` con total calculado; `confirmOrder` devuelve el pedido confirmado; `createPaymentRequest` devuelve pago y URL; `verifyPayment` devuelve estado actual y referencia verificable. Bauti consume las funciones; Nano consume los DTO por API para el detalle del contacto.

Dependencias públicas:

- Vale: `getProductsByIds`, `getBusinessContext`, `getSupplierSettings`.
- Nano: `getContact` para validar contacto y pertenencia; actualizar oportunidad mediante su contrato público cuando una venta se confirma.
- Bauti: el tick invoca `dispatchDueVoiceJobs` y `processVoiceEffects`. No importes su implementación interna.

No escribir directamente tablas de CRM. Después de confirmar un pedido sale con oportunidad, guardar un efecto durable hacia `markOpportunityWon(actionCtx,{opportunity_id,order_id})`, contrato definitivo de Nano. Si falla temporalmente, reintentar con la misma clave sin repetir ni deshacer el pedido.

## 4. API y pantallas

| Ruta | Acción |
|---|---|
| `POST /api/commerce/orders` | Crear cotización/pedido draft. |
| `GET /api/commerce/orders?contact_id=...` | Listar con contexto de negocio del usuario. |
| `POST /api/commerce/orders/[orderId]/confirm` | Confirmar pedido mediante regla de dominio. |
| `POST /api/commerce/payments` | Crear solicitud de cobro de un pedido confirmado. |
| `POST /api/commerce/payments/[paymentId]/verify` | Verificar hash informado; no confiar en estado del cliente. |
| `POST /api/commerce/orders/[orderId]/pay-supplier` | Ejecutar compra permitida; exige contexto autorizado. |
| `GET /api/public/payments/[token]` | Datos mínimos de una solicitud de cobro. |
| `POST /api/public/payments/[token]/verify` | Presentar hash para validación de cobro entrante. |

Las rutas públicas no permiten enviar dinero ni cambiar receptor, importe o token. `/orders` muestra lista y detalle con ítems, dirección y estado; `/payments` muestra pagos; `/pay/[token]` muestra red, importe, receptor, conexión de wallet, firma y resultado. El enlace puede copiarse desde la aplicación; no promete envío por WhatsApp/SMS sin una integración de mensajería implementada.

## 5. Tickets por fase

### Fase 1 de 09:00 a 09:45

**TOM-01 Bootstrap y acceso.** Completar sección 2. Aceptación: cada compañero ejecuta `npm ci`, importa sus contratos y entra al negocio de prueba; healthcheck responde en la URL compartida. Commit y aviso al equipo.

**TOM-02 Schemas y fixtures.** Definir DTO de comercio y adaptadores mock/live. Aceptación: el mock permite un pedido confirmado y pago de prueba rotulado, con UUID del general y sin credenciales reales.

### Fase 2 de 09:45 a 11:00

**TOM-03 Pedidos.** Implementar cotización y confirmación usando catálogo de Vale o su fixture. Validar cantidades, pertenencia y política; un precio dado por el modelo nunca sustituye el precio de venta del catálogo. Aceptación: repetir `action_id` devuelve el mismo pedido, con los mismos ítems y total.

**TOM-04 Probar red y fondos.** Comprobar RPC Fuji, token oficial, decimales, wallet pagadora, receptora y fondos de prueba para USDC y gas. Aceptación: una transferencia manual pequeña tiene receipt verificable. Una dirección o red no validada queda como bloqueo visible.

### Fase 3 de 11:00 a 13:00

**TOM-05 Cobro real de testnet.** Crear solicitud y checkout. La wallet del cliente firma el ERC20 Transfer. El servidor comprueba red 43113, contrato configurado, receipt exitoso, evento, emisor esperado si se fijó, receptor, importe y número de confirmaciones. Usar lectura corta del receipt; si está pendiente, conservar estado y verificar en el siguiente job, sin bloquear HTTP esperando indefinidamente.

Aceptación: hash correcto confirma pago; hash de otro token, receptor o importe no lo confirma. Una transferencia no puede pagar dos pedidos gracias a unicidad `(chain_id,tx_hash,log_index)`. El hash debe corresponder a una solicitud vigente y al pedido validado; no aceptar transferencias antiguas anteriores a esa solicitud.

**TOM-06 Scheduler.** Configurar Cron + pg_net + Vault para `POST /api/jobs/tick`, autenticado. Despachar voz y comercio con contexto system. Aceptación: job ejecutado desde el scheduler con navegador cerrado; secreto incorrecto devuelve 401/403. Procesar lotes acotados y publicar estado de errores, sin secretos en logs.

### Fase 4 de 13:00 a 15:00

**TOM-07 Compras y pagos salientes.** Mantener `direction=purchase`. Leer proveedor y wallet de `supplier_settings`, nunca del texto generado por la IA. Leer precio cotizado y límites autorizados, confirmar pedido y reservar presupuesto por negocio de forma atómica antes de ejecutar.

Usar exclusivamente wallet de prueba del servidor y comprobar explícitamente `chain_id=43113`. Validar proveedor permitido, máximo por pedido, presupuesto diario y estado del pedido. Serializar nonce/envíos para esa wallet. Preparar y firmar, guardar hash esperado y operación antes del broadcast; ante fallo de red reconciliar ese hash y retransmitir la misma transacción cuando corresponda. Nunca crear otro pago por un timeout ambiguo. Liberar o reconciliar la reserva sólo cuando el resultado se conoce.

Aceptación: pedido permitido paga al proveedor correcto y se confirma; exceso devuelve `POLICY_REJECTED` y queda pendiente de revisión. Dos solicitudes concurrentes no pueden superar el presupuesto ni duplicar un pago. Una confirmación comercial verbal no habilita una wallet nueva.

### Fase 5 de 15:00 a 16:30

**TOM-08 Consistencia y pruebas negativas.** Acción y registro idempotente en transacción de dominio, no check-then-insert desde JavaScript. Confirmación, pago y actualización CRM son efectos separados con reintentos durables. No dar por completado el efecto CRM antes de recibir su resultado.

### Fase 6 de 16:30 a 18:00

**TOM-09 Entrega.** Congelar dependencias y contratos, verificar variables del despliegue final, scheduler y webhooks. Preparar saldo de las wallets y evidencias de los dos movimientos de demo. Ejecutar build y participar de dos ensayos completos.

## 6. Pruebas que sí importan

- Dos creaciones idénticas producen un pedido; misma clave con distinto payload devuelve conflicto.
- El backend recalcula un precio de venta manipulado.
- Hash inválido, token diferente, receptor diferente, importe incorrecto y red incorrecta no confirman pago.
- Una transferencia no se reutiliza; submitted no equivale a confirmed.
- Dos compras concurrentes respetan presupuesto y emiten un único envío por pedido.
- Reiniciar después de transmitir no genera un segundo pago; se reconcilia el hash guardado.
- Usuario de otro negocio y petición pública no acceden a pedidos privados ni a pagos salientes.
- El checkout y el detalle de Nano muestran el mismo estado después de recargar.

Vitest cubre cálculo, validación de receipts, estados e idempotencia; integración de base cubre reservas y concurrencia. Playwright cubre el checkout hasta la etapa previa a firma; firma y transacción externa se comprueban en el ensayo real de testnet. No presentar los tests con mocks como prueba de un pago en cadena.

## 7. Fuentes y prompt para desarrollar

Referencias: [Next setup](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [scheduler HTTP](https://supabase.com/docs/guides/functions/schedule-functions), [contratos USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [viem](https://viem.sh/docs/getting-started).

```text
Soy Tomi. Lee 00_GENERAL.md y 03_TOMI.md. Implementaremos comercio y la base
compartida, por ticket. Respeta contratos y ownership. No edites CRM, voz,
catálogo ni layout. Usa imports públicos, Zod, RLS y contexto de negocio
verificado. Dinero en enteros/string; pagos exclusivamente Fuji. El modelo no
elige precios, destinos ni permisos. Antes de llamar a un proveedor externo,
consulta su documentación actual. Publica contratos y fixtures temprano.
Cada ticket termina con una comprobación reproducible y sus límites.
No afirmes que existe una integración si sólo funciona su adaptador mock.
```


## Precisiones finales del contrato

La sección 14 del general fija DTO y envoltorios exactos; prevalece sobre abreviaciones anteriores. Publicar también `GET/PATCH /api/commerce/purchase-policy` para la pantalla de Vale. Política: auto_purchase_enabled, max_order_amount_atomic, daily_budget_amount_atomic, allowed_supplier_contact_ids y budget_timezone argentina. El día presupuestario comienza a medianoche argentina. Mutar políticas exige usuario autorizado, nunca contexto del modelo.

`PURCHASE_TEST_PAYER_PRIVATE_KEY` corresponde a la wallet pagadora del negocio, no al proveedor. Asegurar USDC de prueba y AVAX para gas en esa wallet; supplier_settings contiene sólo la dirección receptora autorizada. Los imports públicos de comercio incluyen getPurchasePolicy/updatePurchasePolicy. La URL estable de webhook para Bauti es `/api/voice/webhooks/vapi`.

El tick conserva contexto system y límites de lote. Bauti/Nano transportan lease_id entre claim y complete/fail; un timeout externo ambiguo no se convierte automáticamente en una tarea nueva ni en un nuevo envío de fondos.


## Configuración final para tu implementación

Aplicar sección 15 del general sin reabrir tecnologías: Node 24/npm, Next App Router/TypeScript/Tailwind, Supabase, viem, Vercel. Fijar versiones una sola vez y publicar lockfile. Voz: Vapi con gpt-4.1-mini, Deepgram nova-3 y Cartesia sonic-3.5; agregar al entorno VAPI_WEBHOOK_CREDENTIAL_ID y CARTESIA_VOICE_ID. No hace falta otro servidor ni clientes directos de audio.

Inicializar política de compras del negocio de prueba con auto_purchase_enabled true, máximo 25 USDC por pedido y 100 USDC diarios; sólo proveedor del UUID compartido, wallet de prueba y Fuji. Guardar políticas y reservas en sus tablas. Nuevos negocios comienzan deshabilitados. Tick cada minuto, lote 5, lease 90 s, backoff 60/120/240 s y tres reintentos técnicos. Tres confirmaciones por transferencia. Cargar suficiente USDC de prueba y AVAX para gas antes del ensayo de compra de 10 USDC.

Tu primer bloque es creación del repositorio, configuración de cuentas, implementación de contratos v1 y publicación del base. El framework, los proveedores y el reparto ya están definidos.


## Adaptación al nicho y al jurado

Leer sección 16 del general. TOM-J01 hace visible la relación entre pedido y liquidación: dirección de pago, importe, red, token, receptor, hash y estado comprobado. Exponer una referencia de explorador mediante configuración de la red; no construir otro sistema de analítica. Mantener datos de contactos y conversaciones fuera de cadena.

Mostrar una compra permitida y otra rechazada por política, además del rechazo de una transferencia inválida o reutilizada. Registrar gas observado como gasUsed por effectiveGasPrice cuando esté disponible e identificar su pagador. No convertir AVAX a USDC sin un precio documentado. Volumen cobrado para el comercio no equivale a ingreso del software.

La demo conserva USDC testnet en Fuji. No afirmar integración con Twin, ARGt, Tether o Belo. Los campos actuales de red/token/decimales sirven como frontera para futuras integraciones; otro activo requiere validar red, disponibilidad y unidad de cuenta. Cotización/entrada/salida en pesos no están implementadas por este brief. Conservar la diferencia entre wallet pagadora de prueba del negocio y wallet receptora del proveedor.


## Límite de presentación

La exposición total dura como máximo 120 segundos, incluyendo cualquier audio o demo. Leer [Objetivos, alcances y pitch](05_OBJETIVOS_ALCANCES_Y_PITCH.md). Los módulos completos se mantienen; el pitch muestra evidencia breve del recorrido y reserva el detalle técnico para preguntas si las hay.
