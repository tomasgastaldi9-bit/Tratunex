import { z } from "zod";
// Import relativo: Vitest no resuelve el alias "@/" en imports de valores.
import { CallResultV1Schema, NextActionSchema } from "./crm";

// Contratos de Voz (Bautista, TRA-43). Ctx, ActionCtx y Result<T> vienen de
// contracts/common.ts; estos schemas describen inputs y payloads de data.
const IdSchema = z.uuid();
const UtcSchema = z.iso.datetime();
const TextSchema = z.string().trim().min(1);
// Mismo criterio que crm.ts: solo URLs http(s).
const WebUrlSchema = z.url().refine(
  (value) => /^https?:\/\//i.test(value),
  "La URL debe usar http o https",
);

// ---------------------------------------------------------------------------
// CallResultV1: lo que Voz entrega a recordCallResult del CRM (BRIEF §10).
// El dueño del esquema es el CRM (src/contracts/crm.ts, Nano): Voz importa del
// CRM y no al revés. Se reexporta para que los módulos de Voz tengan un solo
// punto de entrada.
// ---------------------------------------------------------------------------
export { CallResultV1Schema, NextActionSchema };

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

// Detalle de una llamada para las pantallas de Voz y el historial del CRM.
// Los campos de resultado quedan en null hasta que Voz procese el reporte final.
export const CallDetailDTOSchema = CallDTOSchema.extend({
  ended_at: UtcSchema.nullable(),
  ended_reason: z.string().min(1).nullable(),
  recording_url: WebUrlSchema.nullable(),
  transcript: z.string().nullable(),
  result: CallResultV1Schema.nullable(),
});

// En la lista no viaja la transcripción completa.
export const CallListItemSchema = CallDetailDTOSchema.omit({ transcript: true });

export const ListCallsInputSchema = z.object({
  contact_id: IdSchema.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.number().int().positive().max(50).optional(),
}).strict();

export const GetCallInputSchema = z.object({ call_id: IdSchema }).strict();

export const StartCallDataSchema = z.object({ call: CallDTOSchema });
export const ListCallsDataSchema = z.object({
  items: z.array(CallListItemSchema),
  next_cursor: z.string().nullable(),
});
export const GetCallDataSchema = z.object({ call: CallDetailDTOSchema });
export const DispatchDueCallsDataSchema = z.object({
  processed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

// Catálogo de payloads de las operaciones de src/features/voice/server/public.ts.
export const voiceOperationSchemas = {
  startCall: { input: StartCallInputSchema, data: StartCallDataSchema },
  dispatchDueCalls: { input: DispatchDueCallsInputSchema, data: DispatchDueCallsDataSchema },
  listCalls: { input: ListCallsInputSchema, data: ListCallsDataSchema },
  getCall: { input: GetCallInputSchema, data: GetCallDataSchema },
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
export type CallDetailDTO = z.infer<typeof CallDetailDTOSchema>;
export type CallListItem = z.infer<typeof CallListItemSchema>;
export type ListCallsInput = z.infer<typeof ListCallsInputSchema>;
export type GetCallInput = z.infer<typeof GetCallInputSchema>;
export type ListCallsData = z.infer<typeof ListCallsDataSchema>;
export type GetCallData = z.infer<typeof GetCallDataSchema>;
