// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { Result } from "../../../contracts/common";

// Lectura de una llamada en la API de Vapi (GET /call/:id), con la clave privada
// del servidor. Sin dependencias de Next para poder probarlo con Vitest.

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// Los IDs de llamada de Vapi son UUID. Validarlo evita armar URLs con texto ajeno.
const VAPI_CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVapiCallId(value: string): boolean {
  return VAPI_CALL_ID.test(value);
}

type FetchVapiCallOptions = { apiKey: string; fetchImpl?: FetchLike; timeoutMs?: number };

function failure(code: "VALIDATION_ERROR" | "NOT_FOUND" | "PROVIDER_ERROR" | "PROVIDER_UNAVAILABLE" | "RATE_LIMITED", message: string, retryable: boolean) {
  return { ok: false as const, error: { code, message, retryable } };
}

export async function fetchVapiCall(callId: string, options: FetchVapiCallOptions): Promise<Result<unknown>> {
  if (!isVapiCallId(callId)) {
    return failure("VALIDATION_ERROR", "El ID de la llamada de Vapi no es válido", false);
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    return failure("PROVIDER_UNAVAILABLE", "No se pudo consultar Vapi", true);
  }

  if (response.status === 404) return failure("NOT_FOUND", "Vapi no tiene una llamada con ese ID", false);
  if (response.status === 401 || response.status === 403) {
    return failure("PROVIDER_ERROR", "Vapi rechazó la clave del servidor (VAPI_PRIVATE_KEY)", false);
  }
  if (response.status === 429) return failure("RATE_LIMITED", "Vapi pidió esperar antes de reintentar", true);
  if (response.status >= 500) return failure("PROVIDER_UNAVAILABLE", `Vapi respondió ${response.status}`, true);
  if (!response.ok) return failure("PROVIDER_ERROR", `Vapi respondió ${response.status}`, false);

  try {
    return { ok: true, data: await response.json() };
  } catch {
    return failure("PROVIDER_ERROR", "Vapi devolvió una respuesta que no es JSON", false);
  }
}

type VapiRequestOptions = { apiKey: string; fetchImpl?: FetchLike; timeoutMs?: number };

async function vapiJson(path: string, init: RequestInit, options: VapiRequestOptions): Promise<Result<unknown>> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`https://api.vapi.ai${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch {
    return failure("PROVIDER_UNAVAILABLE", "No se pudo hablar con Vapi", true);
  }
  if (response.status === 404) return failure("NOT_FOUND", "Vapi no encontró el asistente o el número configurado", false);
  if (response.status === 401 || response.status === 403) {
    return failure("PROVIDER_ERROR", "Vapi rechazó la clave del servidor (VAPI_PRIVATE_KEY)", false);
  }
  if (response.status === 429) return failure("RATE_LIMITED", "Vapi pidió esperar antes de reintentar", true);
  if (response.status >= 500) return failure("PROVIDER_UNAVAILABLE", `Vapi respondió ${response.status}`, true);
  if (!response.ok) {
    // 400: Vapi explica qué no le gustó (teléfono, crédito, configuración).
    const detail = await response.text().catch(() => "");
    return failure("PROVIDER_ERROR", `Vapi rechazó la llamada (${response.status}) ${detail.slice(0, 200)}`.trim(), false);
  }
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return failure("PROVIDER_ERROR", "Vapi devolvió una respuesta que no es JSON", false);
  }
}

// El modelo configurado en el asistente (proveedor, modelo, herramientas).
export async function fetchVapiAssistantModel(assistantId: string, options: VapiRequestOptions): Promise<Result<Record<string, unknown>>> {
  if (!isVapiCallId(assistantId)) return failure("VALIDATION_ERROR", "VAPI_ASSISTANT_ID no es un ID válido", false);
  const result = await vapiJson(`/assistant/${assistantId}`, { method: "GET" }, options);
  if (!result.ok) return result;
  const model = (result.data as { model?: unknown }).model;
  return model && typeof model === "object" && !Array.isArray(model)
    ? { ok: true, data: model as Record<string, unknown> }
    : failure("PROVIDER_ERROR", "El asistente de Vapi no tiene modelo configurado", false);
}

// Crea una llamada saliente. Devuelve el ID de Vapi.
export async function createVapiCall(body: unknown, options: VapiRequestOptions): Promise<Result<{ provider_call_id: string }>> {
  const result = await vapiJson("/call", { method: "POST", body: JSON.stringify(body) }, options);
  if (!result.ok) return result;
  const id = (result.data as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0
    ? { ok: true, data: { provider_call_id: id } }
    : failure("PROVIDER_ERROR", "Vapi no devolvió el ID de la llamada", false);
}
