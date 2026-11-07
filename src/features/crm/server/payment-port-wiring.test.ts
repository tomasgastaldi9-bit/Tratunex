import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pay: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getAuthorizedCrmClient: mocks.client }));
vi.mock("@/features/payments/server/public", () => ({ payInvoice: mocks.pay, paymentEnabled: () => process.env.PAYMENT_ENABLED === "true" }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("conexión del puerto de pagos a órdenes", () => {
  it("por defecto no habilita el botón ni llama al pago", async () => {
    vi.stubEnv("PAYMENT_ENABLED", "");
    const orders = await import("./purchase-orders-public");
    expect(orders.orderPaymentAvailable).toBe(false);
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it("habilita el puerto solo con configuración explícita", async () => {
    vi.stubEnv("PAYMENT_ENABLED", "true");
    const orders = await import("./purchase-orders-public");
    expect(orders.orderPaymentAvailable).toBe(true);
    expect(mocks.pay).not.toHaveBeenCalled();
  });
});
