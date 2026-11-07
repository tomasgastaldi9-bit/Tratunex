import { z } from "zod";
import type { ActionCtx, Ctx, Result } from "../../../contracts/common";
import { crmFailure } from "./persistent-crm";

const statusCodes = { VALIDATION_ERROR: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409,
  PROVIDER_ERROR: 502, PROVIDER_UNAVAILABLE: 503, RATE_LIMITED: 429 } as const;

export function crmJson<T>(result: Result<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : statusCodes[result.error.code],
    headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}

export function checkCrmOrigin(request: Request): Result<null> {
  const origin = request.headers.get("Origin");
  try {
    if (origin && new URL(origin).origin === new URL(request.url).origin && request.headers.get("Sec-Fetch-Site") !== "cross-site") {
      return { ok: true, data: null };
    }
  } catch { /* Invalid origin fails closed. */ }
  return crmFailure("FORBIDDEN", "La acción debe iniciarse desde este sitio. Actualizá la página e intentá de nuevo.");
}

export async function parseCrmMutation<I>(request: Request, schema: z.ZodType<I>): Promise<Result<{ action_id: string; input: I }>> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return crmFailure("VALIDATION_ERROR", "La acción debe enviarse como JSON.");
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > 65_536) return crmFailure("VALIDATION_ERROR", "La acción supera el tamaño permitido.");
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65_536) return crmFailure("VALIDATION_ERROR", "La acción supera el tamaño permitido.");
    const envelope = z.object({ action_id: z.string().trim().min(1).max(200), input: schema }).strict().safeParse(JSON.parse(raw));
    if (!envelope.success) return crmFailure("VALIDATION_ERROR", "Revisá los campos de la acción; no envíes identidad ni empresa desde el navegador.");
    const header = request.headers.get("Idempotency-Key");
    if (header !== null && header !== envelope.data.action_id) return crmFailure("CONFLICT", "El identificador de acción no coincide con el encabezado.");
    return { ok: true, data: envelope.data as { action_id: string; input: I } };
  } catch {
    return crmFailure("VALIDATION_ERROR", "No se pudo leer el JSON de la acción.");
  }
}

export async function handleCrmMutation<I, O>(request: Request, schema: z.ZodType<I>,
  context: () => Promise<Result<Ctx>>, action: (ctx: ActionCtx, input: I) => Promise<Result<O>>): Promise<Response> {
  const origin = checkCrmOrigin(request);
  if (!origin.ok) return crmJson(origin);
  const authenticated = await context();
  if (!authenticated.ok) return crmJson(authenticated);
  const payload = await parseCrmMutation(request, schema);
  if (!payload.ok) return crmJson(payload);
  try {
    return crmJson(await action({ ...authenticated.data, action_id: payload.data.action_id }, payload.data.input));
  } catch {
    return crmJson(crmFailure("PROVIDER_UNAVAILABLE", "No se pudo confirmar la acción. Consultá el estado antes de reintentar.", true));
  }
}
