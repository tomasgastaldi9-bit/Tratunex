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

## Análisis de fin de llamada (TRA-47)

`server/call-analysis.ts` convierte el `end-of-call-report` de Vapi en un `CallResultV1` normalizado.

- **Qué extrae Vapi:** `callAnalysisJsonSchema` y `callAnalysisPrompt`. Configurarlo como *structured output* con el nombre `tratunex_call_result` (recomendado por Vapi) o en el `analysisPlan` (deprecado, sigue funcionando). El normalizador lee los dos lugares.
- **Qué decide el código, no el modelo:**
  - Quién atendió, según `endedReason`: `voicemail` → buzón; `customer-did-not-answer` o `customer-busy` → nadie; errores de Twilio, SIP o pipeline → `failed`. En esos casos el resultado es siempre `not_assessed`.
  - La fecha del callback: el modelo copia lo que dijo la persona (día y hora) y `resolveCallbackDueAt` calcula la fecha en hora de Argentina (UTC-3). Sin hora se agenda a las 10:00; sin día, con una fecha pasada o con una fecha inválida, va a `human_review`.
  - `wants_to_buy` → `human_review` para que una persona cierre. Sin análisis usable → `human_review`.
  - Empresa, contacto y llamada salen de la llamada guardada (`KnownCall`), nunca del aviso.

## Contrato compartido con el CRM

`CallResultV1Schema` y `NextActionSchema` vienen de `src/contracts/crm.ts` (Nano); `voice.ts` los reexporta y agrega `NormalizedCallResultV1Schema`.

## Pruebas

```bash
npm test -- voice
```

La lógica vive en `server/calls.ts`, sin dependencias de Next, para poder probarla con Vitest; `public.ts` solo agrega `server-only` y lee `VOICE_MODE`.
