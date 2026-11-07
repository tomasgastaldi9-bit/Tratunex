import { describe, expect, it, vi } from "vitest";
import { preflightOrder } from "./order-preflight";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const };
const orderId = "30000000-0000-4000-8000-000000000001", supplierId = "40000000-0000-4000-8000-000000000001";
const wallet = { chain: "arbitrum" as const, address: "0x0000000000000000000000000000000000000002" };
const order = { id: orderId, company_id: ctx.company_id, supplier_contact_id: supplierId, amount_atomic: "100", pricing_status: "ready" as const, status: "approved" as const, version: 2, wallet, wallet_version: 1, approved_by: ctx.actor_id, approved_at: "2026-11-07T17:00:00.000Z", quote_source: "call" as const };
const supplier = { id: supplierId, company_id: ctx.company_id, collection_wallet: wallet, wallet_version: 1, do_not_contact: false };
const deps = () => ({ getOrder: vi.fn().mockResolvedValue({ ok: true, data: { order } }), getSupplier: vi.fn().mockResolvedValue({ ok: true, data: { supplier } }), checkPolicy: vi.fn().mockResolvedValue({ ok: true, data: { decision: "auto_pay", reason: "ok" } }) });
describe("verificación preliminar de orden", () => {
  it("consulta orden, proveedor y política sin autorizar firma", async () => {
    const d = deps();
    expect(await preflightOrder(ctx, orderId, d)).toMatchObject({ ok: true, data: { order_id: orderId, wallet_version: 1, amount_atomic: "100" } });
    expect(d.checkPolicy).toHaveBeenCalledWith(ctx, { amount_atomic: "100", supplier_contact_id: supplierId });
  });
  it("falla ante orden de otra empresa, aprobación ausente o importe pendiente", async () => {
    for (const changes of [{ company_id: "other" }, { status: "awaiting_approval" }, { amount_atomic: null }, { quote_source: "example" }]) {
      const d = deps(); d.getOrder.mockResolvedValue({ ok: true, data: { order: { ...order, ...changes } } });
      expect((await preflightOrder(ctx, orderId, d)).ok).toBe(false);
      expect(d.checkPolicy).not.toHaveBeenCalled();
    }
  });
  it("falla si cambió la billetera", async () => {
    const d = deps(); d.getSupplier.mockResolvedValue({ ok: true, data: { supplier: { ...supplier, wallet_version: 2 } } });
    expect((await preflightOrder(ctx, orderId, d)).ok).toBe(false);
  });
  it("identifica la aprobación pendiente de comprobar bajo bloqueo sin autorizar el pago", async () => {
    const needs = deps(); needs.checkPolicy.mockResolvedValue({ ok: true, data: { decision: "needs_approval", reason: "requiere aprobación" } });
    expect(await preflightOrder(ctx, orderId, needs)).toMatchObject({ ok: true, data: { order_id: orderId, policy_decision: "needs_approval", authorization: "unverified" } });
  });
  it("rechaza reglas denegadas y errores incluso con aprobación", async () => {
    const rejected = deps(); rejected.checkPolicy.mockResolvedValue({ ok: true, data: { decision: "rejected", reason: "rechazado" } });
    expect((await preflightOrder(ctx, orderId, rejected)).ok).toBe(false);
    const unavailable = deps(); unavailable.checkPolicy.mockRejectedValue(new Error("offline"));
    expect((await preflightOrder(ctx, orderId, unavailable)).ok).toBe(false);
  });
});
