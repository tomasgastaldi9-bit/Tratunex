import { describe, expect, it } from "vitest";
import { payInvoiceUnavailable } from "./pay-invoice-port";

const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const, action_id: "purchase-1" };
describe("contrato público de pagos sin integración", () => {
  it("no habilita pagos aunque el contexto y la orden sean válidos", async () => {
    expect(await payInvoiceUnavailable(ctx, { order_id: "30000000-0000-4000-8000-000000000001" })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
  it("rechaza contexto o identificador inválido", async () => {
    expect(await payInvoiceUnavailable({ ...ctx, action_id: "" }, { order_id: "bad" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
