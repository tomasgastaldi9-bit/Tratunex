import { describe, expect, it, vi } from "vitest";
import { payInvoiceWithPorts } from "./pay-service";
import type { PreparedIdentity } from "./prepared-payment";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const, action_id: "action" };
const order_id = "30000000-0000-4000-8000-000000000001";
const identity: PreparedIdentity = { id: "40000000-0000-4000-8000-000000000001", companyId: ctx.company_id, orderId: order_id, actionId: ctx.action_id, sender: "0x0000000000000000000000000000000000000001", recipient: "0x0000000000000000000000000000000000000002", amount: BigInt(100), nonce: 7 };
const payment = { id: identity.id, status: "unknown" as const, tx_hash: null, explorer_url: null, amount_atomic: "100", token: "ARGt" as const, chain: "arbitrum" as const };
function ports() {
  return { verifySession: vi.fn().mockResolvedValue(true), getOrderVersion: vi.fn().mockResolvedValue(2), getPendingNonce: vi.fn().mockResolvedValue(7), claim: vi.fn().mockResolvedValue({ ok: true, identity }), submit: vi.fn().mockResolvedValue({ state: "unknown" }), reconcile: vi.fn().mockResolvedValue({ state: "unknown" }), readPayment: vi.fn().mockResolvedValue(payment) };
}
describe("orquestación del pago", () => {
  it("autoriza antes de reclamar y devuelve solamente el estado público persistido", async () => {
    const deps = ports();
    expect(await payInvoiceWithPorts(ctx, { order_id }, deps)).toEqual({ ok: true, data: { payment } });
    expect(deps.claim).toHaveBeenCalledWith(ctx, { order_id, orderVersion: 2, pendingNonce: 7 });
    expect(deps.submit).toHaveBeenCalledWith(identity);
    expect(deps.reconcile).toHaveBeenCalledWith(identity);
    expect(deps.verifySession.mock.invocationCallOrder[0]).toBeLessThan(deps.claim.mock.invocationCallOrder[0]);
  });
  it("no reclama ni firma cuando la sesión no corresponde", async () => {
    const deps = ports(); deps.verifySession.mockResolvedValue(false);
    expect((await payInvoiceWithPorts(ctx, { order_id }, deps)).ok).toBe(false);
    expect(deps.claim).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  });
  it("falla cerrado cuando no se obtiene la reserva o sus datos no coinciden", async () => {
    for (const result of [{ ok: false }, { ok: true, identity: { ...identity, orderId: "other" } }]) {
      const deps = ports(); deps.claim.mockResolvedValue(result);
      expect((await payInvoiceWithPorts(ctx, { order_id }, deps)).ok).toBe(false);
      expect(deps.submit).not.toHaveBeenCalled();
    }
  });
});
