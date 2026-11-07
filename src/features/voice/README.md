# Voz (Bautista)

Llamadas del agente: iniciar, recibir el resultado de Vapi, normalizarlo y entregarlo al CRM. Alcance y reglas en [`docs/BRIEF.md`](../../../docs/BRIEF.md), secciones 7 a 10.

## Qué publica

- `src/contracts/voice.ts`: `CallDTO`, `StartCallInput`, `DispatchDueCallsInput`, sus payloads y `CallResultV1` (reexportado desde `crm.ts`).
- `src/features/voice/server/public.ts` (solo servidor):
  - `startCall(actionCtx, { contact_id, deal_id?, objective?, source_task_id? })` → `Result<{ call: CallDTO }>`
  - `dispatchDueCalls(ctx, { limit })` → `Result<{ processed, pending, failed }>`; lo llama el cron (`/api/jobs/tick`).
  - `listCalls(ctx, { contact_id?, cursor?, limit? })` y `getCall(ctx, { call_id })`: llamadas para pantallas e historial del CRM.
  - `processVoiceEvents({ limit })` → `Result<{ processed, pending, failed }>`: procesa reportes pendientes de todas las empresas; para el webhook y el cron.
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

## Del reporte al CRM (TRA-48)

Cada `end-of-call-report` guardado por el webhook se procesa una sola vez (`server/process-reports.ts`):

1. Se reserva el aviso por 60 segundos, así dos procesos no lo trabajan a la vez.
2. Se resuelve su llamada por `provider_call_id`. Si todavía no existe, queda pendiente sin contar intento.
3. Se analiza con `normalizeEndOfCallReport` y se guarda en `calls`: estado, `ended_at`, `ended_reason`, grabación, transcripción y `result` (el `CallResultV1`).
4. Se entrega a `recordCallResult` del CRM con `action_id = voice:record-call-result:<provider_event_id>`: un reintento nunca registra dos resultados.
5. Se marca procesado. Si algo falla, suma un intento y guarda el motivo en `last_error`; después de 5 intentos deja de reintentarse.

Lo dispara el webhook apenas guarda el reporte, y `processVoiceEvents({ limit })` sirve para que el cron reintente los pendientes.

## Puesta en marcha (Supabase, Vercel y Vapi)

Sin esto el webhook responde 503 y nada se procesa. Las claves se pasan por un canal privado; **nunca** van al repo ni a un chat.

### 1. Supabase (quien administra el proyecto compartido)

1. Aplicar las migraciones de `supabase/migrations`, en orden: `supabase link --project-ref <ref>` y después `supabase db push`, o correr cada archivo en el SQL Editor.
2. En **Project Settings → API Keys** copiar la URL, la clave publicable y la **clave secreta** (`SUPABASE_SECRET_KEY`).

### 2. Secreto del webhook

Generar un valor largo y aleatorio para `VOICE_WEBHOOK_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 3. Vercel (proyecto `tratunex-mvp`)

En **Settings → Environment Variables**, para Production y Preview:

| Variable | De dónde sale |
|---|---|
| `SUPABASE_SECRET_KEY` | Paso 1 |
| `VOICE_WEBHOOK_SECRET` | Paso 2 |
| `VAPI_PRIVATE_KEY`, `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Vapi, sección de API keys de la organización |
| `VAPI_PHONE_NUMBER_ID` | Vapi → Phone Numbers → el número de Twilio importado → su ID |
| `VAPI_ASSISTANT_ID` | Vapi → Assistants → el asistente → su ID |
| `VAPI_WEBHOOK_CREDENTIAL_ID` | Paso 4.1 |
| `VOICE_MODE` | `mock` hasta que esté VOZ-04; después `live` |

Después, **Redeploy** del último deployment para que tome las variables.

### 4. Vapi

1. **Credencial del webhook:** crear una credencial personalizada (Custom Credential) de tipo **Bearer Token**, header `Authorization`, prefijo `Bearer` activado y como token el `VOICE_WEBHOOK_SECRET`. Copiar su ID a `VAPI_WEBHOOK_CREDENTIAL_ID`.
2. **Server URL del asistente:** `https://<dominio-del-deploy>/api/voice/webhooks/vapi`, con la credencial del paso anterior. En los mensajes al servidor dejar activos al menos `end-of-call-report`, `status-update` y `hang`.
3. **Análisis:** crear un *structured output* llamado `tratunex_call_result`, de tipo AI, con el esquema de [`vapi/call-analysis.schema.json`](vapi/call-analysis.schema.json) y como descripción el texto de `callAnalysisPrompt` (`server/call-analysis.ts`), y asociarlo al asistente. Alternativa: en el asistente, **Analysis → Structured Data**, con el mismo prompt y esquema.
4. **Detección de buzón:** activarla (proveedor `vapi`).

### 5. Comprobar

1. Llamar a un celular del equipo desde la app (cuando esté VOZ-04) o desde Vapi → Phone Numbers → Test.
2. En Vapi, en el log de la llamada, la petición al Server URL tiene que responder **200**.
3. En Supabase, la tabla `voice_events` tiene que tener el `end-of-call-report`. Si la llamada se inició desde el dashboard de Vapi, no existe en `calls` y el aviso queda pendiente de conciliación: es lo esperado hasta VOZ-04.

## Contrato compartido con el CRM

`CallResultV1Schema` y `NextActionSchema` vienen de `src/contracts/crm.ts` (Nano); `voice.ts` los reexporta y agrega `NormalizedCallResultV1Schema`.

## Pruebas

```bash
npm test -- voice
```

La lógica vive en `server/calls.ts`, sin dependencias de Next, para poder probarla con Vitest; `public.ts` solo agrega `server-only` y lee `VOICE_MODE`.
