import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { translateSaveError } from "./save-errors";

// El error desconocido se anota con console.error: lo espiamos para no ensuciar la salida.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("translateSaveError", () => {
  it("código 42501 → FORBIDDEN", () => {
    expect(translateSaveError({ code: "42501", message: "x" })).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Solo una persona admin de la empresa puede cambiar el agente.", retryable: false },
    });
  });

  it("FORBIDDEN → FORBIDDEN", () => {
    expect(translateSaveError({ message: "FORBIDDEN: not admin" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN", retryable: false } });
  });

  it("CONFLICT: stale base version → CONFLICT de versión", () => {
    expect(translateSaveError({ message: "CONFLICT: stale base version" })).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "Alguien guardó cambios mientras editabas. Recargá la página para ver la última versión.", retryable: false },
    });
  });

  it("CONFLICT genérico → CONFLICT de guardado repetido", () => {
    expect(translateSaveError({ message: "CONFLICT: action reused" })).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "Este guardado ya se usó con otros datos. Recargá la página y probá de nuevo.", retryable: false },
    });
  });

  it("VALIDATION_ERROR: profile required → mensaje propio (antes del genérico)", () => {
    expect(translateSaveError({ message: "VALIDATION_ERROR: profile required" })).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Primero completá y guardá el perfil de empresa.", retryable: false },
    });
  });

  it("VALIDATION_ERROR genérico → formato inválido", () => {
    expect(translateSaveError({ message: "VALIDATION_ERROR: bad" })).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Hay datos con un formato inválido. Revisalos y probá de nuevo.", retryable: false },
    });
  });

  it("error desconocido → PROVIDER_UNAVAILABLE reintentable y lo anota sin datos", () => {
    const r = translateSaveError({ code: "XX000", message: "algo raro" }, "save_agent_section");
    expect(r).toEqual({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "No pudimos guardar. Revisá tu conexión y probá de nuevo.", retryable: true },
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[agent] save_agent_section devolvió un error desconocido", { code: "XX000", message: "algo raro" });
  });
});
