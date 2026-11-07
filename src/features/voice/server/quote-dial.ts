import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { ActionCtx, Result } from "../../../contracts/common";
import {
  QUOTE_END_CALL_MESSAGE,
  QUOTE_END_CALL_PHRASES,
  QUOTE_MAX_DURATION_SECONDS,
  QuoteRequestBriefSchema,
  quoteAssistantFirstMessage,
  quoteAssistantPrompt,
  type QuoteRequestBrief,
} from "./quote-call";

// QUO-03: llamar al proveedor desde la app con el asistente cotizador. Primero
// se reserva la llamada (una por clic, por action_id) y recién después se le
// pide a Vapi que llame: un reintento nunca vuelve a llamar a ciegas.

export const RequestQuoteCallInputSchema = z.strictObject({
  supplier_contact_id: z.uuid(),
  purchase_request_id: z.uuid(),
});
export type RequestQuoteCallInput = z.infer<typeof RequestQuoteCallInputSchema>;

export type QuoteCallTarget = { brief: QuoteRequestBrief; supplier_phone_e164: string };

export type DialStore = {
  // Crea la llamada en "queued" o devuelve la que ya existe para ese action_id.
  reserveCall(input: { company_id: string; supplier_contact_id: string; action_id: string }): Promise<
    Result<{ call_id: string; provider_call_id: string | null; created: boolean }>
  >;
  markDialed(input: { call_id: string; provider_call_id: string }): Promise<Result<null>>;
  // failed: Vapi dijo que no; unknown: no sabemos si llamó (timeout, red).
  markNotDialed(input: { call_id: string; status: "failed" | "unknown"; reason: string }): Promise<Result<null>>;
};

export type QuoteDialRequest = {
  phone_e164: string;
  first_message: string;
  system_prompt: string;
  metadata: { company_id: string; call_id: string; supplier_contact_id: string; purchase_request_id: string };
};

export type QuoteDialDeps = {
  loadTarget: (actionCtx: ActionCtx, input: RequestQuoteCallInput) => Promise<Result<QuoteCallTarget>>;
  store: DialStore;
  dial: (request: QuoteDialRequest) => Promise<Result<{ provider_call_id: string }>>;
};

export type RequestQuoteCallData = { call_id: string; provider_call_id: string; created: boolean };

export function quoteCallActionId(clickId: string): string {
  return `voice:quote-call:${clickId}`;
}

// "2026-11-09" → "el lunes 9 de noviembre" (es una fecha sin hora).
export function formatNeededBy(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const text = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `el ${text.replace(",", "")}`;
}

export async function requestQuoteCall(
  actionCtx: ActionCtx,
  input: unknown,
  deps: QuoteDialDeps,
): Promise<Result<RequestQuoteCallData>> {
  const parsed = RequestQuoteCallInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Elegí un proveedor y una compra válidos", retryable: false } };
  }

  const target = await deps.loadTarget(actionCtx, parsed.data);
  if (!target.ok) return target;
  const brief = QuoteRequestBriefSchema.safeParse(target.data.brief);
  if (!brief.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Faltan datos de la compra para armar la llamada", retryable: false } };
  }

  const reserved = await deps.store.reserveCall({
    company_id: actionCtx.company_id,
    supplier_contact_id: parsed.data.supplier_contact_id,
    action_id: actionCtx.action_id,
  });
  if (!reserved.ok) return reserved;
  if (!reserved.data.created) {
    if (reserved.data.provider_call_id) {
      return { ok: true, data: { call_id: reserved.data.call_id, provider_call_id: reserved.data.provider_call_id, created: false } };
    }
    return {
      ok: false,
      error: { code: "CONFLICT", message: "Ese pedido de llamada ya se intentó y no sabemos si salió: revisá en Vapi antes de volver a llamar", retryable: false },
    };
  }

  const dialed = await deps.dial({
    phone_e164: target.data.supplier_phone_e164,
    first_message: quoteAssistantFirstMessage(brief.data),
    system_prompt: quoteAssistantPrompt(brief.data),
    metadata: {
      company_id: actionCtx.company_id,
      call_id: reserved.data.call_id,
      supplier_contact_id: parsed.data.supplier_contact_id,
      purchase_request_id: parsed.data.purchase_request_id,
    },
  });
  if (!dialed.ok) {
    // Sin respuesta clara de Vapi no sabemos si llamó: queda "unknown", no "failed".
    const status = dialed.error.code === "PROVIDER_UNAVAILABLE" ? "unknown" : "failed";
    await deps.store.markNotDialed({ call_id: reserved.data.call_id, status, reason: dialed.error.message });
    return dialed;
  }

  // Si esto falla, la llamada igual salió: la cotización se trae por su ID de Vapi.
  await deps.store.markDialed({ call_id: reserved.data.call_id, provider_call_id: dialed.data.provider_call_id });
  return { ok: true, data: { call_id: reserved.data.call_id, provider_call_id: dialed.data.provider_call_id, created: true } };
}

// Cuerpo de POST https://api.vapi.ai/call. El modelo del asistente se copia tal
// cual (proveedor, modelo, herramientas) y solo se reemplaza el prompt.
export function buildVapiQuoteCallBody(
  request: QuoteDialRequest,
  config: { assistantId: string; phoneNumberId: string; assistantModel: Record<string, unknown> },
) {
  return {
    assistantId: config.assistantId,
    phoneNumberId: config.phoneNumberId,
    customer: { number: request.phone_e164 },
    assistantOverrides: {
      firstMessage: request.first_message,
      model: { ...config.assistantModel, messages: [{ role: "system", content: request.system_prompt }] },
      endCallMessage: QUOTE_END_CALL_MESSAGE,
      endCallPhrases: [...QUOTE_END_CALL_PHRASES],
      maxDurationSeconds: QUOTE_MAX_DURATION_SECONDS,
    },
    metadata: request.metadata,
  };
}
