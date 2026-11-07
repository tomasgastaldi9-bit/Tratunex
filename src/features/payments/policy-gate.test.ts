import { describe, expect, it, vi } from "vitest";
import { checkBeforePayment } from "./policy-gate";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const };
const input = { amount_atomic: "100", supplier_contact_id: "30000000-0000-4000-8000-000000000001" };
describe("reglas antes de pagar", () => {
  it("permite continuar solo si Vale devuelve auto_pay", async () => {
    const check = vi.fn().mockResolvedValue({ ok: true, data: { decision: "auto_pay", reason: "Permitido" } });
    expect(await checkBeforePayment(ctx, input, check)).toEqual({ ok: true, data: { decision: "auto_pay", reason: "Permitido" } });
    expect(check).toHaveBeenCalledWith(ctx, input);
  });
  it("falla cerrado si se rechaza, requiere aprobación o no se puede consultar", async () => {
    for (const decision of ["rejected", "needs_approval"] as const) {
      const result = await checkBeforePayment(ctx, input, async () => ({ ok: true, data: { decision, reason: "No automático" } }));
      expect(result.ok).toBe(false);
    }
    expect((await checkBeforePayment(ctx, input, async () => { throw new Error("RPC falló"); })).ok).toBe(false);
  });
});
