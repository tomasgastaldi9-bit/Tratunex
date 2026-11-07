import { describe, expect, it, vi } from "vitest";
import { readPaymentWithPorts } from "./read-payment-service";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const };
const order_id = "30000000-0000-4000-8000-000000000001";
const payment = { id: "40000000-0000-4000-8000-000000000001", status: "unknown", tx_hash: null, explorer_url: null, amount_atomic: "100", token: "ARGt", chain: "arbitrum" };

describe("lectura de pago sin transmitir", () => {
  it("verifica la sesión antes de consultar el registro", async () => {
    const deps = { verifySession: vi.fn().mockResolvedValue(true), read: vi.fn().mockResolvedValue(payment) };
    expect(await readPaymentWithPorts(ctx, { order_id }, deps)).toEqual({ ok: true, data: { payment } });
    expect(deps.verifySession.mock.invocationCallOrder[0]).toBeLessThan(deps.read.mock.invocationCallOrder[0]);
  });
  it("distingue ausencia de pago de una falla y no consulta sin permiso", async () => {
    const deps = { verifySession: vi.fn().mockResolvedValue(true), read: vi.fn().mockResolvedValue(null) };
    expect(await readPaymentWithPorts(ctx, { order_id }, deps)).toEqual({ ok: true, data: { payment: null } });
    deps.read.mockRejectedValueOnce(new Error("internal"));
    expect(await readPaymentWithPorts(ctx, { order_id }, deps)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    deps.verifySession.mockResolvedValueOnce(false); deps.read.mockClear();
    expect(await readPaymentWithPorts(ctx, { order_id }, deps)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(deps.read).not.toHaveBeenCalled();
  });
  it("rechaza respuestas incompatibles y actores no humanos", async () => {
    const deps = { verifySession: vi.fn().mockResolvedValue(true), read: vi.fn().mockResolvedValue({ ...payment, amount_atomic: "-1" }) };
    expect((await readPaymentWithPorts(ctx, { order_id }, deps)).ok).toBe(false);
    deps.read.mockClear();
    expect((await readPaymentWithPorts({ ...ctx, actor_type: "system" }, { order_id }, deps)).ok).toBe(false);
    expect(deps.read).not.toHaveBeenCalled();
  });
});
