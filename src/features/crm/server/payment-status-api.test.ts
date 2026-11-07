import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), reconcile: vi.fn(), pay: vi.fn(), resume: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../platform/server/public", () => ({ getCompanyContext: mocks.context }));
vi.mock("./purchase-orders-public", () => ({ approveAndPayPurchaseOrder: mocks.pay, resumeApprovedPayment: mocks.resume, createPurchaseOrder: vi.fn(), getPurchaseOrder: vi.fn(), listPurchaseOrders: vi.fn(), refreshPurchaseOrder: vi.fn() }));
vi.mock("@/features/payments/server/public", () => ({ reconcileOrderPayment: mocks.reconcile }));
import { reconcileOrderPaymentRequest, resumeOrderPaymentRequest } from "./purchase-orders-api";

const company_id = "10000000-0000-4000-8000-000000000001", actor_id = "20000000-0000-4000-8000-000000000001", order_id = "30000000-0000-4000-8000-000000000001";
const request = (origin = "https://tratunex.example") => new Request("https://tratunex.example/api/crm/orders/status", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action_id: "status", input: {} }),
});
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ ok: true, data: { company_id, actor_id, actor_type: "user" } }); mocks.reconcile.mockResolvedValue({ ok: true, data: { payment: null } }); });
describe("endpoint de consulta de pago", () => {
  it("usa la identidad de sesión y nunca invoca la ruta de pago", async () => {
    const response = await reconcileOrderPaymentRequest(request(), order_id);
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith({ company_id, actor_id, actor_type: "user" }, { order_id });
    expect(mocks.pay).not.toHaveBeenCalled();
  });
  it("rechaza otro origen antes de consultar sesión o pago", async () => {
    expect((await reconcileOrderPaymentRequest(request("https://other.example"), order_id)).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled(); expect(mocks.pay).not.toHaveBeenCalled();
  });
  it("reanuda solo con identidad de sesión y la acción explícita", async () => {
    mocks.resume.mockResolvedValueOnce({ ok: true, data: { order: {}, payment: {} } });
    expect((await resumeOrderPaymentRequest(request(), order_id)).status).toBe(200);
    expect(mocks.resume).toHaveBeenCalledWith({ company_id, actor_id, actor_type: "user", action_id: "status" }, { order_id });
    expect(mocks.pay).not.toHaveBeenCalled();
    expect((await resumeOrderPaymentRequest(request("https://other.example"), order_id)).status).toBe(403);
    expect(mocks.resume).toHaveBeenCalledTimes(1);
  });
});
