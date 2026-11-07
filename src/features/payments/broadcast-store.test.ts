import { describe, expect, it, vi } from "vitest";
import { createBroadcastStore } from "./broadcast-store";

const identity = { companyId: "10000000-0000-4000-8000-000000000001", orderId: "20000000-0000-4000-8000-000000000001", id: "30000000-0000-4000-8000-000000000001", hash: `0x${"a".repeat(64)}` as const };
describe("marca durable de transmisión", () => {
  it("mapea la respuesta booleana del servidor y fija los datos de la reserva", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = createBroadcastStore({ rpc }, identity);
    expect(await store.markStarted()).toBe("acquired");
    expect(rpc).toHaveBeenCalledWith("mark_payment_broadcast", { p_company: identity.companyId, p_order: identity.orderId, p_reservation: identity.id, p_hash: identity.hash });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await store.markStarted()).toBe("already_started");
  });
  it("falla cerrado si hay timeout o respuesta ambigua", async () => {
    for (const response of [{ data: null, error: null }, { data: true, error: { message: "timeout" } }]) {
      const store = createBroadcastStore({ rpc: async () => response }, identity);
      await expect(store.markStarted()).rejects.toThrow();
    }
  });
});
