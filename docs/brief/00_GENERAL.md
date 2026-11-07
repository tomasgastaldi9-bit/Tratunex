# Brief del proyecto Tratunex

**Brief final de implementación · Contrato técnico v1.0 · Brief v1.2 · Equipo: Vale, Bauti, Tomi y Nano.**

El equipo desarrollará un asistente de operaciones comerciales para distribuidoras B2B de insumos recurrentes: busca posibles clientes, los contacta mediante un agente de voz, registra oportunidades y seguimientos, genera pedidos y cobra. El mismo motor contactará proveedores, preparará compras y ejecutará pagos dentro de una política de gasto previamente configurada.

Este archivo fija la arquitectura y los contratos del equipo. Cada persona lee primero este plan y después su archivo: [Vale](01_VALE.md), [Bauti](02_BAUTI.md), [Tomi](03_TOMI.md) o [Nano](04_NANO.md). El reparto queda definido por responsabilidad técnica: Vale, negocio y prospección; Bauti, voz; Tomi, comercio e infraestructura; Nano, CRM y seguimiento. Los archivos describen lo que hay que construir; todavía no existe una aplicación implementada ni servicios conectados.

La sección 16 define el nicho inicial, el guion de demo y la evidencia para las especialidades profesionales del jurado fotografiado. Para la explicación funcional completa y el texto de presentación, leer [Objetivos, alcances y pitch de dos minutos](05_OBJETIVOS_ALCANCES_Y_PITCH.md). El límite total de presentación es 120 segundos.

## 1. Alcance y demostración

Se conservan todos los módulos de la propuesta original. Para integrarlos durante la jornada, la demostración usará una distribuidora ficticia, una fuente de búsqueda, un servicio de voz y una red de pagos. Estas elecciones acotan integraciones, no eliminan funciones.

**Historia de venta:** configurar negocio y catálogo → buscar cafeterías → importar un prospecto al CRM → lanzar una llamada o campaña → calificar interés → cotizar y confirmar un pedido → generar enlace de cobro → pagar → verificar el cobro → actualizar historial.

**Historia de seguimiento:** el contacto pide otra llamada → guardar tarea con fecha → el scheduler la reclama → se inicia la llamada automáticamente → queda registrada la gestión.

**Historia de compra:** indicar reposición de un producto y cantidad → llamar a un proveedor configurado → registrar disponibilidad y precio → preparar y confirmar pedido de compra → evaluar límites → enviar pago de prueba al proveedor → verificarlo y mostrarlo en el historial.

La demo utilizará teléfonos controlados por el equipo y fondos de testnet. Los resultados encontrados en la web conservan su fuente; no se llama automáticamente a toda búsqueda. La campaña se inicia desde el producto con contactos seleccionados y límites configurados.

## 2. Stack definitivo

| Capa | Elección | Motivo de la elección |
|---|---|---|
| Runtime y lenguaje | Node.js 24 y TypeScript en modo estricto | Un lenguaje para interfaz, servidor y contratos. |
| Aplicación | Next.js App Router, versión estable fijada al crear el repositorio | UI y API en un mismo despliegue; Route Handlers para integraciones. |
| Interfaz | Tailwind CSS y componentes pequeños propios; lucide-react para iconos | Evitar construir y mantener un sistema visual grande. |
| Validación | Zod | Validar formularios, peticiones y resultados del agente. |
| Datos y acceso | Supabase PostgreSQL, Auth y @supabase/ssr | Persistencia, usuarios y aislamiento por negocio. |
| Prospección | Firecrawl por REST | Buscar páginas y extraer datos con evidencia de origen. |
| Voz | Vapi + Twilio para outbound; @vapi-ai/web para respaldo navegador | Delegar infraestructura de audio y telefonía. |
| Modelo conversacional | OpenAI GPT‑4.1 mini, `gpt-4.1-mini`, gestionado por Vapi | Conversación en español y llamadas a herramientas. |
| Transcripción | Deepgram Nova‑3, `nova-3`, idioma `es`, gestionado por Vapi | Convertir audio a texto para el agente. |
| Síntesis de voz | Cartesia Sonic‑3.5, `sonic-3.5`, voz de catálogo en español latino, desde Vapi | Generar el audio de respuesta. |
| Pagos | viem y USDC de prueba en Avalanche Fuji, chain ID 43113 | Mostrar una transferencia y su verificación sin construir una blockchain ni un contrato propio. |
| Automatización | Supabase Cron, pg_net y secretos en Vault | Ejecutar seguimientos y reconciliaciones sin depender de una pestaña abierta. |
| Despliegue | Un proyecto Vercel y un proyecto Supabase | Una URL de integración y un entorno de demo. |
| Verificación | Vitest y Playwright | Probar reglas críticas y los recorridos completos. |

Tomi instala las dependencias una sola vez, fija versiones y sube `package-lock.json`. Los demás usan `npm ci`. No instalar diferentes versiones de Next ni actualizar paquetes durante la jornada. Next requiere al menos Node 20.9; usamos Node 24 también para evitar versiones antiguas que Supabase ya dejó de soportar. Referencias: [Next](https://nextjs.org/docs/app/getting-started/installation), [changelog de Supabase](https://supabase.com/changelog), [SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

**Dependencia que hay que verificar primero:** la documentación actual de Vapi indica que sus números gratuitos son para llamadas entrantes. Para llamar hacia afuera se necesita un número importado de un proveedor compatible. Bauti verifica saldo, número y habilitación del destino argentino antes de dedicar tiempo al guion. La voz web será un respaldo identificado como tal, no una llamada telefónica presentada como real. [Vapi phone](https://docs.vapi.ai/quickstart/phone).

## 3. Responsables y límites de edición

Cada persona hace el frontend y backend de su módulo. Leer código ajeno está permitido; editarlo requiere acordarlo con su responsable.

| Persona | Dominio y carpetas | Páginas | API |
|---|---|---|---|
| Vale | `src/features/business/**`, `src/features/discovery/**` | `/business`, `/prospects` | `/api/business/**`, `/api/catalog/**`, `/api/prospects/**`, `/api/suppliers/**` |
| Bauti | `src/features/voice/**` | `/calls`, `/campaigns` | `/api/voice/**` |
| Tomi | `src/features/commerce/**` | `/orders/**`, `/payments/**`, `/pay/[token]` | `/api/commerce/**`, `/api/public/payments/**`, `/api/jobs/tick` |
| Nano | `src/features/crm/**` | `/crm/**`, `/tasks` | `/api/crm/**` |

**Archivos con un único editor:**

- Tomi: `package.json`, lockfile, configuraciones raíz, `.env.example`, `src/proxy.ts`, `src/lib/{auth,env,http}.ts`, `src/lib/supabase/**`, login, healthcheck, `src/fixtures/common.ts`, `src/contracts/common.ts` y despliegue.
- Nano: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/ui/**` y navegación. Deja enlaces a todas las páginas en el primer bloque.
- Cada persona: sus contratos, fixtures, pruebas, páginas y rutas. Vale posee `contracts/business.ts` y `discovery.ts`; Bauti `voice.ts`; Tomi `commerce.ts`; Nano `crm.ts`.
- Tomi coordina y ejecuta las migraciones remotas. Cada autor aporta su cambio; no edita migraciones aplicadas ni ejecuta resets sobre la base compartida.

No crear un `index.ts` común que todos tengan que editar. Importar el contrato o servicio público concreto.

## 4. Estructura y dependencias

```text
src/
  app/                         páginas y Route Handlers por propietario
  components/ui/               componentes compartidos, Nano
  contracts/                   common, business, discovery, crm, voice, commerce
  features/
    business/                  Vale
    discovery/                 Vale
    crm/                       Nano
    voice/                     Bauti
    commerce/                  Tomi
  fixtures/common.ts           IDs y referencias compartidas, Tomi
  lib/                         auth, entorno, HTTP y clientes Supabase, Tomi
supabase/migrations/            cambios coordinados por Tomi
tests/e2e/                     cada autor crea su archivo de escenario
```

Dentro de cada módulo: `components/`, `server/`, `fixtures.ts` y pruebas. Cada dominio expone funciones de servidor mediante `server/public.ts`, marcado como `server-only`. Contratos y DTO no importan clientes de servidor ni secretos.

Dirección de imports: business y crm dependen sólo de componentes comunes; commerce consume business y crm; voice consume business, crm y commerce; discovery consume business y crm. La UI del CRM inicia llamadas o consulta pedidos por HTTP. Esto evita que CRM importe voice y forme un ciclo.

No hacer peticiones HTTP de un módulo del servidor a otro dentro de la misma aplicación. Usar funciones públicas. HTTP queda para navegador, proveedores y scheduler.

## 5. Datos compartidos

Los IDs de entidades internas son UUID; los IDs del proveedor se guardan aparte. Las claves `action_id` y `event_id` son strings estables de idempotencia y pueden derivarse de identificadores externos. Toda tabla de dominio lleva `business_id`, salvo `businesses`, cuyo propio `id` identifica al negocio. Fecha en UTC ISO 8601, columna `timestamptz`; interfaz en `America/Argentina/Buenos_Aires`.

La demo expresa catálogo, límites y pedidos en USDC. `amount_atomic` es una cadena de entero, almacenada como `numeric(78,0)`; cantidades de productos son enteros positivos. Ejemplo: 12,5 USDC son `"12500000"` si el contrato confirma 6 decimales. Se usa BigInt para cálculos y string para JSON. No se convierten ARS a USDC ni se usan floats.

| Dueño | Tablas y restricciones esenciales |
|---|---|
| Tomi, base | `business_members` con `(business_id,user_id)` único; infraestructura de auth. |
| Vale | `businesses`, `products`, `supplier_settings`, `prospect_searches`, `prospect_candidates`. Proveedor vinculado a un contacto; `(business_id,contact_id)` único en su configuración. |
| Nano | `contacts`, `opportunities`, `tasks`, `call_results`, `crm_actions`. Un contacto tiene roles `customer`, `supplier` o ambos. Una oportunidad siempre pertenece a un contacto del mismo negocio. |
| Bauti | `campaigns`, `campaign_targets`, `calls`, `voice_events`, `voice_effects`. `provider_call_id` único por proveedor; evento del proveedor único; `source_task_id` único cuando existe. |
| Tomi, comercio | `orders`, `order_items`, `payments`, `commerce_actions`, `commerce_effects`, `purchase_policies`, `purchase_budget_reservations`. Un pedido `draft` representa también una cotización; no hace falta otra tabla de presupuestos. |

Crear claves foráneas que conserven pertenencia al negocio, índices por `business_id`, contacto, estado y fecha de ejecución. Para teléfonos existentes, deduplicar por teléfono normalizado dentro del negocio; contactos sin teléfono se comparan por otras evidencias, no se fusionan por compartir un valor null.

Tablas expuestas tienen RLS. Las políticas usan membresía real del usuario al negocio, no `user_metadata`. Las mutaciones de usuario validan identidad y membresía; el cliente privilegiado queda reservado a webhooks y jobs autenticados. Las claves secretas nunca llevan prefijo `NEXT_PUBLIC_`. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API keys](https://supabase.com/docs/guides/api/api-keys).

### Estados acordados

| Entidad | Estados |
|---|---|
| Llamada | `queued`, `ringing`, `in_progress`, `completed`, `failed`, `unknown` |
| Oportunidad | `new`, `contacted`, `interested`, `proposal`, `won`, `lost` |
| Tarea | `pending`, `running`, `completed`, `failed`, `cancelled` |
| Pedido | `draft`, `confirmed`, `cancelled` |
| Pago | `pending`, `submitted`, `confirmed`, `failed`, `expired` |

Un pedido confirmado puede tener un pago pendiente. En ventas, una oportunidad se gana al confirmar el pedido, no al pagar. Una llamada finalizada no demuestra que haya respondido una persona. Un estado `unknown` requiere reconciliación, no otro llamado automático a ciegas. Los eventos tardíos no hacen retroceder estados terminales.

## 6. Contratos que todos implementan

Los siguientes son contratos propios del proyecto, no interfaces literales de los proveedores. Sus nombres se congelan a las 9:45. Los argumentos se validan con Zod y los tipos se exportan desde `src/contracts/`.

```ts
type RequestContext = {
  business_id: string;
  actor_type: 'user' | 'voice' | 'system';
  actor_id: string;
};
type ActionContext = RequestContext & { action_id: string };
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
```

El backend establece `RequestContext` desde la sesión o la llamada verificada. El modelo no decide `business_id`, actor, permisos ni precios. `action_id` se conserva al reintentar. Errores: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `POLICY_REJECTED`, `PROVIDER_ERROR`, `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`. HTTP: 400, 404, 403, 409, 422, 502/503 y 429 respectivamente.

| Dueño | Funciones públicas mínimas |
|---|---|
| Vale | `getBusinessContext(ctx)`, `listProducts(ctx,{query?})`, `getProductsByIds(ctx,{product_ids})`, `getSupplierSettings(ctx,{contact_id})`, `searchProspects(ctx,{query,location,limit})`, `importProspects(actionCtx,{candidate_ids})` |
| Nano | `upsertContact(actionCtx,input)`, `getContact(ctx,{contact_id})`, `createOpportunity(actionCtx,input)`, `markOpportunityWon(actionCtx,{opportunity_id,order_id})`, `recordCallResult(actionCtx,event)`, `scheduleFollowup(actionCtx,input)`, `claimDueFollowups(actionCtx,{limit,lease_seconds})`, `completeFollowup(actionCtx,{task_id,call_id,lease_id})`, `failFollowup(actionCtx,{task_id,lease_id,error_code,retry_at?})` |
| Bauti | `startCall(actionCtx,{contact_id,opportunity_id?,mode,objective,source_task_id?})`, `startCampaign(actionCtx,{campaign_id})`, `dispatchDueVoiceJobs(ctx,{limit})`, `processVoiceEffects(ctx,{limit})` |
| Tomi | `createQuote(actionCtx,{contact_id,opportunity_id?,call_id?,direction,items})`, `confirmOrder(actionCtx,{order_id})`, `createPaymentRequest(actionCtx,{order_id})`, `verifyPayment(actionCtx,{payment_id,tx_hash})`, `executeSupplierPayment(actionCtx,{order_id})`, `listContactOrders(ctx,{contact_id})`, `getPurchasePolicy(ctx)`, `updatePurchasePolicy(actionCtx,input)`, `processCommerceJobs(ctx,{limit})` |

`mode` y `direction`: `sale|purchase`. Cada ítem tiene `{product_id,quantity,quoted_unit_amount_atomic?}`. En ventas el servidor calcula precio desde catálogo e ignora precios propuestos por el modelo. En compras, el precio cotizado por proveedor es entrada de una propuesta sujeta a límites. La dirección del pago es `incoming|outgoing`.

Antes de las 9:45 cada propietario publica schemas Zod y fixtures coherentes con los DTO y envoltorios exactos de la sección 14. Si algo falla, devuelve un error tipado; no datos aparentemente exitosos con campos inventados.

### Evento normalizado de llamada

```ts
type CallFinishedV1 = {
  schema_version: '1';
  event_id: string;
  occurred_at: string;
  business_id: string;
  call_id: string;
  contact_id: string;
  opportunity_id: string | null;
  mode: 'sale' | 'purchase';
  technical_status: 'completed' | 'failed';
  answered_by: 'human' | 'voicemail' | 'unknown';
  commercial_outcome: 'interested' | 'not_interested' |
    'callback_requested' | 'order_requested' | 'not_assessed';
  summary: string;
  next_action: null | {
    type: 'prepare_quote' | 'callback' | 'human_review';
    due_at: string | null;
  };
};
```

`callback` exige fecha. Bauti normaliza y entrega el evento; Nano lo persiste y aplica reglas. El resultado no confirma pedidos ni pagos. Una herramienta ejecutada durante la llamada ya tiene su propio efecto idempotente: el resumen final no debe crear el mismo pedido ni callback otra vez. Si ya existe un efecto de callback persistido para esa llamada, aunque esté pendiente, Bauti normaliza `next_action:null` y continúa el efecto original; no deduce otra fecha desde el resumen. Nano también protege la clave lógica llamada de origen + tipo + fecha.

## 7. Automatización y consistencia

**Webhooks:** Bauti autentica el Server URL de Vapi con Custom Credential Bearer y `Authorization: Bearer <VOICE_WEBHOOK_SECRET>` y resuelve el negocio desde `provider_call_id` guardado. Persiste el evento antes de responder éxito. Guarda efectos pendientes en `voice_effects` y los reintenta. Los identificadores externos se normalizan a una clave estable: no generar un UUID nuevo en cada reenvío.

**Acciones:** Nano y Tomi guardan el registro de idempotencia y su modificación de dominio en una misma transacción, mediante funciones de base de datos de alcance específico. Dos operaciones REST consecutivas no son una transacción. Reusar una clave con un payload distinto devuelve `CONFLICT`; reusar la misma devuelve el resultado original.

**Jobs:** Tomi configura Supabase Cron para invocar por HTTP `POST /api/jobs/tick` cada minuto, con secreto almacenado en Vault. La ruta invoca los despachadores públicos de voz y comercio. Cada job reclama filas de forma atómica y usa `locked_until`, `attempts`, límite de lote y reintentos acotados. No mantener una petición HTTP esperando toda una llamada. [Referencia de programación HTTP](https://supabase.com/docs/guides/functions/schedule-functions).

**Seguimientos:** Nano guarda tareas y ofrece claim/complete/fail. Bauti reclama sólo `kind=callback`, inicia la llamada y completa la tarea cuando el proveedor la acepta y se persiste el `call_id`. Esto significa gestión iniciada, no conversación exitosa. Complete/fail reciben el `lease_id` vigente y actualizan condicionalmente; un worker anterior no modifica una tarea reclamada de nuevo. Errores anteriores a cualquier envío pueden reintentar la misma tarea; un envío ambiguo se concilia y no se libera sólo por vencer el lease. Después de un intento realmente despachado, otro intento comercial necesita una nueva tarea y respeta los límites. Nunca marcar una llamada duplicada como imposible sólo porque la base tiene idempotencia.

Configuración inicial: una llamada simultánea por negocio, hasta dos intentos comerciales por contacto, duración máxima de 120 segundos y hasta tres reintentos técnicos de jobs. Pausar campaña impide nuevos inicios; no simula haber cancelado una llamada ya conectada.

## 8. Pagos y compras a proveedores

Tomi fija red Fuji, contrato de USDC desde la documentación oficial, decimales consultados, wallet del negocio y confirmaciones requeridas. La dirección de contrato publicada para Fuji es `0x5425890298aed601595a70AB815c96711a31Bc65`; verificarla antes de configurar. Los fondos de testnet no tienen valor financiero. [Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).

**Cobro:** pedido confirmado → solicitud de pago → `/pay/[token]` → el cliente conecta una wallet y firma la transferencia → backend verifica receipt exitoso, red, contrato, evento Transfer, emisor esperado, receptor, importe y confirmaciones → pago confirmado. La unicidad `(chain_id,tx_hash,log_index)` impide usar el mismo movimiento dos veces. Mostrar un hash no confirma pago.

**Compra automática:** proveedor configurado y permitido → pedido confirmado → validar máximo por pedido y presupuesto diario → reservar presupuesto atómicamente → firmar con wallet pagadora de prueba del negocio, en servidor y restringida a Fuji → persistir hash esperado y operación antes de transmitir → verificar receipt. Reintentar la misma transacción cuando corresponda, no firmar otro envío a ciegas. Si excede límites, conservar pedido y devolver `POLICY_REJECTED` con tarea de revisión. El agente no cambia wallets ni firma. La política vive en `purchase_policies`; las reservas y consumos, en `purchase_budget_reservations`. El día presupuestario comienza a medianoche de `America/Argentina/Buenos_Aires`, no UTC.

La URL pública sólo muestra el mínimo del pedido y permite informar/verificar un pago entrante. No expone contactos completos ni habilita pagos salientes. Sin contrato propio, puente entre redes ni conversión de moneda en esta implementación.

## 9. Fases y entregas obligatorias

La agenda publicada marca build desde las 9 y entrega a las 18; el plan usa ese bloque. [Evento](https://luma.com/cudf7cqz).

| Fase | Vale | Bauti | Tomi | Nano | Prueba de salida |
|---|---|---|---|---|---|
| 09:00–09:45 | Implementar schemas v1 de negocio/búsqueda y acompañar bootstrap | Habilitar cuenta, número y cadena de voz definida | Repo, auth, entorno, base inicial, deploy y contratos comunes v1 | Shell, navegación y schemas CRM v1 | Todos arrancan con `npm ci`; contratos importables y una URL compartida. |
| 09:45–11:00 | Negocio/catálogo y candidatos con fixtures | Inicio de llamada mock y primera llamada real de prueba | Pedido y solicitud de pago mock; probar RPC y fondos | Contactos, historial y evento de ejemplo | Recorrido completo con mocks explícitos; voz y pagos tienen prueba externa temprana. |
| 11:00–13:00 | Firecrawl real e importación | Vapi real, tools y webhook | Cobro testnet y verificación | Pipeline y tareas persistentes | Búsqueda, llamada y transferencia funcionan en el entorno de integración. |
| 13:00–15:00 | Proveedores, reglas y calidad | Campañas, callbacks y modo purchase | Compra y pago automático limitado | Seguimiento automático e historial de compras | Historias de venta, callback y compra completas. |
| 15:00–16:30 | Fuentes faltantes, dedupe y errores | Eventos repetidos, fuera de orden y timeouts | Receipt incorrecto, replay y presupuesto | Transiciones, duplicados y recarga | Pruebas negativas e integración pasan; mocks visibles. |
| 16:30–18:00 | Datos de demo y relato de prospección | Ensayo voz y diagnóstico | Despliegue final y evidencia de transacción | Ensayo navegación y relato CRM | Congelar funciones; dos ensayos y entrega. |

Si un módulo se atrasa, los demás continúan con el mismo contrato y su fixture. El responsable comunica bloqueo, evidencia y próxima comprobación. Cambiar un proveedor sólo cambia su adaptador; no renombra contratos del resto. Bauti tiene la mayor dependencia externa y Tomi concentra infraestructura: Vale acompaña el bootstrap 20 minutos; luego Nano puede tomar una pantalla de comercio mediante reasignación explícita de archivos.

## 10. Git, cambios compartidos y base de datos

1. Tomi crea y mergea `chore/bootstrap`. Todos parten de ese commit. El generador crea layout y páginas iniciales; después del bootstrap su edición se transfiere a Nano según el ownership acordado.
2. Ramas cortas por ticket: `feat/vale-discovery-01`, `feat/bauti-voice-01`, `feat/tomi-commerce-01`, `feat/nano-crm-01`.
3. Una persona no edita archivos propiedad de otra sin aviso y aceptación. Pedir cambios de contrato indicando archivo, campo, motivo y consumidores. El propietario publica un cambio aditivo y avisa al equipo.
4. Cada PR incluye comportamiento, archivos tocados, comprobación y dependencia. Revisiones: Vale ↔ Nano; Bauti ↔ Tomi. Un cambio de contrato lo revisa también su consumidor.
5. `main` debe compilar. Antes de mergear: typecheck, lint, pruebas del dominio y build cuando cambia una integración o configuración. Un solo despliegue compartido para webhooks y Cron; su URL no cambia en cada PR.
6. Cada autor propone cambios de tablas de su dominio. Tomi reserva el turno y crea el archivo con `supabase migration new nombre_del_cambio`, tras consultar `--help`. La migración inicial crea primero negocios/membresías, después contactos/productos y por último referencias de llamadas, pedidos y pagos. Índices, RLS y funciones forman parte del mismo cambio. Las migraciones aplicadas son inmutables.
7. Cada autor edita sólo su seed o fixture. No borrar datos compartidos ni regenerar archivos globales por cuenta propia. Tomi aplica cambios y regenera tipos en un PR controlado.

## 11. Entorno y fixtures

Tomi publica `.env.example` sin valores secretos. Variables mínimas:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
FIRECRAWL_API_KEY=
VAPI_PRIVATE_KEY=
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
VAPI_PHONE_NUMBER_ID=
VAPI_ASSISTANT_SALE_ID=
VAPI_ASSISTANT_PURCHASE_ID=
VAPI_WEBHOOK_CREDENTIAL_ID=
CARTESIA_VOICE_ID=
VOICE_WEBHOOK_SECRET=
JOBS_SECRET=
NEXT_PUBLIC_APP_URL=
AVALANCHE_FUJI_RPC_URL=
PAYMENT_CHAIN_ID=43113
PAYMENT_TOKEN_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
PAYMENT_CONFIRMATIONS=3
BUSINESS_RECEIVER_ADDRESS=
PURCHASE_TEST_PAYER_PRIVATE_KEY=
DISCOVERY_MODE=mock
VOICE_MODE=mock
PAYMENT_MODE=mock
```

Los modos se leen en servidor. La UI consulta capacidades sin secretos y muestra qué módulos están en mock, voz web o live. Los adapters live sin credenciales fallan con error explícito; no cambian silenciosamente a datos ficticios.

Los fixtures comparten estos UUID: negocio `11111111-1111-4111-8111-111111111111`; cliente `22222222-2222-4222-8222-222222222222`; proveedor `33333333-3333-4333-8333-333333333333`; producto `44444444-4444-4444-8444-444444444444`; oportunidad `55555555-5555-4555-8555-555555555555`; llamada `66666666-6666-4666-8666-666666666666`; pedido `77777777-7777-4777-8777-777777777777`. Los teléfonos empiezan null: el equipo carga sus números de prueba expresamente. Fixtures previos de la conversación con `contact_demo` no son el contrato definitivo.

## 12. Criterio final de terminado

- [ ] Se configura negocio, catálogo, proveedores y reglas.
- [ ] Una búsqueda real conserva fuentes y permite importar sin duplicar contactos.
- [ ] Una llamada telefónica real de prueba consulta información del negocio y ejecuta una herramienta; cualquier respaldo web está rotulado.
- [ ] El resultado actualiza el contacto correcto y distingue humano, buzón y fallo técnico.
- [ ] Una campaña respeta pausa, concurrencia y límites; un seguimiento se ejecuta sin navegador abierto.
- [ ] Una venta genera pedido, enlace y transferencia confirmada en testnet.
- [ ] Una compra consulta proveedor, valida límites y ejecuta un pago de prueba permitido.
- [ ] Un evento o tool call repetido no duplica tareas, pedidos ni pagos.
- [ ] Una transacción incorrecta o reutilizada se rechaza; los límites de compra se aplican también con solicitudes concurrentes.
- [ ] Ningún usuario de otro negocio accede por cambiar un ID; webhooks y jobs rechazan autenticación incorrecta.
- [ ] Loading, vacío, error y éxito funcionan; recargar conserva datos.
- [ ] Dos ensayos completos, URL final y declaración clara de cualquier integración pendiente.

## 13. Fuentes técnicas de implementación

- [Firecrawl Search](https://docs.firecrawl.dev/features/search): Vale implementa búsqueda y extracción; un resultado no garantiza teléfono.
- [Vapi Server Events](https://docs.vapi.ai/server-url/events) y [Web SDK](https://docs.vapi.ai/quickstart/web): Bauti adapta mensajes y herramientas al contrato propio.
- [Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses) y [viem](https://viem.sh/docs/getting-started): Tomi verifica red, token y transferencias.
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [Cron HTTP](https://supabase.com/docs/guides/functions/schedule-functions): implementación de acceso y automatización.

Los modelos quedan fijados en este brief; al inicio se habilitan las cuentas, créditos, permisos y credenciales correspondientes. Este plan no presupone créditos de sponsors ni disponibilidad de una API específica de Twin.


## 14. DTO y respuestas exactas para comenzar en paralelo

Estos son los mínimos canónicos del contrato v1. Campos extra se agregan sin renombrar los existentes; cada propietario publica schemas y fixtures compatibles. Las referencias opcionales y datos ausentes de salida usan null. Las respuestas son `Result<T>`; la tabla de abajo define `data`, no otra envoltura adicional.

| DTO | Campos mínimos |
|---|---|
| `BusinessDTO` | `id`, `name`, `description`, `target_sector`, `service_area`, `sales_instructions`, `purchase_instructions`. |
| `ProductDTO` | `id`, `business_id`, `name`, `description`, `unit_amount_atomic`, `available`, `stock_quantity: number|null`. |
| `SupplierSettingsDTO` | `contact_id`, `enabled`, `wallet_address`, `max_unit_amount_atomic: string|null`. La wallet es receptora y configurada por usuario autorizado. |
| `ContactDTO` | `id`, `business_id`, `name`, `company_name`, `phone_e164`, `email`, `website`, `roles: ('customer'|'supplier')[]`, `source_url`, `do_not_contact`, `created_at`. No existe el literal both: ambos roles van en el array. |
| `OpportunityDTO` | `id`, `business_id`, `contact_id`, `title`, `stage`, `created_at`, `updated_at`. |
| `TaskDTO` | `id`, `business_id`, `contact_id`, `opportunity_id`, `source_call_id`, `kind`, `description`, `due_at`, `status`, `attempts`, `locked_until`, `lease_id`, `result_call_id`. |
| `CallDTO` | `id`, `business_id`, `contact_id`, `opportunity_id`, `provider_call_id`, `mode`, `transport: phone|web|mock`, `status`, `source_task_id`, `created_at`. |
| `OrderDTO` | `id`, `business_id`, `contact_id`, `opportunity_id`, `direction`, `status`, `items`, `total_amount_atomic`, `created_at`. Cada ítem: `product_id`, `name`, `quantity`, `unit_amount_atomic`, `subtotal_amount_atomic`. |
| `PaymentDTO` | `id`, `order_id`, `direction`, `status`, `chain_id`, `token_address`, `decimals`, `amount_atomic`, `recipient_address`, `tx_hash`, `created_at`. Ningún DTO contiene claves privadas. |
| `PurchasePolicyDTO` | `auto_purchase_enabled`, `max_order_amount_atomic`, `daily_budget_amount_atomic`, `allowed_supplier_contact_ids`, `budget_timezone: America/Argentina/Buenos_Aires`. |

| Operación | Valor de `data` |
|---|---|
| `getBusinessContext` | `{business: BusinessDTO}` |
| `listProducts` / `getProductsByIds` | `{products: ProductDTO[]}` |
| `getSupplierSettings` | `{supplier: SupplierSettingsDTO}` |
| `searchProspects` | `{search_id,candidates: ProspectCandidateDTO[]}`; candidato: `id,name,company_name,phone_e164,source_url,evidence,fit_signals`, con null si corresponde. |
| `importProspects` | `{imported,existing,failed,contact_ids:string[],errors:{candidate_id,code}[]}`; imported/existing/failed son cantidades. |
| `upsertContact` / `getContact` | `{contact: ContactDTO,created:boolean}` / `{contact: ContactDTO}` |
| `createOpportunity` / `markOpportunityWon` | `{opportunity: OpportunityDTO}` |
| `recordCallResult` | `{event_id,duplicate:boolean,opportunity: OpportunityDTO|null,tasks: TaskDTO[]}` |
| `scheduleFollowup` / `completeFollowup` / `failFollowup` | `{task: TaskDTO}` |
| `claimDueFollowups` | `{tasks: TaskDTO[]}`; cada tarea reclamada recibe un lease_id nuevo. |
| `startCall` | `{call: CallDTO}` |
| `startCampaign` | `{campaign_id,status: running}` |
| `createQuote` / `confirmOrder` | `{order: OrderDTO}` |
| `createPaymentRequest` | `{payment: PaymentDTO,payment_url:string}` |
| `verifyPayment` / `executeSupplierPayment` | `{payment: PaymentDTO}`; puede seguir pending o submitted. |
| `listContactOrders` | `{orders: OrderDTO[],payments: PaymentDTO[]}` |
| `getPurchasePolicy` / `updatePurchasePolicy` | `{policy: PurchasePolicyDTO}` |
| Despachadores y procesadores de jobs | `{processed:number,pending:number,failed:number}` |

`upsertContact` recibe los campos editables de ContactDTO sin IDs ni timestamps. `createOpportunity` recibe `{contact_id,title,source_call_id?}`. `scheduleFollowup` recibe `{contact_id,opportunity_id?,source_call_id?,kind,description,due_at}`. Las consultas de listas HTTP de contactos, oportunidades, tareas y llamadas devuelven `{items,next_cursor}` en data, con límite inicial 50. La consulta de comercio por contacto usa la respuesta específica de `listContactOrders`.

Rutas canónicas: `POST /api/voice/calls` inicia llamada; `POST /api/voice/webhooks/vapi` es el único ingreso de eventos Vapi. Bauti crea o resuelve una oportunidad sale antes de llamar si no se indicó una; purchase permite oportunidad null. Una llamada web también debe estar ligada por el servidor a una operación autorizada; no ejecutar herramientas privilegiadas para sesiones creadas con una clave pública sin esa vinculación.

Tomi publica `GET/PATCH /api/commerce/purchase-policy`; la pantalla de Vale la consume por HTTP. Sólo un usuario autorizado cambia límites. El negocio tiene una wallet pagadora de compras cuyo secreto es `PURCHASE_TEST_PAYER_PRIVATE_KEY`; no es la clave privada del proveedor. El proveedor únicamente aporta su dirección receptora configurada.

Tomi confirma el pedido sale y registra un efecto durable hacia `markOpportunityWon`. Nano valida pertenencia y aplica la transición idempotente. Un fallo del CRM no deshace ni repite el pedido; se reintenta el efecto con la misma clave.

Semántica final de tareas: completar o fallar exige el lease_id actual; las mutaciones comparan lease y estado en la base. Un envío externo ambiguo queda bloqueado para conciliación aunque expire el lease. Una nueva llamada comercial después de un intento aceptado usa otra tarea. La misma tarea conserva un único source_task_id en calls.


## 15. Decisiones operativas definitivas

Esta versión es la base de implementación. El primer bloque de la jornada es de ejecución de setup y contratos, no de elección del stack. Si una cuenta rechaza una operación, su responsable registra el error, resuelve el acceso y mantiene el contrato; no cambia silenciosamente de proveedor ni presenta un mock como integración terminada.

### Producto, interfaz y datos de la demo

Nombre del repositorio y de la aplicación: `hackatwin`. Negocio de ejemplo: **Sur Insumos**, distribuidora ficticia para cafeterías de Palermo, Buenos Aires. Idioma español; zona horaria argentina. Catálogo y pedidos en USDC. Las tres historias de demo son venta, callback y compra. Los teléfonos de los contactos se cargan con números controlados por el equipo.

| Producto del seed | Unidad | Precio de venta | Stock conocido de ejemplo |
|---|---|---|---|
| Vasos | Pack de 50 | 2,50 USDC = `2500000` | 30 packs |
| Tapas | Pack de 50 | 1,50 USDC = `1500000` | 50 packs |
| Servilletas | Pack de 100 | 1,00 USDC = `1000000` | 100 packs |

El UUID de producto compartido corresponde a Vasos. Tomi genera y publica los otros dos UUID en fixtures. Venta de ensayo: 2 packs de Vasos, total 5 USDC. Compra de ensayo: 10 packs de Vasos a 1 USDC por pack, total 10 USDC. El máximo de compra por unidad del proveedor de prueba es 1,50 USDC. Son datos ficticios explícitos y no representan precios de mercado. Stock es información comercial de ejemplo: un pago al proveedor no demuestra recepción física ni aumenta stock automáticamente.

UI con Tailwind y componentes propios de Nano, sin librería global de estado. Usar fetch y refresco de datos: llamadas cada 3 segundos mientras están activas, pago cada 5 segundos durante un máximo de 2 minutos y después botón de actualización. El servidor y Cron mantienen la verdad aunque se cierre la pestaña. Wallet del checkout: MetaMask mediante proveedor EIP‑1193 y viem; firma el usuario pagador.

### Configuración fija de proveedores

- Firecrawl REST v2: buscar páginas y después scrapear un máximo de 5 URLs por búsqueda con formato estructurado y schema. Límite predeterminado y máximo de resultados: 5. Concurrencia de scrape: 2. Timeout externo: 20 segundos por operación; un fallo conserva el resultado parcial y su error. País AR e idioma es cuando el endpoint los admita.
- Vapi: dos asistentes guardados, sale y purchase. Ambos usan OpenAI `gpt-4.1-mini`, temperatura 0,2, Deepgram `nova-3` con idioma `es` y Cartesia `sonic-3.5`. Bauti copia un voice ID de español latino del catálogo a `CARTESIA_VOICE_ID`; es un identificador de configuración, no una nueva elección de proveedor. Se usan las integraciones administradas de Vapi; no se construyen clientes de audio propios ni se requieren claves separadas de esos modelos en la app.
- Voz: 1 llamada simultánea por negocio, 120 segundos máximos, 2 intentos comerciales por contacto. Ventana de campañas de prueba 09:00–21:00 argentina y sólo contactos habilitados por el dueño. Las campañas reales mantienen una ventana configurable. Timeout de creación de llamada: 10 segundos; resultado ambiguo se reconcilia.
- Herramientas de voz: presupuesto de respuesta 5 segundos. Una operación que aún no terminó devuelve referencia pendiente y continúa por efecto durable; nunca inventa éxito. No entrenar un modelo ni agregar embeddings: hechos del negocio desde PostgreSQL, instrucciones en el asistente y acciones mediante tools.
- Jobs: tick cada minuto; lote de hasta 5 tareas/efectos por procesador; lease de 90 segundos con lease_id; máximo 3 reintentos técnicos con backoff de 60, 120 y 240 segundos. Concurrencia externa de llamadas sigue siendo 1 aunque el lote sea 5. No hay reintento ciego de estados ambiguos.
- Pagos: Avalanche Fuji 43113, USDC del contrato fijado, 3 confirmaciones. Verificar por lecturas cortas y jobs; no dejar una función HTTP esperando minutos. Transferencias entrantes firmadas en MetaMask; salientes firmadas por la wallet pagadora de prueba del negocio en servidor.

Referencias de la configuración de voz: [OpenAI en Vapi](https://docs.vapi.ai/providers/model/openai), [Deepgram](https://docs.vapi.ai/providers/transcriber/deepgram), [Cartesia](https://docs.vapi.ai/providers/voice/cartesia).

### Autenticación Vapi definida

Bauti crea en Vapi una Custom Credential tipo Bearer Token, header Authorization y prefijo Bearer habilitado, usando el mismo valor que `VOICE_WEBHOOK_SECRET` en servidor. Guarda el ID en `VAPI_WEBHOOK_CREDENTIAL_ID` y vincula `server.credentialId` y la URL estática `/api/voice/webhooks/vapi` a los asistentes y herramientas guardados. La ruta valida el header antes de procesar. No sobrescribir Server URL desde la petición de creación de llamada: Vapi documenta diferencias en el adjunto de credenciales para URLs suministradas dinámicamente. [Autenticación oficial](https://docs.vapi.ai/server-url/server-authentication).

### Política de compras inicial

En el negocio de demo: `auto_purchase_enabled=true`, `max_order_amount_atomic="25000000"`, `daily_budget_amount_atomic="100000000"`, `allowed_supplier_contact_ids=["33333333-3333-4333-8333-333333333333"]`, `budget_timezone="America/Argentina/Buenos_Aires"`. La habilitación sólo permite enviar desde la wallet de prueba y en Fuji. Un negocio nuevo comienza con compras automáticas deshabilitadas hasta configurar proveedor, límites y fondos. Son valores de demo y el usuario autorizado puede modificarlos después desde la API de políticas.

### Campañas y tipos adicionales

Campaña: `draft|running|paused|completed|failed`. Destino: `pending|dispatching|dispatched|failed|skipped`. Una campaña se considera completada al resolver sus destinos, no al cobrar ventas. Cada destino mantiene su call_id y la razón de error o descarte.

`POST /api/voice/campaigns` recibe `{name:string,mode:'sale'|'purchase',objective:string,contact_ids:string[]}` con entre 1 y 20 IDs únicos; devuelve `data:{campaign:CampaignDTO}`. `POST /api/voice/campaigns/[campaignId]/start` y `/pause` gestionan ejecución. `CampaignDTO` contiene `{id,business_id,name,mode,objective,status,contact_ids,created_at}`. Start devuelve `{campaign_id,status:'running'}` y pause `{campaign_id,status:'paused'}`.

`ProspectCandidateDTO`: `id:string`, `name:string`, `company_name:string|null`, `phone_e164:string|null`, `source_url:string`, `evidence:string|null`, `fit_signals:FitSignal[]`. `FitSignal` tiene `{criterion:'sector'|'location'|'product_fit',verdict:'match'|'mismatch'|'unknown',evidence:string|null}`. Debe haber una entrada para cada criterio; no se transforma en probabilidad de venta.

Tipos comunes: IDs, fechas, direcciones y hashes como strings; flags como boolean; cantidades de producto y contadores como number entero; dinero como string entero. Product.available es boolean, Product.stock_quantity es entero no negativo o null, Payment.chain_id y decimals son enteros. RequestContext nunca se toma directamente de los argumentos generados por el modelo.

### Primeros 15 minutos y orden de ejecución

Tomi crea repositorio, instala el stack y publica el commit base con contratos y exports mínimos. Vale prepara negocio, catálogo y schemas de Firecrawl mientras acompaña el bootstrap. Bauti crea y configura los dos asistentes y el número Twilio. Nano prepara DTO de CRM, fixtures y las tres pantallas del módulo. Una vez publicado el base, los cuatro usan npm ci y sus ramas. A las 09:45 los contratos ya compilan; a las 11:00 debe funcionar el recorrido completo con adaptadores de prueba identificados.

No queda pendiente decidir framework, base de datos, telefonía, modelo, red de pago ni reparto. Las tareas pendientes son implementación, carga de secretos, habilitación de las cuentas y comprobaciones reales de cada integración.


## 16. Posicionamiento y evidencia para el jurado

### Qué aporta la diapositiva del evento

La fotografía suministrada por el equipo identifica cuatro especialidades: Blockchain, Fintech, AI y Stablecoins. Incluye funciones de tecnología, producto, operaciones, finanzas, negocio y asesoría legal. Las prioridades de esta sección se infieren de esas especialidades; no son una rúbrica oficial ni una afirmación sobre preferencias personales. La publicación pública del evento presenta tracks AI, Blockchain y Fintech; la composición del jurado no acredita que haya cambiado la modalidad de inscripción. [Evento](https://luma.com/cudf7cqz).

### Posicionamiento que usa el equipo

**Propuesta:** un asistente comercial y operativo para distribuidoras B2B que conecta búsqueda de clientes, llamadas, pedidos, cobros y reposición a proveedores, con acciones verificables y límites de gasto.

**Frase de apertura:** “Una distribuidora tiene que conseguir clientes, tomar pedidos, volver a llamar y comprobar pagos. Nuestro asistente conecta esas tareas y deja cada operación registrada, desde la primera conversación hasta el cobro y la reposición”.

La demostración conserva todos los módulos del brief. La prioridad del relato es que una conversación produzca una operación válida y rastreable. El buscador es la entrada del flujo; el pago y el historial prueban el resultado. El modo proveedor completa el ciclo operativo.

### Nicho, comprador y usuario

Primer nicho: distribuidoras pequeñas de insumos recurrentes para cafeterías, restaurantes y comercios. Comprador del software: dueño o responsable comercial/operativo. Usuario diario: vendedor o encargado. Los negocios contactados son clientes de la distribuidora, no necesariamente compradores de nuestro software.

El encaje propuesto es una hipótesis: catálogo repetible, venta por contacto directo, seguimientos y reposición recurrente pueden hacer útil automatizar el recorrido. No se afirma que el segmento ya haya validado el producto.

Para la parte onchain, priorizar pilotos con distribuidoras cuyos clientes o proveedores ya acepten stablecoins o manifiesten una necesidad concreta de liquidación digital. Si el negocio opera exclusivamente en pesos y sus contrapartes no usan stablecoins, el beneficio del componente cripto sigue por validar. La aplicación no incluye hoy conversión a pesos ni una solución completa de entrada y salida.

Fintechs y wallets son posibles canales de distribución posteriores. Twin representa una posible infraestructura de liquidación; esto no equivale a tener una alianza o integración. Ese camino se evalúa después de validar que el software resuelve el trabajo del distribuidor.

### Qué demostrar ante cada especialidad

| Perspectiva profesional | Pregunta que debemos poder responder | Evidencia en el mismo recorrido |
|---|---|---|
| AI y tecnología | ¿La IA ejecuta trabajo útil y se mantiene dentro de reglas? | Consulta catálogo vigente, maneja una objeción, llama una herramienta, confirma cantidades y conserva un error o rechazo real sin inventar éxito. |
| Fintech, producto y operaciones | ¿Quién paga por esto y qué operación le simplifica? | Un dueño ve pedido, importe, próxima acción y pago conciliados. La venta acordada, la promesa de pago y el cobro confirmado se distinguen. |
| Blockchain e infraestructura | ¿Por qué registrar este movimiento en cadena y cómo lo verifican? | Transferencia en Fuji, enlace al explorador y backend que valida red, token, importe, receptor y unicidad. Repetir el movimiento no paga otro pedido. Contactos y conversaciones permanecen fuera de cadena. |
| Stablecoins, finanzas y negocio | ¿Existe una necesidad de liquidación y un circuito operativo? | Mostrar ingreso del cliente y pago al proveedor en la misma unidad, quién firma, quién paga gas y cómo se limita el presupuesto. Explicar cuándo esa moneda sirve al usuario. |

La capacidad del producto se demuestra con evidencia ejecutada. No basta declarar “tenemos IA y blockchain”, ni llamar venta real al ensayo con un contacto del equipo.

### Encaje con Twin y moneda de liquidación

Twin describe su infraestructura como stablecoins locales para pagos y liquidación; también explica el papel de una moneda como ARGt en operaciones denominadas en pesos. Esa información da contexto para una futura integración, no demuestra acceso de este equipo a una API o token de prueba específico. [Twin y sus FAQs](https://www.twin.finance/).

Decisión de esta jornada: conservar USDC de prueba en Avalanche Fuji y mostrar exactamente esa integración. No sustituir el contrato por un token de otra red ni rotular el pago como Twin, ARGt, Tether o Belo. La parametrización existente de chain_id, token_address y decimals deja una frontera técnica para nuevos activos; cada uno requiere verificar red, despliegue, liquidez, acceso, moneda de cotización y experiencia de pago. No se promete que cambiar un address resuelva esos aspectos.

Para un negocio que cotiza en pesos, la evolución a estudiar es cotización y liquidación acordes con esa unidad de cuenta, por ejemplo mediante una stablecoin local cuando la integración esté disponible. Para operaciones ya denominadas en dólares y con contrapartes que acepten stablecoins, evaluar USDC u otro activo apropiado. No agregar rendimiento, crédito, inversión o token propio para conectar con el jurado: no forman parte del problema demostrado.

### Demo y pitch de hasta dos minutos

El límite de 120 segundos incluye exposición, audio y demostración. El texto completo está en [Objetivos, alcances y pitch](05_OBJETIVOS_ALCANCES_Y_PITCH.md). Una persona presenta y otra opera la pantalla; el ensayo apunta a terminar a los 110 segundos.

| Tiempo máximo | Qué mostramos | Qué queda probado |
|---|---|---|
| 00:00–00:15 | Problema de Sur Insumos y tareas desconectadas. | Comprador y necesidad concretos. |
| 00:15–00:30 | Solución, catálogo y reglas. | Contexto del negocio para el agente. |
| 00:30–00:55 | Contacto, fragmento de conversación de hasta 10 segundos y pedido. | Fuente, consulta y acción comercial vinculadas. |
| 00:55–01:20 | Solicitud de cobro y evidencia de pago de prueba. | Pedido y transferencia verificada. |
| 01:20–01:40 | Reposición y política de compra. | Proveedor permitido y límite aplicado. |
| 01:40–01:50 | Historial, propuesta comercial y próximo piloto. | Trazabilidad e hipótesis a validar. |
| 01:50–02:00 | Margen de transición; exposición terminada. | Respeto del límite total. |

No depender de completar una llamada o de esperar confirmaciones de red en vivo. Una ejecución previa o grabación se identifica y conserva su evidencia real; mocks y fondos testnet quedan rotulados. El callback automático y las pruebas negativas siguen desarrollados, con detalle para preguntas si las hay. Mostrar sólo funciones comprobadas; no simular éxito cuando un estado siga pendiente.

### Evidencia y economía del servicio

La implementación añade evidencia al historial existente, no otro dashboard. Vincular negocio, candidato, contacto, llamada, oportunidad, pedido y pago con IDs. Conservar inicio y fin de la llamada, transporte, herramienta, resultado, timestamps de confirmación y referencia de transacción. Cuando el dato no está disponible, mostrar “no medido”.

Registrar coste observado de telefonía/voz/modelo y búsqueda desde facturas o reportes del proveedor; evitar sumar dos veces cargos incluidos en Vapi. El gas se expresa en su unidad y con el pagador identificado; no convertirlo a USDC usando un tipo de cambio inventado.

Modelo comercial a validar: suscripción por negocio más consumo de llamadas/búsquedas, con límites visibles. La venta y el cobro de mercadería pertenecen al distribuidor; son volumen operado, no ingresos de nuestra plataforma.

Coste variable del servicio = telefonía + voz/modelo no duplicados + búsquedas/extracción + infraestructura variable + gas que efectivamente asuma la plataforma. Para comparar margen, todos los términos deben estar en la misma moneda mediante datos documentados; si falta esa conversión se muestran separados. Margen de contribución = ingreso de nuestro servicio menos esos costes variables. Un presupuesto de compra de 25 USDC es una regla de demo, no precio del software.

Para medir ahorro de tiempo, comparar la misma tarea manual y asistida en un piloto. Para medir resultado comercial, distinguir conversaciones útiles, pedidos confirmados y cobros. Más llamadas o más volumen procesado no demuestran ventas incrementales, margen positivo ni retorno de inversión por sí solos.

### Validación y expansión por etapas

1. Primera validación propuesta: entrevistas con cinco distribuidores para comprobar frecuencia, proceso actual, coste operativo, responsables y disposición a probar; registrar también si las contrapartes aceptan stablecoins.
2. Piloto controlado propuesto: uno o dos negocios, catálogo y contactos autorizados, comparar tiempo, errores, siguientes acciones y coste por gestión. Son objetivos de validación, no clientes ya conseguidos.
3. Si hay uso repetido y beneficio medido: ampliar a otros distribuidores con el mismo trabajo operativo y probar precio de suscripción/consumo.
4. Después de validar el segmento: evaluar canal con fintechs o wallets e integración de liquidación local que el caso requiera. La adopción, ingresos, tamaño de mercado y ahorro siguen sin estimaciones demostradas; no presentar porcentajes o proyecciones de crecimiento sin evidencia.

### Tickets de adaptación y prioridad

| Responsable | Ticket adicional | Criterio de aceptación |
|---|---|---|
| Vale | VA-J01: perfil de uso de stablecoins y señales de encaje. | Campo opcional stablecoin_usage con already_uses/interested/not_used/unknown, predeterminado unknown; mostrar quién compra el software y fuente del prospecto. No inferir adopción cripto de un teléfono o rubro. |
| Bauti | BAU-J01: evidencia de conversación y herramientas. | Registrar timestamps, transporte, llamada-herramienta-pedido y motivo de rechazo. Ensayar una objeción y una acción válida. |
| Tomi | TOM-J01: evidencia de liquidación y política. | Exponer hash, red, token, importe, dirección incoming/outgoing y receptor; enlazar explorador configurado. Mostrar compra permitida y otra rechazada por límite. |
| Nano | NAN-J01: recorrido unificado en el detalle existente. | El usuario puede seguir contacto → llamada → pedido → pago → próxima acción, con hora, actor y estado real. No crea un dashboard adicional. |

Los campos de evidencia son adiciones compatibles y reutilizan registros ya previstos; no cambian las funciones públicas v1 ni los propietarios. Primero completar los recorridos funcionales, después estas mejoras de presentación. No demorar la primera llamada o el primer pago para pulir el relato.

### Respuestas breves para defender el proyecto

- ¿Por qué otra herramienta de IA? “Nos enfocamos en el trabajo comercial del distribuidor: la conversación consulta datos y termina en seguimiento, pedido o pago registrado. Esa integración es lo que mostramos; la diferenciación comercial se valida con pilotos”.
- ¿Por qué stablecoins si existe transferencia bancaria? “Para contrapartes que ya operan así, conectamos la liquidación con el pedido y sus reglas. No afirmamos que todos los comercios las necesiten ni que reemplacen cualquier medio de pago”.
- ¿Por qué USDC y no ARGt o USDT? “La demo implementa USDC de prueba en Fuji. Otra moneda requiere validar red, disponibilidad y unidad de cuenta; no fingimos una integración con Twin o Tether”.
- ¿Qué evita que la IA gaste mal? “El backend valida proveedor, importe, wallet y presupuesto; reserva el gasto y confirma el resultado. El modelo no firma ni altera la política”.
- ¿Quién paga y cuánto ganan? “El comprador es la distribuidora; probaremos suscripción más consumo. Todavía no presentamos un precio validado, clientes pagadores ni margen medido”.
- ¿Funciona para comercios que sólo usan pesos? “Las funciones comerciales pueden ser útiles; el tramo de liquidación local necesita una integración adicional. La demo actual no incluye conversión ni retiro a pesos”.

