# Bauti — Agente de voz, campañas y ejecución de llamadas

**Brief final de implementación · Contrato técnico v1.0 · Brief v1.2 · Equipo: Vale, Bauti, Tomi y Nano.**

Leé primero `00_GENERAL.md`. Este archivo define tu trabajo dentro del alcance completo: encontrar clientes, conversar, registrar resultados, vender, cobrar y gestionar compras a proveedores. Es un plan para implementar; las integraciones todavía no están configuradas.

## 1. Tu entrega y tus límites

Sos responsable de convertir un contacto y un objetivo en una conversación que consulte información real y ejecute acciones válidas. Entregás las pantallas `/calls` y `/campaigns`, llamadas telefónicas, voz web de respaldo, campañas y despacho de seguimientos.

**Podés modificar:**

- `src/features/voice/**`.
- `src/app/calls/**`, `src/app/campaigns/**` y `src/app/api/voice/**`.
- `src/contracts/voice.ts` y fixtures de voz propios.
- Tablas `voice_events`, `voice_effects`, `campaigns`, `campaign_targets` y `calls`, mediante migraciones nuevas de tu módulo.

**No modificás** tablas ni carpetas de Vale, Nano o Tomi. Importás otros dominios exclusivamente desde su `server/public.ts` y los contratos correspondientes. Nada de un `index.ts` compartido que todos deban editar. Tomi aplica las migraciones remotas; coordiná los cambios de esquema con él. Pedile también cualquier dependencia, variable de entorno o cambio de configuración raíz.

Usás Node 24, Next.js App Router, TypeScript estricto, Zod y Supabase con la infraestructura común. Vapi administra la conversación; `@vapi-ai/web` habilita audio en navegador. No construyas un servidor propio de audio ni mantengas conexiones de telefonía dentro de una petición Next.js.

## 2. Arranque después del PR base

Actualizá `main`, creá `feat/bauti-voice`, ejecutá `npm ci` y copiá la plantilla de entorno del repositorio a `.env.local`. Recibí las credenciales por el canal del equipo; no las subas a Git. Arrancá con `npm run dev` y `VOICE_MODE=mock`, visible en la interfaz.

Importá los UUID compartidos de `src/fixtures/common.ts`, mantenido por Tomi. No inventes IDs como `contact_demo`. Los IDs externos de Vapi van en `provider_call_id`, separados del UUID interno `call_id`. Confirmá que login y contexto de negocio funcionen antes de llamar servicios.

## 3. Contratos que implementás y consumís

Publicá estas funciones en `src/features/voice/server/public.ts`:

```ts
startCall(actionCtx, {
  contact_id, opportunity_id?, mode, objective, source_task_id?
}) // mode: "sale" | "purchase"
startCampaign(actionCtx, { campaign_id })
dispatchDueVoiceJobs(ctx, { limit })
processVoiceEffects(ctx, { limit })
```

Todas devuelven `Result<T>`. El backend construye `RequestContext {business_id, actor_type, actor_id}`; las mutaciones reciben además un `action_id` estable. El modelo jamás determina ese contexto. Validá entradas con Zod y utilizá los códigos de error comunes.

Dependés de estas funciones existentes o de sus fixtures acordados:

- Vale: `getBusinessContext`, `listProducts`, `getProductsByIds`, `getSupplierSettings`.
- Nano: `getContact`, `createOpportunity`, `recordCallResult`, `scheduleFollowup`, `claimDueFollowups`, `completeFollowup`, `failFollowup`.
- Tomi: `createQuote`, `confirmOrder`, `createPaymentRequest`, `executeSupplierPayment`.

Antes de ejecutar una llamada, consultá el contacto, su pertenencia al negocio y `do_not_contact`. Prepará contexto y herramientas a partir del negocio autenticado. Tus consultas y efectos no deben escribir directamente en tablas ajenas.

El resultado normalizado es **exactamente `CallFinishedV1`**, no el payload literal de Vapi:

```ts
{
  schema_version: "1", event_id, occurred_at,
  business_id, call_id, contact_id,
  opportunity_id: null, mode: "sale",
  technical_status: "completed", answered_by: "human",
  commercial_outcome: "interested", summary,
  next_action: { type: "prepare_quote", due_at: null }
}
```

`technical_status`: `completed|failed`. `answered_by`: `human|voicemail|unknown`. `commercial_outcome`: `interested|not_interested|callback_requested|order_requested|not_assessed`. `next_action` admite `null` o `prepare_quote|callback|human_review`; `callback` necesita `due_at` válido. Fechas ISO UTC; la UI muestra `America/Argentina/Buenos_Aires`.

## 4. Fase 1 — 09:00 a 09:45: contrato y primer esqueleto

- **BAU-01:** implementar DTO v1, resultados y herramientas definidos en el general. Publicar firmas y fixtures con los UUID comunes.
- **BAU-02:** crear lista y detalle de llamadas, formulario de objetivo y selección explícita `sale|purchase`. Mostrar modo de integración y estado técnico.
- **BAU-03:** implementar `POST /api/voice/calls` para iniciar llamadas y el ingreso de eventos Vapi en `/api/voice/webhooks/vapi`. Las acciones de usuario necesitan sesión; los eventos externos usan autenticación del proveedor.

**Aceptación:** Nano puede consumir tu evento de ejemplo y Tomi sabe qué funciones vas a invocar, sin esperar telefonía. La UI puede iniciar y listar una llamada ficticia persistida.

## 5. Fase 2 — 09:45 a 11:00: recorrido integrado y prueba real

- **BAU-04:** implementar `startCall`: validar, persistir `queued`, iniciar el intento y devolver `call_id`. No esperar a que termine toda la conversación.
- **BAU-05:** conectar un resultado mock a `recordCallResult`; comprobar historial y próxima acción con Nano.
- **BAU-06:** probar pronto la ruta real de voz. Para outbound necesitás **un número Twilio importado en Vapi**; los números gratuitos Vapi no resuelven este caso outbound. Verificá permisos y disponibilidad para el destino argentino y usá un número de prueba del equipo.

Si telefonía queda bloqueada, activá audio navegador como transporte explícito y rotulá **“Voz web — sin llamada telefónica”**. Sigue utilizando el agente y sus herramientas. No lo presentes como outbound real. `VOICE_MODE=live` identifica integración real; el transporte web debe quedar igualmente visible.

**Aceptación:** el recorrido contacto → llamada → resultado → CRM funciona y conocen el estado concreto de la prueba telefónica, sin esconder restricciones de cuenta.

## 6. Fase 3 — 11:00 a 13:00: agente y eventos confiables

- **BAU-07:** configurar el agente en español, instrucciones comerciales y herramientas. Se presenta como asistente virtual, escucha interrupciones, hace preguntas breves y confirma cantidades. Usa catálogo y condiciones consultados; no inventa precios, stock ni descuentos.
- **BAU-08:** mapear herramientas a funciones públicas. Una intención de compra permite preparar `createQuote`; `confirmOrder` requiere aceptación explícita. `createPaymentRequest` ofrece la solicitud, no confirma el pago. Devolvé al agente el resultado real o un error claro.
- **BAU-09:** implementar la autenticación Bearer definida en sección 15: Custom Credential y server.credentialId en asistentes y herramientas guardados, comprobando Authorization: Bearer contra VOICE_WEBHOOK_SECRET. Tomi configura ese mismo secreto en el despliegue. No inventes una firma HMAC ni confíes solo en un `business_id` enviado en JSON.
- **BAU-10:** resolver `provider_call_id` contra la llamada interna guardada. De allí salen negocio, contacto y permisos. Si un evento llega antes de terminar el mapeo, conservá el evento verificado pendiente de conciliación; no ejecutes herramientas con identidad inferida del texto del modelo.

Guardá eventos y efectos durables antes de confirmar su recepción. Normalizá el reporte final y comprobá `answered_by`; un buzón no cuenta como interés comercial. En `calls` existen también `queued|ringing|in_progress|unknown`; `unknown` se conserva hasta reconciliar, sin fabricar un resultado final fallido.

**Aceptación:** una conversación consulta datos, solicita una acción real y aparece en el CRM correcto. Eventos inválidos o sin autenticación no producen efectos.

## 7. Fase 4 — 13:00 a 15:00: campañas, seguimientos y compras

- **BAU-11:** campañas con contactos explícitos, objetivo, estado y progreso por destino. Despacho con concurrencia 1 y hasta dos intentos comerciales por contacto y hasta tres reintentos técnicos de jobs, según la política. `startCampaign` no realiza una espera larga por todos los contactos.
- **BAU-12:** conectar `dispatchDueVoiceJobs` al tick mantenido por Tomi. Reclamar tareas vencidas con `claimDueFollowups` mediante lease atómico. Supabase Cron llama el dispatcher cada minuto; no uses `setTimeout` ni requieras una pestaña abierta.
- **BAU-13:** propagar `source_task_id` y evitar más de una llamada para la misma tarea. Completar el callback solo cuando el proveedor acepta y queda persistido `call_id`. Esto significa intento despachado, no conversación exitosa. Una política de reintento crea otra tarea; no reabre ciegamente la anterior.
- **BAU-14:** implementar `mode: "purchase"`: consultar `getSupplierSettings`, confirmar disponibilidad, cantidad y precio, y crear un pedido `direction: "purchase"`. Tomi valida precio, proveedor, presupuesto y wallet antes de `executeSupplierPayment`. El agente no firma ni cambia el destinatario.

El catálogo y la demo usan USDC; importes atómicos como cadenas y cantidades enteras positivas. No conviertas precios con `float` ni prometas otra moneda. Toda solicitud de compra respeta la política guardada.

**Aceptación:** funcionan campaña de ventas, callback vencido y compra a proveedor con las mismas garantías de identidad y trazabilidad.

## 8. Fase 5 — 15:00 a 16:30: duplicados, timeouts y pruebas

En `voice_events`, deduplicá por identificador estable del evento proveedor. En `voice_effects`, persistí acción, destino, intentos, estado y clave estable. Cada efecto llama al dominio destino con el mismo `action_id` en todos sus reintentos. No marques un efecto como terminado antes de persistir el resultado.

Para herramientas que necesitan respuesta inmediata, ejecutá el primer intento con timeout acotado; si no termina, devolvé una referencia pendiente y nunca un pedido ficticio confirmado. El outbox continúa el trabajo. Verificá el formato de respuesta de herramientas que espera Vapi.

Si crear una llamada devuelve timeout, el proveedor puede haberla aceptado. Conservá estado ambiguo y consultá al proveedor antes de repetir. No prometas “exactamente una llamada” ante ese fallo. Reconciliá también llamadas sin evento final y preservá errores no recuperables para revisión.

**Pruebas Vitest:** evento duplicado; herramienta repetida; negocio ajeno; buzón; compra fuera de política; callback sin fecha; timeout ambiguo; lease vencido; evento final fuera de orden. **Playwright:** iniciar mock, comprobar historial y tarea, alternar modo visible y mostrar error recuperable. No hagas llamadas reales en CI.

## 9. Fase 6 — 16:30 a 18:00: estabilización

Congelá contratos, corré los checks acordados y ensayá ventas y compras contra la misma aplicación. Verificá micrófono, permisos, contacto de prueba, número outbound, autenticación de eventos y scheduler. Dejá visibles integración y transporte usados. Entregá a Nano y Tomi ejemplos reales normalizados y las limitaciones pendientes.

## Prompt para tu asistente de programación

> Leé `00_GENERAL.md` y `02_BAUTI.md`. Implementá un ticket por vez. Solo modificá mis rutas, contratos y `src/features/voice/**`; solicitá al dueño cambios externos. Respetá `RequestContext`, `ActionContext`, `Result<T>`, UUID y `CallFinishedV1`. Consumí otros módulos solo por `server/public.ts`. No escribas en tablas ajenas ni inventes precios, eventos de pago o autenticación Vapi. Persistí eventos y efectos idempotentes. Probá el caso de fallo relevante y describí cualquier dependencia pendiente. No publiques secretos ni afirmes que una integración mock es real.

## Documentación oficial

- [Llamadas y números de Vapi](https://docs.vapi.ai/quickstart/phone).
- [Configuración outbound](https://docs.vapi.ai/quickstart/phone).
- [Voz web](https://docs.vapi.ai/quickstart/web).
- [Server URL](https://docs.vapi.ai/server-url).
- [Eventos del servidor](https://docs.vapi.ai/server-url/events).


## Precisiones finales del contrato

La sección 14 del general fija DTO y envoltorios exactos: startCall devuelve `data:{call:CallDTO}`, incluyendo ID, estado y transporte. Antes de una llamada sale resolvé o creá la oportunidad con Nano; en purchase puede ser null. Las llamadas web necesitan vinculación de servidor a una operación autorizada antes de habilitar herramientas: una clave pública no concede permisos de compra.

Si una herramienta ya dejó un efecto de callback persistido, el evento final lleva `next_action:null`, aunque ese efecto siga pendiente. Reintentá el mismo efecto, no una segunda fecha inferida del resumen. Comprobar el caso de tool y reporte con horarios ligeramente diferentes.

Al reclamar tareas recibís `lease_id`; pasalo a `completeFollowup(actionCtx,{task_id,call_id,lease_id})` y `failFollowup(actionCtx,{task_id,lease_id,error_code,retry_at?})`. Un worker con lease antiguo no modifica el trabajo nuevo. Error previo a envío admite retry de la misma tarea; envío ambiguo exige conciliación incluso tras vencer el lease; después de un intento aceptado, otro intento comercial crea otra tarea.


## Configuración final para tu implementación

Usar gpt-4.1-mini con temperatura 0,2; Deepgram nova-3/es; Cartesia sonic-3.5 y voice ID de español latino, todo mediante Vapi. Dos asistentes guardados: sale y purchase. Implementar el CRUD y estados de campaña de sección 15 del general. Máximo 20 contactos seleccionados, concurrencia 1, 2 intentos comerciales, 120 s por llamada y hasta 3 reintentos técnicos.

Credencial Bearer y URL estática se guardan en los asistentes/tools; no enviar una Server URL dinámica al crear llamadas. Las claves se configuran, no se elige otro mecanismo de autenticación. Scheduler: minuto, lote 5 y lease 90 s. Las verificaciones de acceso y la elección de un ID de voz del catálogo son tareas de configuración del stack fijado.


## Adaptación al nicho y al jurado

Leer sección 16 del general. La demo tiene que probar trabajo comercial útil: consulta catálogo, maneja una objeción y ejecuta una acción validada. El modo purchase muestra que el mismo motor sirve al trabajo de reposición sin dar al modelo permisos de firma.

BAU-J01 registra inicio/fin de la llamada, transporte, herramientas y resultados, enlazados a contact_id, call_id y order_id. Un error o POLICY_REJECTED queda visible. Si el proveedor no ofrece un coste, marcar no medido; no inferir ahorro ni coste cero. No duplicar cargos de modelo y voz ya incluidos en Vapi.

Ensayar una venta de dos packs de Vasos y la objeción de cambiar precio o wallet. No inventar una venta real: es una conversación de prueba con el equipo. El callback sigue desarrollado y sirve como evidencia complementaria; las grabaciones y el transporte web se identifican. Mantener contratos, stack y límites del brief.


## Límite de presentación

La exposición total dura como máximo 120 segundos, incluyendo cualquier audio o demo. Leer [Objetivos, alcances y pitch](05_OBJETIVOS_ALCANCES_Y_PITCH.md). Los módulos completos se mantienen; el pitch muestra evidencia breve del recorrido y reserva el detalle técnico para preguntas si las hay.
