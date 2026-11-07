# Voz (Bautista)

Llamadas del agente: iniciar, recibir el resultado de Vapi, normalizarlo y entregarlo al CRM. Alcance y reglas en [`docs/BRIEF.md`](../../../docs/BRIEF.md), secciones 7 a 10.

## Qué publica

- `src/contracts/voice.ts`: `CallDTO`, `StartCallInput`, `DispatchDueCallsInput`, sus payloads y `CallResultV1` (reexportado desde `crm.ts`).
- `src/features/voice/server/public.ts` (solo servidor):
  - `startCall(actionCtx, { contact_id, deal_id?, objective?, source_task_id? })` → `Result<{ call: CallDTO }>`
  - `dispatchDueCalls(ctx, { limit })` → `Result<{ processed, pending, failed }>`; lo llama el cron (`/api/jobs/tick`).
- `src/features/voice/fixtures.ts`: un `CallResultV1` de ejemplo por caso (interesado, pide que lo llamen, quiere comprar, no le interesa, no contactar, buzón, fallo técnico) y un `CallDTO`. Son datos ficticios para desarrollar sin telefonía.

## Modos

| `VOICE_MODE` | Qué hace |
|---|---|
| `mock` (por defecto) | `startCall` devuelve una llamada `queued` con `transport: "mock"`, sin llamar a nadie ni guardar nada. El mismo `action_id` devuelve siempre el mismo `call.id`. |
| `live` | Todavía no implementado: devuelve `PROVIDER_UNAVAILABLE` de forma explícita (llega con VOZ-04 y VOZ-09). |

## Reglas que garantiza Voz

- `company_id`, actor y `action_id` llegan en el contexto del servidor, nunca en el input.
- `NormalizedCallResultV1Schema`: sin conversación con una persona (buzón, desconocido o fallo técnico) el resultado es `not_assessed`, sin score, sin calificación y sin pedido de no contacto.

## Pantallas y API (TRA-49)

- `/calls`: lista de llamadas de la empresa activa con estado, cliente potencial, próximo llamado y modo.
- `/calls/[id]`: resultado, grabación, transcripción y datos técnicos.
- `GET /api/voice/calls?contact_id=&cursor=&limit=` → `Result<{ items, next_cursor }>` (máx. 50 por página). Es lo que usa el CRM para el historial de un contacto.
- `POST /api/voice/calls` con header `Idempotency-Key` (una clave nueva por clic) y cuerpo `StartCallInput` → `Result<{ call }>`, HTTP 202.
- En `mock` las pantallas muestran llamadas de ejemplo rotuladas como "Datos de prueba"; en `live` leen la tabla `calls` con la sesión del usuario (RLS). Resultado, grabación y transcripción aparecen cuando VOZ-07 guarde el reporte procesado.

## Análisis de fin de llamada (TRA-47)

`server/call-analysis.ts` convierte el `end-of-call-report` de Vapi en un `CallResultV1` normalizado.

- **Qué extrae Vapi:** `callAnalysisJsonSchema` y `callAnalysisPrompt`. Configurarlo como *structured output* con el nombre `tratunex_call_result` (recomendado por Vapi) o en el `analysisPlan` (deprecado, sigue funcionando). El normalizador lee los dos lugares.
- **Qué decide el código, no el modelo:**
  - Quién atendió, según `endedReason`: `voicemail` → buzón; `customer-did-not-answer` o `customer-busy` → nadie; errores de Twilio, SIP o pipeline → `failed`. En esos casos el resultado es siempre `not_assessed`.
  - La fecha del callback: el modelo copia lo que dijo la persona (día y hora) y `resolveCallbackDueAt` calcula la fecha en hora de Argentina (UTC-3). Sin hora se agenda a las 10:00; sin día, con una fecha pasada o con una fecha inválida, va a `human_review`.
  - `wants_to_buy` → `human_review` para que una persona cierre. Sin análisis usable → `human_review`.
  - Empresa, contacto y llamada salen de la llamada guardada (`KnownCall`), nunca del aviso.

## Cotizador por teléfono (QUO-01)

`server/quote-call.ts` define el asistente que llama al proveedor en nombre de la pyme. La guía para cargarlo en Vapi, con los textos para pegar y el guion de prueba, está en [`vapi/cotizador.md`](vapi/cotizador.md).

- **Qué pide:** si puede entregar, precio por unidad (moneda e IVA), stock, plazo, envío, compra mínima y si acepta cobrar en ARGt.
- **Qué no hace:** no confirma la compra, no dice el presupuesto (no lo conoce) y no pide billetera, CBU ni alias por teléfono. La billetera la carga una persona en el CRM (BRIEF §7).
- **Qué extrae Vapi:** el structured output `tratunex_supplier_quote` (`quoteExtractionJsonSchema`). `extractQuoteFromReport` lo lee del `end-of-call-report`: sin cotización devuelve `extraction: null`; un dato opcional mal formado se descarta y un dato obligatorio faltante es `VALIDATION_ERROR`.
- `quoteAssistantPrompt(brief)` y `quoteAssistantFirstMessage(brief)` reciben los datos de la compra; QUO-03 los manda a Vapi al iniciar la llamada desde la app.

## Contrato compartido con el CRM

`CallResultV1Schema` y `NextActionSchema` vienen de `src/contracts/crm.ts` (Nano); `voice.ts` los reexporta y agrega `NormalizedCallResultV1Schema`.

## Pruebas

```bash
npm test -- voice
```

La lógica vive en `server/calls.ts`, sin dependencias de Next, para poder probarla con Vitest; `public.ts` solo agrega `server-only` y lee `VOICE_MODE`.
