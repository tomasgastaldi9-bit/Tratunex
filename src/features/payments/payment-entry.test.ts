import { describe, expect, it, vi } from "vitest";
import { executeConfiguredPayment } from "./payment-entry";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const, action_id: "action" };
const input = { order_id: "30000000-0000-4000-8000-000000000001" };
describe("puerto de pago habilitado de forma explícita", () => {
  it.each([undefined, "", "false", "TRUE"])("no crea puertos con PAYMENT_ENABLED=%s", async flag => {
    const make = vi.fn();
    const result = await executeConfiguredPayment(flag, ctx, input, make);
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    expect(make).not.toHaveBeenCalled();
  });
  it("con habilitación explícita usa la orquestación con controles", async () => {
    const ports = { verifySession: vi.fn().mockResolvedValue(false), getOrderVersion: vi.fn(), getPendingNonce: vi.fn(), claim: vi.fn(), submit: vi.fn(), reconcile: vi.fn(), readPayment: vi.fn() };
    const result = await executeConfiguredPayment("true", ctx, input, () => ports);
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(ports.claim).not.toHaveBeenCalled(); expect(ports.submit).not.toHaveBeenCalled();
  });
  it("falla cerrado si la configuración de servidor no está disponible", async () => {
    expect(await executeConfiguredPayment("true", ctx, input, () => { throw new Error("secret"); })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
});
