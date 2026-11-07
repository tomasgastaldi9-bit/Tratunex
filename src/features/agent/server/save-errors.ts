import type { Result } from "../../../contracts/common";

/**
 * Traducción de los errores de guardado de la base (save_agent_profile y
 * save_agent_section). Está en un archivo aparte porque la usan el servicio
 * del perfil y el de las demás secciones: así los mensajes son siempre iguales.
 * NO tiene "server-only" a propósito: así los tests la pueden importar.
 */

/** Arma un error con la forma que pide Result. */
export function fail(code: "VALIDATION_ERROR" | "FORBIDDEN" | "CONFLICT" | "PROVIDER_ERROR" | "PROVIDER_UNAVAILABLE", message: string, retryable: boolean): Result<never> {
  return { ok: false, error: { code, message, retryable } };
}

/**
 * Anota en el log del SERVIDOR (la terminal de Next, no el navegador) un error
 * de la base que a la persona le mostramos solo como "probá de nuevo".
 * Sin esto, cuando algo se rompe no queda ningún rastro de qué pasó.
 *
 * Solo anotamos el código y el mensaje del error. NUNCA el ctx, el perfil ni
 * otros datos de la persona o de la empresa: los logs los puede leer más gente
 * y se guardan en otros lados.
 */
export function logError(queFallo: string, error: unknown): void {
  if (typeof error === "object" && error !== null) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    console.error(`[agent] ${queFallo}`, {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : undefined,
    });
    return;
  }
  // Alguien hizo "throw" de algo que no es un objeto (raro, pero posible).
  console.error(`[agent] ${queFallo}`, { message: String(error) });
}

/**
 * Traduce el error de la base a un error nuestro.
 * La base escribe el código al principio del mensaje, así que miramos cómo empieza.
 * Todo lo que no reconocemos se trata como "la base no respondió" (se puede reintentar).
 * `funcion` es el nombre de la función SQL, solo para el log.
 */
export function translateSaveError(error: { message?: string; code?: string }, funcion = "save_agent_profile"): Result<never> {
  const message = error.message ?? "";
  if (error.code === "42501" || message.startsWith("FORBIDDEN")) {
    return fail("FORBIDDEN", "Solo una persona admin de la empresa puede cambiar el agente.", false);
  }
  // Ojo con el orden: el "stale" va antes que el CONFLICT genérico.
  if (message.startsWith("CONFLICT: stale base version")) {
    return fail("CONFLICT", "Alguien guardó cambios mientras editabas. Recargá la página para ver la última versión.", false);
  }
  if (message.startsWith("CONFLICT")) {
    return fail("CONFLICT", "Este guardado ya se usó con otros datos. Recargá la página y probá de nuevo.", false);
  }
  // Mismo criterio: el caso específico (falta el perfil) va antes que el genérico.
  if (message.startsWith("VALIDATION_ERROR: profile required")) {
    return fail("VALIDATION_ERROR", "Primero completá y guardá el perfil de empresa.", false);
  }
  if (message.startsWith("VALIDATION_ERROR")) {
    return fail("VALIDATION_ERROR", "Hay datos con un formato inválido. Revisalos y probá de nuevo.", false);
  }
  // Un error que no conocemos: a la persona le decimos "probá de nuevo", pero
  // lo anotamos para poder ver después qué fue.
  logError(`${funcion} devolvió un error desconocido`, error);
  return fail("PROVIDER_UNAVAILABLE", "No pudimos guardar. Revisá tu conexión y probá de nuevo.", true);
}
