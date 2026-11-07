# Plan de desarrollo de Nano

**Brief final de implementación · Contrato técnico v1.0 · Brief v1.2 · Equipo: Vale, Bauti, Tomi y Nano.**

Nano desarrolla CRM y seguimiento: contactos, oportunidades, historial de llamadas y próximas acciones. Tu módulo permite que el dueño entienda qué hizo el agente, quién está interesado y qué debe ocurrir después. Incluye interfaz, API, persistencia y reglas de negocio. Leer primero [00_GENERAL.md](00_GENERAL.md); sus contratos y estados son la referencia común.

## 1. Tu entrega y tus archivos

La entrega tiene tres pantallas principales: `/crm` para oportunidades y contactos, `/crm/[contactId]` para el detalle e historial y `/tasks` para seguimientos. Además preparás el shell de navegación común. La UI muestra pedidos y pagos de Tomi e inicia llamadas de Bauti, pero tu servidor no modifica sus tablas.

Podés editar:

```text
src/features/crm/**
src/app/crm/**
src/app/tasks/**
src/app/api/crm/**
src/contracts/crm.ts
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
src/components/ui/**
tests/e2e/nano-crm.spec.ts
```

No editar `package.json`, lockfile, configuración global, clientes de base, contratos ajenos ni páginas de los demás. Si necesitás una dependencia, pedí a Tomi que la agregue. Si un compañero necesita un componente compartido, te lo solicita o acordás que cree un archivo nuevo sin tocar los existentes.

Tu dominio usa Next.js, TypeScript, Tailwind, Zod y Supabase desde helpers preparados por Tomi. Las páginas de servidor consultan datos del usuario; componentes cliente manejan filtros y formularios. Nunca importes el cliente privilegiado en un componente del navegador.

## 2. Arranque sin esperar a las integraciones

1. Leer contratos de negocio, CRM, voz y comercio junto con el general.
2. Tras el commit `chore/bootstrap`, crear `feat/nano-crm-01`, ejecutar `npm ci` y copiar el entorno de ejemplo a `.env.local` con los valores acordados por un canal privado.
3. Confirmar `npm run dev`, login y acceso al negocio de prueba.
4. Publicar tipos, schemas y fixtures de CRM. Crear primero `server/public.ts` con las firmas v1 definidas y respuestas mock explícitas, y sustituirlas por persistencia durante la mañana.
5. Entregar navegación y página inicial con enlaces a `/business`, `/prospects`, `/calls`, `/campaigns`, `/crm`, `/tasks`, `/orders` y `/payments`. Los demás ya pueden desarrollar sus páginas.

Usá los UUID del general en tus fixtures. No usar `contact_demo` en columnas UUID ni inventar teléfonos. Prepará tres resultados normalizados: interés, callback con fecha y fallo técnico. Son datos de prueba visibles; después Bauti enviará el mismo contrato desde la integración real.

## 3. Modelo que te corresponde

| Entidad | Campos mínimos y reglas |
|---|---|
| Contacto | `id`, `business_id`, nombre, empresa, teléfono E.164 opcional, email, sitio, fuente, `roles` customer/supplier o ambos y `do_not_contact`. |
| Oportunidad | `id`, `business_id`, `contact_id`, etapa, notas y timestamps. Un contacto puede tener varias; el tablero representa oportunidades, no un único estado permanente del contacto. |
| Tarea | `id`, negocio, contacto, oportunidad opcional, `source_call_id` opcional, `kind: callback|manual`, acción, `due_at`, estado, intentos, lease, llamada resultante y error. |
| Resultado de llamada | Evento normalizado, IDs vinculados, resumen, resultado técnico y comercial. Unicidad por negocio y event ID. |
| Acción idempotente | Clave de acción, hash de entrada y resultado persistido junto al cambio que ejecutó. |

Pedidos y pagos pertenecen a Tomi. Tus vistas reciben sus DTO y referencias; no crean una segunda versión del estado financiero.

Reglas: validar que cada referencia pertenezca al mismo negocio; conservar la fuente al importar; no fusionar contactos sólo por nombre o teléfono null. Un prospecto importado no desactiva un `do_not_contact` previo. La búsqueda y el cálculo de compatibilidad pertenecen a Vale; tu CRM muestra esos datos sin convertirlos en interés comercial confirmado.

Para oportunidades, `new → contacted → interested → proposal → won/lost` es el recorrido habitual. Los movimientos manuales válidos se registran; eventos tardíos no reabren una oportunidad ganada o perdida. Una llamada fallida no mueve a lost. Sólo una conversación humana confirmada justifica marcar contacto efectivo. Purchase puede tener `opportunity_id=null` y seguir apareciendo en el historial del proveedor.

## 4. Servicios y API que publicás

En `src/features/crm/server/public.ts`, marcado `server-only`:

```ts
upsertContact(actionCtx, input)
getContact(ctx, { contact_id })
createOpportunity(actionCtx, input)
markOpportunityWon(actionCtx, { opportunity_id, order_id })
recordCallResult(actionCtx, event)
scheduleFollowup(actionCtx, input)
claimDueFollowups(actionCtx, { limit, lease_seconds })
completeFollowup(actionCtx, { task_id, call_id, lease_id })
failFollowup(actionCtx, { task_id, lease_id, error_code, retry_at? })
```

Usar `Result<T>`, `RequestContext` y `ActionContext` del general. El contexto lo establece el servidor desde auth o una llamada verificada; no confiar en un business ID enviado desde el navegador o generado por la IA.

Publicá en `contracts/crm.ts` los DTO de contacto, oportunidad y tarea, los schemas y tipos de entrada. `upsertContact` devuelve contacto e indicador `created`; `recordCallResult` devuelve resultado guardado, etapa resultante si existe y tareas creadas; `claimDueFollowups` devuelve tareas reclamadas y su lease. `scheduleFollowup` recibe contacto, oportunidad opcional, llamada de origen opcional, fecha UTC y tipo de acción.

Para ventas confirmadas, implementá el contrato definitivo `markOpportunityWon(actionCtx,{opportunity_id,order_id})` consumido por Tomi. Hace el cambio comercial idempotente después de que Tomi confirma el pedido. No depende de que el pago esté confirmado.

| Endpoint de tu módulo | Función |
|---|---|
| `GET/POST /api/crm/contacts` | Listar con filtros y crear contactos. |
| `GET/PATCH /api/crm/contacts/[contactId]` | Detalle y edición validada. |
| `GET/POST /api/crm/opportunities` | Listar y crear oportunidades. |
| `PATCH /api/crm/opportunities/[opportunityId]/stage` | Transición de etapa con validación. |
| `GET/POST /api/crm/tasks` | Listar y crear próximas acciones. |
| `PATCH /api/crm/tasks/[taskId]` | Completar o cancelar tareas manuales con reglas. |

El webhook real vive en el módulo de Bauti; él llama a tus funciones públicas en servidor. No crear otro webhook abierto de voz. Los ejemplos se ejecutan desde pruebas o una acción demo autenticada habilitada sólo en mock. Nunca exponer claim/complete de jobs a usuarios públicos.

## 5. Tickets por fase y criterios de aceptación

### Fase 1 de 09:00 a 09:45

**NAN-01 Shell y contratos.** Crear estructura, navegación, contratos y fixtures. Aceptación: cada módulo tiene su enlace, los compañeros importan tus tipos y hay ejemplos de Contact, Opportunity, Task y CallFinishedV1 válidos con Zod.

### Fase 2 de 09:45 a 11:00

**NAN-02 Contactos persistentes.** Listar, crear, consultar y editar. Aceptación: recargar conserva cambios; Vale puede importar dos veces el mismo prospecto sin crear dos contactos; otro negocio no puede acceder cambiando el ID.

**NAN-03 Detalle e historial.** Mostrar identificación, fuente, roles, llamadas y próximas acciones. Incluir botón de llamada que invoca `/api/voice/calls` y área de pedidos por `/api/commerce/orders?contact_id=...`. Aceptación: funcionan con adaptadores del equipo, sin escribir en sus tablas ni importar sus componentes internos.

### Fase 3 de 11:00 a 13:00

**NAN-04 Procesar resultados.** Validar CallFinishedV1 y asociaciones. Guardar evento, transición y tarea en una transacción de dominio, mediante una función de base de datos específica. La idempotencia necesita una clave única, no un `if` en memoria.

Aceptación: repetir el evento deja un historial y una tarea. `failed + not_assessed` no pierde una oportunidad; buzón o unknown no se presenta como conversación humana. Un evento viejo no pisa estados terminales.

**NAN-05 Pipeline.** Mostrar oportunidades por etapa, filtros y movimiento validado. Para empezar, un selector de etapa permite comprobar la lógica; arrastrar tarjetas sólo se agrega si el comportamiento central ya funciona. Aceptación: una oportunidad está en una sola etapa, pertenece al contacto correcto y persiste al recargar.

### Fase 4 de 13:00 a 15:00

**NAN-06 Seguimiento persistente.** Crear tarea con fecha/hora, lista de pendientes y completadas, cancelación y acciones manuales. Convertir hora argentina a UTC y mostrar zona en pantalla. Una próxima acción sin fecha clara requiere revisión; no inventar “el viernes” sin resolver qué fecha pidió el contacto.

Para callbacks, `claimDueFollowups` reclama sólo tareas callback vencidas: cambia `pending→running`, incrementa intentos y asigna lease atómicamente. Bauti inicia la llamada; `completeFollowup` marca completada cuando hay aceptación del proveedor y call ID persistido. Eso significa intento iniciado, no venta ni respuesta humana. Un timeout ambiguo queda para conciliación; no liberar un nuevo intento antes de resolverlo.

Si el agente ya usó `scheduleFollowup` durante la conversación, el reporte final no debe crear otra tarea. Deduplicar también por clave lógica de llamada de origen, tipo y fecha, además del action ID. Una nueva tentativa comercial tiene su propia tarea y respeta la política de intentos de Bauti.

Aceptación: el scheduler ejecuta una tarea sin pestaña abierta; dos ticks no reclaman la misma; una tarea manual no se convierte en llamada automática; un usuario puede cancelar una tarea aún no reclamada.

**NAN-07 Ventas y proveedores.** Mostrar órdenes y pagos de Tomi y permitir que una venta confirmada pase a won por el contrato acordado. Aceptación: contacto proveedor muestra compra y pago saliente; contacto cliente muestra venta y cobro; nunca inferir paid desde el resumen del agente.

### Fase 5 de 15:00 a 16:30

**NAN-08 Robustez y UX.** Loading, vacío, error, reintento, campos inválidos y botón deshabilitado durante envío. Conservar resultado confirmado por servidor cuando una petición se repite. Mostrar fecha, fuente y modo mock/live. Aceptación: fallo de la voz no deja la UI esperando eternamente ni genera otra llamada automáticamente al recargar.

### Fase 6 de 16:30 a 18:00

**NAN-09 Ensayo.** Recorrer venta, callback y compra con el equipo. Preparar demo de “qué pasó y qué sigue”, usando el historial como evidencia. Congelar componentes compartidos y ayudar a Tomi con una pantalla sólo si se reasigna explícitamente un archivo.

## 6. Pruebas y conceptos para defender decisiones

Pruebas significativas con Vitest y base de integración: evento duplicado, action ID con payload distinto, callback duplicado por tool y reporte, fallo vs rechazo, evento fuera de orden, dos claims concurrentes, cancelación vs claim y pertenencia al negocio. Playwright: crear contacto, mover oportunidad, ver historial y tarea, recargar y comprobar persistencia. Una prueba de base es necesaria para demostrar atomicidad; un mock de JavaScript no la demuestra.

Conceptos útiles para explicar tu diseño:

- **Contacto:** persona o negocio con el que nos relacionamos. **Oportunidad:** una venta concreta; un contacto puede tener varias.
- **Pipeline:** etapas comerciales. **Historial:** hechos y gestiones ya registrados. **Tarea:** acción pendiente con responsable y fecha.
- **API:** entrada de navegador o sistema externo. **Servicio público de dominio:** función interna que otros módulos consumen.
- **Webhook:** aviso del proveedor. **Idempotencia:** repetir el mismo mensaje no repite sus efectos.
- **Transacción:** guardar el resultado y sus modificaciones juntos o no guardar ninguno. **Lease:** reserva temporal de una tarea para que no la ejecuten dos workers.

Frases para conversar con el equipo: “Pasame el resultado de éxito y el de error”; “No voy a mezclar estado comercial con pago”; “Necesito que el mismo evento conserve su ID cuando se reenvía”; “Una tarea reclamada no puede iniciarse otra vez sólo porque el proveedor tarda”.

## 7. Prompt para tu asistente de programación

```text
Soy Nano. Lee 00_GENERAL.md y 04_NANO.md. Mi responsabilidad es CRM y
seguimiento. Trabajemos por ticket en mis carpetas; no edites voz, negocio,
comercio, package.json ni clientes globales. Usa los contratos comunes y
funciones públicas. Empezá por contratos, fixtures y navegación, después
contactos e historial. Cada mutación valida negocio e identidad. No mezcles
oportunidades, pedidos y pagos. Procesamiento idempotente y claim de tareas
requieren transacciones reales. Mientras faltan integraciones, usa fixtures
rotulados sin cambiar el DTO. Explicame las decisiones y verificá cada ticket
con una prueba que demuestre su comportamiento, antes de pasar al siguiente.
```


## Precisiones finales del contrato

La sección 14 del general fija los campos y envoltorios exactos de ContactDTO, OpportunityDTO y TaskDTO, y las respuestas de tus funciones. Usar roles como array de customer/supplier; no crear el literal both. markOpportunityWon devuelve `data:{opportunity:OpportunityDTO}` y se ejecuta mediante efecto durable después de confirmar una venta.

Cada claim entrega lease_id nuevo; complete/fail comparan atómicamente lease y estado. Un worker antiguo devuelve CONFLICT, no modifica una tarea recién reclamada. Un envío ambiguo no se libera sólo por expirar el lease. Error comprobado antes de enviar admite retry de la misma tarea; después de un intento aceptado, otro intento comercial tiene una nueva tarea.

Para evitar callback doble con fechas distintas entre tool y reporte, Bauti envía next_action null si ya hay un efecto persistido de callback para esa llamada. Tu deduplicación por origen/tipo/fecha queda como segunda protección. Probá ambas capas; no corregir sólo la coincidencia exacta de timestamps.


## Configuración final para tu implementación

El stack y el reparto quedan cerrados en sección 15 del general. Tu primera tarea es crear schemas Zod y fixtures v1 del CRM, navegación y las pantallas indicadas, sin esperar una reunión de elección técnica. Sur Insumos es el negocio de demo y Vasos es el producto con UUID compartido. UI con Tailwind, fetch y componentes propios; no agregar una librería global de estado ni Realtime. El historial refresca llamadas cada 3 s mientras estén activas y pagos cada 5 s hasta 2 minutos; después muestra actualización manual.

Cron funciona cada minuto; claim usa lote máximo 5 y lease de 90 s. Mantener lease_id y las reglas ya definidas; cerrar la pestaña no detiene jobs. Los modelos de Bauti están fijados y vos consumís CallFinishedV1 sin depender de sus payloads de proveedor. A las 09:45 deben importar tus schemas; a las 11:00 debe verse el recorrido completo con fixtures identificados.


## Adaptación al nicho y al jurado

Leer sección 16 del general. NAN-J01 usa el detalle de contacto existente para mostrar el recorrido completo: fuente del prospecto, conversación, pedido, cobro/pago y próxima acción. Cada registro tiene hora, actor, IDs asociados y resultado real. Añadir un resumen pequeño con pedido y siguiente acción, sin abrir un dashboard nuevo.

El relato para fintech es que el dueño entiende qué está acordado, qué tiene pendiente y qué fondos están confirmados. Diferenciar humano/buzón, interés/pedido, promesa/cobro y testnet/dinero real. Mostrar los motivos de revisión o rechazo para que el control del negocio se entienda.

El dato opcional stablecoin_usage de Vale puede aparecer como información de perfil, predeterminado unknown; no altera los contratos de llamadas. Para preguntas del jurado, recorrer un callback y un intento de compra rechazado. No mostrar estimaciones de ahorro o ingresos como resultados medidos.


## Límite de presentación

La exposición total dura como máximo 120 segundos, incluyendo cualquier audio o demo. Leer [Objetivos, alcances y pitch](05_OBJETIVOS_ALCANCES_Y_PITCH.md). Los módulos completos se mantienen; el pitch muestra evidencia breve del recorrido y reserva el detalle técnico para preguntas si las hay.
