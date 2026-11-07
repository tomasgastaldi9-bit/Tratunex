import type { ErrorCode, Result } from "../../../contracts/common";

// Traducción de Result<T> a HTTP para las rutas de Voz (BRIEF §10).
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  PROVIDER_UNAVAILABLE: 503,
};

export function httpStatusFor(result: Result<unknown>, successStatus = 200): number {
  return result.ok ? successStatus : STATUS_BY_CODE[result.error.code];
}

// Cada clic en "Llamar" manda una clave nueva en el header Idempotency-Key; un
// reintento del mismo clic reusa la clave y no genera otra llamada.
export function startCallActionId(idempotencyKey: string | null): string | null {
  const key = idempotencyKey?.trim();
  if (!key || key.length > 200 || !/^[\w.:-]+$/.test(key)) return null;
  return `start-call:${key}`;
}
