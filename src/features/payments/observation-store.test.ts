import { describe, expect, it, vi } from "vitest";
import { createObservationStore } from "./observation-store";

const identity = { companyId: "10000000-0000-4000-8000-000000000001", orderId: "20000000-0000-4000-8000-000000000001", id: "30000000-0000-4000-8000-000000000001" };
const hash = `0x${"a".repeat(64)}` as const;
describe("persistencia de observación", () => {
  it("envía el estado para la reserva y devuelve lo registrado", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "confirmed", error: null });
    const store = createObservationStore({ rpc }, identity);
    expect(await store.persist("confirmed", hash)).toBe("confirmed");
    expect(rpc).toHaveBeenCalledWith("record_payment_observation", { p_company: identity.companyId, p_order: identity.orderId, p_reservation: identity.id, p_hash: hash, p_status: "confirmed" });
  });
  it("rechaza respuestas inválidas o errores", async () => {
    const store = createObservationStore({ rpc: async () => ({ data: "paid", error: null }) }, identity);
    await expect(store.persist("pending", hash)).rejects.toThrow();
  });
});
