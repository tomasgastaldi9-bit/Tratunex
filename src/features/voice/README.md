# Voz (Bautista)

Llamadas del agente: iniciar, recibir el resultado de Vapi, normalizarlo y entregarlo al CRM. Alcance y reglas en [`docs/BRIEF.md`](../../../docs/BRIEF.md), secciones 7 a 10.

## Qué publica

- `src/contracts/voice.ts`: `CallDTO`, `StartCallInput`, `DispatchDueCallsInput`, sus payloads y `CallResultV1`.
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

## Pendiente de coordinación

`CallResultV1Schema` es un espejo temporal del que publica Nano en `src/contracts/crm.ts` (TRA-53). Cuando llegue a `main`, Voz lo importa desde ahí y borra su copia.

## Pruebas

```bash
npm test -- voice
```

La lógica vive en `server/calls.ts`, sin dependencias de Next, para poder probarla con Vitest; `public.ts` solo agrega `server-only` y lee `VOICE_MODE`.
