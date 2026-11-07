import { createHash } from "node:crypto";
import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import { actionCtxSchema, ctxSchema, type Result } from "../../../contracts/common";
import {
  DispatchDueCallsInputSchema,
  StartCallInputSchema,
  type CallDTO,
  type DispatchDueCallsData,
  type StartCallData,
} from "../../../contracts/voice";

// Lógica de llamadas sin dependencias de Next, para poder probarla con Vitest.
// El punto de entrada para otros módulos es ./public.ts.

export type VoiceMode = "mock" | "live";
export type VoiceDeps = { mode: VoiceMode; now: () => Date };

type Failure = Extract<Result<never>, { ok: false }>;

function validationError(message: string): Failure {
  return { ok: false, error: { code: "VALIDATION_ERROR", message, retryable: false } };
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return path ? `${path}: ${issue.message}` : (issue?.message ?? "Datos inválidos");
}

// Un adapter live sin implementar falla de forma explícita: nunca cae en mock en silencio.
function liveNotImplemented(operation: string, ticket: string): Failure {
  return {
    ok: false,
    error: {
      code: "PROVIDER_UNAVAILABLE",
      message: `${operation} en modo live todavía no está implementado (${ticket}). Usá VOICE_MODE=mock.`,
      retryable: false,
    },
  };
}

// ID estable derivado de la empresa y el action_id: reintentar la misma acción
// devuelve la misma llamada. Formato UUID versión 5 (variante RFC 9562).
export function mockCallId(companyId: string, actionId: string): string {
  const bytes = createHash("sha256")
    .update(`tratunex:voice:start-call:${companyId}:${actionId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function startCall(actionCtx: unknown, input: unknown, deps: VoiceDeps): Promise<Result<StartCallData>> {
  const ctx = actionCtxSchema.safeParse(actionCtx);
  if (!ctx.success || !z.uuid().safeParse(ctx.data.company_id).success) {
    return validationError("Contexto de acción inválido");
  }
  const parsed = StartCallInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(describeIssue(parsed.error));
  }
  if (deps.mode === "live") {
    return liveNotImplemented("startCall", "VOZ-04");
  }

  // Mock: no llama a nadie ni persiste; queda en cola con transporte "mock".
  const now = deps.now().toISOString();
  const call: CallDTO = {
    id: mockCallId(ctx.data.company_id, ctx.data.action_id),
    company_id: ctx.data.company_id,
    contact_id: parsed.data.contact_id,
    deal_id: parsed.data.deal_id ?? null,
    source_task_id: parsed.data.source_task_id ?? null,
    provider_call_id: null,
    transport: "mock",
    status: "queued",
    objective: parsed.data.objective ?? null,
    agent_version: null,
    created_at: now,
    updated_at: now,
  };
  return { ok: true, data: { call } };
}

export async function dispatchDueCalls(ctx: unknown, input: unknown, deps: VoiceDeps): Promise<Result<DispatchDueCallsData>> {
  if (!ctxSchema.safeParse(ctx).success) {
    return validationError("Contexto inválido");
  }
  const parsed = DispatchDueCallsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(describeIssue(parsed.error));
  }
  if (deps.mode === "live") {
    return liveNotImplemented("dispatchDueCalls", "VOZ-09");
  }
  // Mock: no hay tareas de seguimiento reales que despachar.
  return { ok: true, data: { processed: 0, pending: 0, failed: 0 } };
}
