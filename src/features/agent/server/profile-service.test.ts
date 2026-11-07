import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProfileService } from "./profile-service";

// Cuando la base falla, el servicio anota el error con console.error (a
// propósito: es el log del servidor). En los tests lo "espiamos" en vez de
// dejar que escriba: así la salida queda limpia y podemos revisar QUÉ anotó.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

const company = "11111111-1111-4111-8111-111111111111";
const ctx = { company_id: company, actor_type: "user" as const, actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const actionCtx = { ...ctx, action_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

const profile = {
  industry: "distributor" as const,
  offering: "Alimentos",
  target_customer: "Kioscos",
  value_proposition: "Entrega en 24 h",
  zone: "CABA",
  tone: "professional_warm" as const,
  call_window: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
};
const row = { version: 2, profile, created_at: "2026-11-07T12:00:00Z", created_by: ctx.actor_id };

// Cliente falso: imita la cadena from().select().eq().order().limit().maybeSingle() y rpc().
function fakeClient(opts: {
  read?: unknown;
  readThrows?: boolean;
  canEdit?: unknown;
  save?: unknown;
  saveThrows?: boolean;
}) {
  const maybeSingle = vi.fn(async () => {
    if (opts.readThrows) throw new Error("boom");
    return opts.read ?? { data: null, error: null };
  });
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  const rpc = vi.fn(async (name: string) => {
    if (name === "can_edit_agent_profile") return opts.canEdit ?? { data: true, error: null };
    if (opts.saveThrows) throw new Error("boom");
    return opts.save ?? { data: { version: 1, created: true }, error: null };
  });
  const service = createProfileService(async () => ({ from, rpc }) as unknown as SupabaseClient);
  return { service, from, rpc, chain };
}

/**
 * Revisa que el servicio anotó UN error en el log, con ese texto y ese
 * detalle (solo código y mensaje), y que no se coló ningún dato de la empresa
 * ni del perfil.
 */
function expectLogged(queFallo: string, detalle: { code: string | undefined; message: string | undefined }) {
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledWith(`[agent] ${queFallo}`, detalle);
  const todoLoAnotado = JSON.stringify(consoleError.mock.calls);
  expect(todoLoAnotado).not.toContain(company);
  expect(todoLoAnotado).not.toContain(ctx.actor_id);
  expect(todoLoAnotado).not.toContain(profile.offering);
}

describe("getAgentProfile", () => {
  it("rechaza un ctx inválido", async () => {
    const { service, from } = fakeClient({});
    const r = await service.getAgentProfile({ ...ctx, company_id: " " });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    expect(from).not.toHaveBeenCalled();
  });

  it("devuelve current null si no hay versiones", async () => {
    const { service, from, chain } = fakeClient({ canEdit: { data: false, error: null } });
    expect(await service.getAgentProfile(ctx)).toEqual({ ok: true, data: { current: null, can_edit: false } });
    expect(from).toHaveBeenCalledWith("agent_profiles");
    expect(chain.select).toHaveBeenCalledWith("version, profile, created_at, created_by");
    expect(chain.eq).toHaveBeenCalledWith("company_id", company);
    expect(chain.order).toHaveBeenCalledWith("version", { ascending: false });
  });

  it("devuelve la versión vigente y can_edit", async () => {
    const { service, rpc } = fakeClient({ read: { data: row, error: null } });
    expect(await service.getAgentProfile(ctx)).toEqual({ ok: true, data: { current: row, can_edit: true } });
    expect(rpc).toHaveBeenCalledWith("can_edit_agent_profile", { p_company_id: company });
  });

  it("falla con PROVIDER_ERROR si la fila tiene formato roto", async () => {
    const { service } = fakeClient({ read: { data: { ...row, version: 0 }, error: null } });
    expect(await service.getAgentProfile(ctx)).toEqual({
      ok: false,
      error: { code: "PROVIDER_ERROR", message: "La versión guardada tiene un formato inesperado.", retryable: false },
    });
  });

  it("falla con PROVIDER_UNAVAILABLE si la lectura da error", async () => {
    const { service } = fakeClient({ read: { data: null, error: { message: "down" } } });
    expect(await service.getAgentProfile(ctx)).toEqual({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "No pudimos leer la configuración del agente. Probá de nuevo en un rato.", retryable: true },
    });
    expectLogged("falló la lectura de agent_profiles", { code: undefined, message: "down" });
  });

  it("falla con PROVIDER_UNAVAILABLE si la lectura tira excepción", async () => {
    const { service } = fakeClient({ readThrows: true });
    expect(await service.getAgentProfile(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expectLogged("excepción al leer el perfil", { code: undefined, message: "boom" });
  });

  it("falla con PROVIDER_UNAVAILABLE si can_edit da error", async () => {
    const { service } = fakeClient({ canEdit: { data: null, error: { message: "down", code: "08006" } } });
    expect(await service.getAgentProfile(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expectLogged("falló can_edit_agent_profile", { code: "08006", message: "down" });
  });

  it("no anota nada en el log cuando la lectura sale bien", async () => {
    const { service } = fakeClient({ read: { data: row, error: null } });
    await service.getAgentProfile(ctx);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("saveCompanyProfile", () => {
  const input = { base_version: null, profile };

  it("rechaza un ctx inválido (sin action_id)", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveCompanyProfile(ctx as never, input);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza un perfil inválido con el mensaje del primer problema", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveCompanyProfile(actionCtx, { base_version: null, profile: { ...profile, offering: "  " } });
    expect(r).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Completá qué vende la empresa", retryable: false },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza si el actor no es una persona", async () => {
    const { service, rpc } = fakeClient({});
    const r = await service.saveCompanyProfile({ ...actionCtx, actor_type: "system" }, input);
    expect(r).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Solo una persona admin puede cambiar el agente.", retryable: false },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("llama al rpc con company_id, action_id y el perfil normalizado", async () => {
    const { service, rpc } = fakeClient({ save: { data: { version: 3, created: true }, error: null } });
    const messy = { ...profile, offering: "  Alimentos  ", call_window: { ...profile.call_window, days: [5, 1, 1, 3] } };
    const r = await service.saveCompanyProfile(actionCtx, { base_version: 2, profile: messy });
    expect(r).toEqual({ ok: true, data: { version: 3, created: true } });
    expect(rpc).toHaveBeenCalledWith("save_agent_profile", {
      p_company_id: company,
      p_action_id: actionCtx.action_id,
      p_base_version: 2,
      p_profile: { ...profile, call_window: { ...profile.call_window, days: [1, 3, 5] } },
    });
  });

  const dbError = (message: string, code?: string) => ({ data: null, error: { message, code } });
  const cases: [string, unknown, string, string, boolean][] = [
    ["código 42501", dbError("lo que sea", "42501"), "FORBIDDEN", "Solo una persona admin de la empresa puede cambiar el agente.", false],
    ["mensaje FORBIDDEN", dbError("FORBIDDEN: not admin"), "FORBIDDEN", "Solo una persona admin de la empresa puede cambiar el agente.", false],
    ["CONFLICT stale", dbError("CONFLICT: stale base version"), "CONFLICT", "Alguien guardó cambios mientras editabas. Recargá la página para ver la última versión.", false],
    ["CONFLICT otro", dbError("CONFLICT: action reused"), "CONFLICT", "Este guardado ya se usó con otros datos. Recargá la página y probá de nuevo.", false],
    ["VALIDATION_ERROR", dbError("VALIDATION_ERROR: bad"), "VALIDATION_ERROR", "Hay datos con un formato inválido. Revisalos y probá de nuevo.", false],
    ["error desconocido", dbError("connection reset"), "PROVIDER_UNAVAILABLE", "No pudimos guardar. Revisá tu conexión y probá de nuevo.", true],
  ];
  it.each(cases)("traduce el error de la base: %s", async (_name, save, code, message, retryable) => {
    const { service } = fakeClient({ save });
    expect(await service.saveCompanyProfile(actionCtx, input)).toEqual({ ok: false, error: { code, message, retryable } });
    // Los errores que reconocemos ya dicen qué pasó: solo el desconocido se anota en el log.
    expect(consoleError).toHaveBeenCalledTimes(code === "PROVIDER_UNAVAILABLE" ? 1 : 0);
  });

  it("anota en el log el error desconocido de la base (solo código y mensaje)", async () => {
    const { service } = fakeClient({ save: dbError("connection reset", "08006") });
    await service.saveCompanyProfile(actionCtx, input);
    expectLogged("save_agent_profile devolvió un error desconocido", { code: "08006", message: "connection reset" });
  });

  it("falla con PROVIDER_UNAVAILABLE si el rpc tira excepción", async () => {
    const { service } = fakeClient({ saveThrows: true });
    expect(await service.saveCompanyProfile(actionCtx, input)).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", retryable: true },
    });
    expectLogged("excepción al llamar a save_agent_profile", { code: undefined, message: "boom" });
  });

  it("falla con PROVIDER_ERROR si la respuesta es inesperada", async () => {
    const { service } = fakeClient({ save: { data: { version: "x" }, error: null } });
    expect(await service.saveCompanyProfile(actionCtx, input)).toEqual({
      ok: false,
      error: { code: "PROVIDER_ERROR", message: "La base respondió algo inesperado al guardar.", retryable: false },
    });
  });
});
