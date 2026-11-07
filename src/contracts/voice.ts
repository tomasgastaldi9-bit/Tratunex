import { z } from "zod";

// Contratos de Voz (Bautista, TRA-43). Ctx, ActionCtx y Result<T> vienen de
// contracts/common.ts; estos schemas describen inputs y payloads de data.
const IdSchema = z.uuid();
const UtcSchema = z.iso.datetime();
const TextSchema = z.string().trim().min(1);
const ExternalEventIdSchema = z.string().min(1).refine(
  (value) => value === value.trim(),
  "El ID externo debe conservarse sin espacios agregados",
);
const WebUrlSchema = z.url().refine(
  (value) => /^https?:\/\//i.test(value),
  "La URL debe usar http o https",
);

// ---------------------------------------------------------------------------
// CallResultV1: lo que Voz entrega a recordCallResult del CRM (BRIEF §10).
//
// TEMPORAL: espejo exacto de CallResultV1Schema en src/contracts/crm.ts, que
// Nano publica en TRA-53 (todavía sin mergear). Voz puede importar contratos
// del CRM, pero no al revés, así que el dueño final es crm.ts. Cuando ese
// archivo llegue a main, reemplazar este bloque por un import desde
// "@/contracts/crm" y mantener solo normalizedCallResultV1Schema.
// ---------------------------------------------------------------------------
export const NextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("callback"), due_at: UtcSchema, reason: TextSchema }),
  z.object({ type: z.literal("human_review"), due_at: UtcSchema.nullable(), reason: TextSchema }),
]);

export const CallResultV1Schema = z.object({
  schema_version: z.literal("1"),
  event_id: ExternalEventIdSchema,
  occurred_at: UtcSchema,
  company_id: IdSchema,
  call_id: IdSchema,
  contact_id: IdSchema,
  deal_id: IdSchema.nullable(),
  agent_version: z.number().int().positive(),
  technical_status: z.enum(["completed", "failed"]),
  answered_by: z.enum(["human", "voicemail", "unknown"]),
  is_potential_client: z.enum(["yes", "no", "unknown"]),
  outcome: z.enum(["interested", "not_interested", "callback_requested", "wants_to_buy", "not_assessed"]),
  do_not_contact_requested: z.boolean(),
  score: z.number().min(0).max(100).nullable(),
  summary: TextSchema,
  transcript_url: WebUrlSchema.nullable(),
  next_action: NextActionSchema.nullable(),
});

// Garantías extra que Voz cumple al normalizar el reporte de Vapi, antes de
// entregarlo al CRM. Sin conversación con una persona no hay evaluación
// comercial: un buzón o una llamada fallida nunca cuentan como interés.
export const NormalizedCallResultV1Schema = CallResultV1Schema.superRefine((result, ctx) => {
  const spokeWithHuman = result.technical_status === "completed" && result.answered_by === "human";
  if (spokeWithHuman) {
    return;
  }
  if (result.outcome !== "not_assessed") {
    ctx.addIssue({ code: "custom", path: ["outcome"], message: "Sin conversación humana el resultado es not_assessed" });
  }
  if (result.is_potential_client !== "unknown") {
    ctx.addIssue({ code: "custom", path: ["is_potential_client"], message: "Sin conversación humana no se califica al prospecto" });
  }
  if (result.do_not_contact_requested) {
    ctx.addIssue({ code: "custom", path: ["do_not_contact_requested"], message: "Solo una persona puede pedir no ser contactada" });
  }
  if (result.score !== null) {
    ctx.addIssue({ code: "custom", path: ["score"], message: "Sin conversación humana no hay score" });
  }
});

// ---------------------------------------------------------------------------
// Llamadas: contratos propios de Voz.
// ---------------------------------------------------------------------------
export const CallStatusSchema = z.enum(["queued", "ringing", "in_progress", "completed", "failed", "unknown"]);

// mock: sin proveedor · web: voz en el navegador, sin teléfono · phone: llamada telefónica real.
export const CallTransportSchema = z.enum(["mock", "web", "phone"]);

export const CallDTOSchema = z.object({
  id: IdSchema,
  company_id: IdSchema,
  contact_id: IdSchema,
  deal_id: IdSchema.nullable(),
  source_task_id: IdSchema.nullable(),
  // ID de Vapi; null mientras el proveedor no aceptó la llamada (y siempre en mock).
  provider_call_id: z.string().min(1).nullable(),
  transport: CallTransportSchema,
  status: CallStatusSchema,
  objective: TextSchema.nullable(),
  // Versión de la configuración del agente usada; null hasta integrar getAgentConfig.
  agent_version: z.number().int().positive().nullable(),
  created_at: UtcSchema,
  updated_at: UtcSchema,
});

// Los inputs no aceptan company_id, actor ni action_id: llegan en ActionCtx desde el servidor.
export const StartCallInputSchema = z.object({
  contact_id: IdSchema,
  deal_id: IdSchema.optional(),
  objective: TextSchema.max(500).optional(),
  source_task_id: IdSchema.optional(),
}).strict();

// El cron toma lotes de hasta 5 tareas (BRIEF §9).
export const DispatchDueCallsInputSchema = z.object({
  limit: z.number().int().positive().max(5),
}).strict();

export const StartCallDataSchema = z.object({ call: CallDTOSchema });
export const DispatchDueCallsDataSchema = z.object({
  processed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

// Catálogo de payloads de las operaciones de src/features/voice/server/public.ts.
export const voiceOperationSchemas = {
  startCall: { input: StartCallInputSchema, data: StartCallDataSchema },
  dispatchDueCalls: { input: DispatchDueCallsInputSchema, data: DispatchDueCallsDataSchema },
} as const;

export type NextAction = z.infer<typeof NextActionSchema>;
export type CallResultV1 = z.infer<typeof CallResultV1Schema>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export type CallTransport = z.infer<typeof CallTransportSchema>;
export type CallDTO = z.infer<typeof CallDTOSchema>;
export type StartCallInput = z.infer<typeof StartCallInputSchema>;
export type DispatchDueCallsInput = z.infer<typeof DispatchDueCallsInputSchema>;
export type StartCallData = z.infer<typeof StartCallDataSchema>;
export type DispatchDueCallsData = z.infer<typeof DispatchDueCallsDataSchema>;
