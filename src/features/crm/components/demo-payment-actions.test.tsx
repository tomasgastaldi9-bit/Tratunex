import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoPaymentActions } from "./demo-payment-actions";
import { PurchaseOrderSchema } from "../../../contracts/purchase-orders";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const order = PurchaseOrderSchema.parse({ id: "80000000-0000-4000-8000-000000000001", company_id: "10000000-0000-4000-8000-000000000001",
  purchase_request_id: "50000000-0000-4000-8000-000000000001", supplier_quote_id: "60000000-0000-4000-8000-000000000001", supplier_contact_id: "20000000-0000-4000-8000-000000000001",
  product: "Producto ficticio", quantity: 1, unit: "unidad", supplier_name: "Proveedor de prueba", quote_source: "example", quoted_unit_price: "1", quoted_total: "1", quoted_currency: "ARS",
  amount_atomic: "1000000000000000000", pricing_status: "ready", status: "awaiting_approval", version: 1, wallet: { chain: "arbitrum", address: "0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1" },
  wallet_version: 1, approved_by: null, approved_at: null, created_at: "2026-11-07T15:00:00Z", updated_at: "2026-11-07T15:00:00Z" });
describe("confirmación de pago de demo", () => {
  it("explica datos ficticios y pago real y exige confirmación antes de habilitar el botón", () => {
    const html = renderToStaticMarkup(<DemoPaymentActions order={order} payment={null} enabled />);
    expect(html).toContain("datos ficticios"); expect(html).toContain("transferencia real de 1 ARGt");
    expect(html).toContain("no se puede cancelar");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Enviar 1 ARGt de demo<\/button>/);
  });
  it("permite continuar una reserva no transmitida, pero no una transmisión ambigua", () => {
    const base = { id: "90000000-0000-4000-8000-000000000001", tx_hash: null, explorer_url: null, amount_atomic: "1000000000000000000", token: "ARGt" as const, chain: "arbitrum" as const };
    const reserved = renderToStaticMarkup(<DemoPaymentActions order={order} payment={{ ...base, status: "reserved" }} enabled />);
    expect(reserved).toContain("Continuar intento de demo");
    const unknown = renderToStaticMarkup(<DemoPaymentActions order={order} payment={{ ...base, status: "unknown" }} enabled />);
    expect(unknown).not.toContain("Continuar intento de demo");
    const disabled = renderToStaticMarkup(<DemoPaymentActions order={order} payment={{ ...base, status: "reserved" }} enabled={false} />);
    expect(disabled).not.toContain("Continuar intento de demo");
  });
});
