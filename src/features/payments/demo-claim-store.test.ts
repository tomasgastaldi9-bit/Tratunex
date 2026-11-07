import { describe, expect, it, vi } from "vitest";
import { claimDemoPayment } from "./demo-claim-store";

const input = { companyId: "10000000-0000-4000-8000-000000000001", actorId: "20000000-0000-4000-8000-000000000001", orderId: "30000000-0000-4000-8000-000000000001", actionId: "demo-action", orderVersion: 1, sender: "0xD87f54a9bae54E4eE15A141D526532777F3D2c56" as const, pendingNonce: 7 };
const row = { id: "40000000-0000-4000-8000-000000000001", state: "reserved", nonce: 7, action_id: "demo-action", amount_atomic: "1000000000000000000", destination: "0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1" };
describe("adaptador de claim de demo", () => {
  it("no acepta monto ni destino del navegador y recupera la reserva", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    expect(await claimDemoPayment({ rpc }, input)).toMatchObject({ ok: true, identity: { id: row.id, amount: BigInt("1000000000000000000") } });
    expect(rpc).toHaveBeenCalledWith("claim_demo_order_payment", { p_company: input.companyId, p_actor: input.actorId, p_order: input.orderId, p_action: input.actionId, p_version: 1, p_sender: input.sender, p_pending_nonce: 7 });
  });
  it("rechaza un monto o destino distinto al autorizado", async () => {
    for (const value of [{ ...row, amount_atomic: "1" }, { ...row, destination: input.sender }]) {
      expect((await claimDemoPayment({ rpc: async () => ({ data: value, error: null }) }, input)).ok).toBe(false);
    }
  });
});
