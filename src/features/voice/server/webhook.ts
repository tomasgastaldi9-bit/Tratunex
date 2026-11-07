import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Ingreso de avisos de Vapi (TRA-46). Orden: autenticar, validar, guardar sin
// duplicar y recién entonces responder 200. Sin dependencias de Next para poder
// probarlo con Vitest; la ruta está en src/app/api/voice/webhooks/vapi.

// Avisos que se guardan. El resto (transcripción parcial, speech-update, etc.)
// se acepta y se descarta: no cambia el estado de la llamada.
export const STORED_VAPI_EVENT_TYPES = ["end-of-call-report", "status-update", "hang", "tool-calls"] as const;

export type VoiceEventRecord = {
  provider_event_id: string;
  provider_call_id: string | null;
  event_type: string;
  payload: unknown;
};

// Guarda el aviso con su clave estable. duplicate = ya estaba guardado.
// resolved = provider_call_id coincidió con una llamada interna (empresa y llamada conocidas).
export type VoiceEventStore = {
  insert: (event: VoiceEventRecord) => Promise<{ duplicate: boolean; resolved: boolean }>;
};

export type WebhookDeps = {
  secret: string | undefined;
  store: VoiceEventStore | null;
};

export type WebhookResponse = { status: number; body: Record<string, unknown> };

const vapiMessageSchema = z.object({
  message: z.object({
    type: z.string().trim().min(1),
    status: z.string().optional(),
    call: z.object({ id: z.string().trim().min(1) }).optional(),
  }),
});

// Compara "Bearer <secreto>" en tiempo constante. Sin secreto configurado no autoriza nada.
export function isAuthorizedVapiRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Clave estable: el mismo aviso reenviado produce la misma clave; nunca un UUID nuevo.
export function stableVapiEventId(type: string, callId: string | null, status: string | undefined, rawBody: string): string {
  if (callId && type === "end-of-call-report") {
    return `vapi:${callId}:end-of-call-report`;
  }
  if (callId && type === "status-update" && status) {
    return `vapi:${callId}:status-update:${status}`;
  }
  const digest = createHash("sha256").update(rawBody).digest("hex");
  return `vapi:${callId ?? "sin-llamada"}:${type}:sha256:${digest}`;
}

export async function handleVapiWebhook(
  request: { authorization: string | null; rawBody: string },
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  if (!deps.secret) {
    return { status: 503, body: { error: "El webhook de voz no está configurado" } };
  }
  if (!isAuthorizedVapiRequest(request.authorization, deps.secret)) {
    return { status: 401, body: { error: "No autorizado" } };
  }

  let json: unknown;
  try {
    json = JSON.parse(request.rawBody);
  } catch {
    return { status: 400, body: { error: "JSON inválido" } };
  }
  const parsed = vapiMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { error: "Aviso de Vapi sin message.type" } };
  }

  const { type, status, call } = parsed.data.message;
  if (!(STORED_VAPI_EVENT_TYPES as readonly string[]).includes(type)) {
    return { status: 200, body: { received: true, stored: false } };
  }
  if (!deps.store) {
    // Sin dónde guardar no se confirma la recepción.
    return { status: 503, body: { error: "Almacenamiento de eventos no configurado" } };
  }

  const callId = call?.id ?? null;
  try {
    const result = await deps.store.insert({
      provider_event_id: stableVapiEventId(type, callId, status, request.rawBody),
      provider_call_id: callId,
      event_type: type,
      payload: json,
    });
    return {
      status: 200,
      body: { received: true, stored: true, event_type: type, duplicate: result.duplicate, resolved: result.resolved },
    };
  } catch {
    return { status: 500, body: { error: "No se pudo guardar el aviso" } };
  }
}
