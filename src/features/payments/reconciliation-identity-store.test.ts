import { describe, expect, it, vi } from "vitest";
import { readReconciliationIdentity } from "./reconciliation-identity-store";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

const input = { companyId: "10000000-0000-4000-8000-000000000001", actorId: "20000000-0000-4000-8000-000000000001", orderId: "30000000-0000-4000-8000-000000000001" };
const row = { id: "40000000-0000-4000-8000-000000000001", action_id: "original", chain_id: 42161, sender: `0x${"1".repeat(40)}`, nonce: 7, token: TWIN_ARGT_ARBITRUM, destination: `0x${"2".repeat(40)}`, amount_atomic: "100" };
describe("identidad para conciliar", () => {
  it("reconstruye la reserva original sin aceptar datos del cliente", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    expect(await readReconciliationIdentity({ rpc }, input)).toMatchObject({ id: row.id, actionId: row.action_id, nonce: 7, amount: BigInt(100) });
    expect(rpc).toHaveBeenCalledWith("read_payment_reconciliation_identity", { p_company: input.companyId, p_actor: input.actorId, p_order: input.orderId });
  });
  it("distingue ausencia y falla cerrada ante respuesta incompatible", async () => {
    expect(await readReconciliationIdentity({ rpc: async () => ({ data: null, error: null }) }, input)).toBeNull();
    await expect(readReconciliationIdentity({ rpc: async () => ({ data: { ...row, sender: row.destination }, error: null }) }, input)).rejects.toThrow();
    await expect(readReconciliationIdentity({ rpc: async () => ({ data: null, error: { message: "error" } }) }, input)).rejects.toThrow();
  });
});
