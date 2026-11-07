import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("módulos públicos de pago y órdenes", () => {
  it.each(["payments", "orders"] as const)("carga ambos módulos desde %s sin ciclo de inicialización", async entry => {
    vi.stubEnv("PAYMENT_ENABLED", "true");
    if (entry === "payments") await import("./public");
    else await import("../../crm/server/public");
    const payments = await import("./public");
    const orders = await import("../../crm/server/purchase-orders-public");
    expect(typeof payments.payInvoice).toBe("function");
    expect(typeof orders.approveAndPayPurchaseOrder).toBe("function");
  }, 30000);
});
