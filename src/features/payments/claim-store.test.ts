import { describe, expect, it, vi } from "vitest";
import { claimPayment } from "./claim-store";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

const input = { companyId: "10000000-0000-4000-8000-000000000001", actorId: "20000000-0000-4000-8000-000000000001", orderId: "30000000-0000-4000-8000-000000000001", actionId: "action-2", orderVersion: 2, sender: "0x0000000000000000000000000000000000000001" as const, pendingNonce: 7 };
const row = { id: "40000000-0000-4000-8000-000000000001", state: "reserved", nonce: 7, action_id: "original-action", amount_atomic: "100", destination: "0x0000000000000000000000000000000000000002" };
describe("adaptador del claim", () => {
  it("usa configuración de servidor y conserva el action_id original al recuperar", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const result = await claimPayment({ rpc }, input);
    expect(result).toMatchObject({ ok: true, identity: { id: row.id, actionId: "original-action", amount: BigInt(100), nonce: 7 } });
    expect(rpc).toHaveBeenCalledWith("claim_order_payment", { p_company: input.companyId, p_actor: input.actorId, p_order: input.orderId, p_action: input.actionId, p_version: 2, p_chain: 42161, p_sender: input.sender, p_token: TWIN_ARGT_ARBITRUM, p_pending_nonce: 7 });
  });
  it("rechaza errores o respuestas malformadas", async () => {
    expect((await claimPayment({ rpc: async () => ({ data: { ...row, destination: input.sender }, error: null }) }, input)).ok).toBe(false);
    expect((await claimPayment({ rpc: async () => ({ data: null, error: { message: "timeout" } }) }, input)).ok).toBe(false);
  });
});
