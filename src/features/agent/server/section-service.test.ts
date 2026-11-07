import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSectionService } from "./section-service";

// Espiamos console.error: el servicio anota los errores raros en el log del servidor.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

const company = "11111111-1111-4111-8111-111111111111";
const ctx = { company_id: company, actor_type: "user" as const, actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", action_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const input = { base_version: 2, knowledge: [{ kind: "faq" as const, question: "  ¿Hacen envíos?  ", answer: "Sí, en 24 h" }] };

// Cliente falso: solo necesitamos rpc().
function fakeClient(opts: { save?: unknown; saveThrows?: boolean }) {
  const rpc = vi.fn(async () => {
    if (opts.saveThrows) throw new Error("boom");
    return opts.save ?? { data: { version: 3, created: true }, error: null };
  });
  const service = createSectionService(async () => ({ rpc }) as unknown as SupabaseClient);
  return { service, rpc };
}

describe("saveAgentKnowledge", () => {
  it("rechaza un ctx inválido", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveAgentKnowledge({ ...ctx, company_id: " " }, input);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza una lista inválida", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveAgentKnowledge(ctx, { base_version: 2, knowledge: [{ kind: "faq", question: "", answer: "" }] });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza si quien guarda no es una persona", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveAgentKnowledge({ ...ctx, actor_type: "system" }, input);
    expect(r).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "Solo una persona admin puede cambiar el agente.", retryable: false } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("guarda con los parámetros exactos y la lista normalizada", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toEqual({ ok: true, data: { version: 3, created: true } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_agent_section", {
      p_company_id: company,
      p_action_id: ctx.action_id,
      p_base_version: 2,
      p_section: "knowledge",
      p_value: [{ kind: "faq", question: "¿Hacen envíos?", answer: "Sí, en 24 h" }],
    });
  });

  it("traduce 'profile required'", async () => {
    const { service } = fakeClient({ save: { data: null, error: { message: "VALIDATION_ERROR: profile required" } } });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toEqual({ ok: false, error: { code: "VALIDATION_ERROR", message: "Primero completá y guardá el perfil de empresa.", retryable: false } });
  });

  it("traduce CONFLICT de versión vieja", async () => {
    const { service } = fakeClient({ save: { data: null, error: { message: "CONFLICT: stale base version" } } });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLICT", retryable: false } });
  });

  it("traduce FORBIDDEN", async () => {
    const { service } = fakeClient({ save: { data: null, error: { code: "42501", message: "x" } } });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("un error desconocido es reintentable y se anota sin datos de la empresa", async () => {
    const { service } = fakeClient({ save: { data: null, error: { code: "XX000", message: "raro" } } });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(company);
  });

  it("si la llamada lanza una excepción, devuelve PROVIDER_UNAVAILABLE", async () => {
    const { service } = fakeClient({ saveThrows: true });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toEqual({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No pudimos guardar. Revisá tu conexión y probá de nuevo.", retryable: true } });
    expect(consoleError).toHaveBeenCalledWith("[agent] excepción al llamar a save_agent_section", { message: "boom" });
  });

  it("si la base responde algo inesperado, devuelve PROVIDER_ERROR", async () => {
    const { service } = fakeClient({ save: { data: { nada: true }, error: null } });
    const r = await service.saveAgentKnowledge(ctx, input);
    expect(r).toEqual({ ok: false, error: { code: "PROVIDER_ERROR", message: "La base respondió algo inesperado al guardar.", retryable: false } });
  });
});
