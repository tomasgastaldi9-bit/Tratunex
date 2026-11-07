import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), make: vi.fn(), account: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.account }));
vi.mock("../payment-entry", () => ({ executeConfiguredPayment: mocks.execute }));
vi.mock("./demo-ports", () => ({ createDemoPaymentPorts: mocks.make }));
vi.mock("../demo-config", () => ({ demoPaymentConfigured: () => false }));
import { payDemoOrder } from "./demo-public";
describe("puerto de demo desactivado", () => {
  it("no crea puertos ni inicia pago si la configuración no habilita la demo", async () => {
    const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const, action_id: "test" };
    expect(await payDemoOrder(ctx, { order_id: "30000000-0000-4000-8000-000000000001" })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.make).not.toHaveBeenCalled();
  });
});
