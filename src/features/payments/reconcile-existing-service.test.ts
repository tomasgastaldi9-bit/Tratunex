import { describe, expect, it, vi } from "vitest";
import { reconcileExistingPayment } from "./reconcile-existing-service";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const };
const order_id = "30000000-0000-4000-8000-000000000001";
const identity = { id: "40000000-0000-4000-8000-000000000001", companyId: ctx.company_id, orderId: order_id, actionId: "original", sender: `0x${"1".repeat(40)}` as const, recipient: `0x${"2".repeat(40)}` as const, amount: BigInt(100), nonce: 7 };
const payment = { id: identity.id, status: "pending", tx_hash: null, explorer_url: null, amount_atomic: "100", token: "ARGt", chain: "arbitrum" };
const make = () => ({ verifySession: vi.fn().mockResolvedValue(true), readIdentity: vi.fn().mockResolvedValue(identity), reconcile: vi.fn().mockResolvedValue({ state: "pending", chain_checked: true }), readPayment: vi.fn().mockResolvedValue(payment) });

describe("conciliación sin nueva transferencia", () => {
  it("autoriza y concilia la misma reserva antes de devolver el estado persistido", async () => {
    const ports = make();
    expect(await reconcileExistingPayment(ctx, { order_id }, ports)).toEqual({ ok: true, data: { payment, chain_checked: true } });
    expect(ports.reconcile).toHaveBeenCalledWith(identity);
    expect(ports.verifySession.mock.invocationCallOrder[0]).toBeLessThan(ports.readIdentity.mock.invocationCallOrder[0]);
  });
  it("nunca concilia sin sesión o con identidad de otra orden", async () => {
    const ports = make(); ports.verifySession.mockResolvedValueOnce(false);
    expect((await reconcileExistingPayment(ctx, { order_id }, ports)).ok).toBe(false);
    expect(ports.readIdentity).not.toHaveBeenCalled();
    ports.readIdentity.mockResolvedValueOnce({ ...identity, orderId: "other" });
    expect((await reconcileExistingPayment(ctx, { order_id }, ports)).ok).toBe(false);
    expect(ports.reconcile).not.toHaveBeenCalled();
  });
  it("si no hay reserva marcada solo lee el estado guardado sin crearla", async () => {
    const ports = make(); ports.readIdentity.mockResolvedValueOnce(null);
    expect(await reconcileExistingPayment(ctx, { order_id }, ports)).toEqual({ ok: true, data: { payment, chain_checked: false } });
    expect(ports.reconcile).not.toHaveBeenCalled();
  });
  it("si falla la red conserva el último estado guardado sin inventar confirmación", async () => {
    const ports = make(); ports.reconcile.mockRejectedValueOnce(new Error("network"));
    expect(await reconcileExistingPayment(ctx, { order_id }, ports)).toEqual({ ok: true, data: { payment, chain_checked: false } });
  });
});
