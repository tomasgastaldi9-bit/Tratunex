import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrderSchema, type OrderPayment } from "../../../contracts/purchase-orders";

vi.mock("./supplier-view", () => ({ SuppliersFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrdersListView, PurchaseOrderView } from "./purchase-order-view";

const company = { id: "10000000-0000-4000-8000-000000000001", name: "Empresa ficticia" };
const order = PurchaseOrderSchema.parse({ id: "80000000-0000-4000-8000-000000000001", company_id: company.id,
  purchase_request_id: "50000000-0000-4000-8000-000000000001", supplier_quote_id: "60000000-0000-4000-8000-000000000001",
  supplier_contact_id: "20000000-0000-4000-8000-000000000001", product: "Insumos ficticios", quantity: 5, unit: "unidades",
  supplier_name: "Proveedor ficticio", quote_source: "web", quoted_unit_price: "2.00", quoted_total: "10.00", quoted_currency: "ARGt",
  amount_atomic: "10000000000000000000", pricing_status: "ready", status: "awaiting_approval", version: 1,
  wallet: { chain: "arbitrum", address: `0x${"ab".repeat(20)}` }, wallet_version: 1, approved_by: null, approved_at: null,
  created_at: "2026-11-07T15:00:00Z", updated_at: "2026-11-07T15:00:00Z" });
const approved = { ...order, status: "approved" as const, version: 2, approved_by: "30000000-0000-4000-8000-000000000001", approved_at: "2026-11-07T15:01:00Z" };

describe("ORD03: lectura de órdenes y aprobación humana", () => {
  it("lista vacía orienta a una compra sin solicitar UUID", () => {
    const html = renderToStaticMarkup(<OrdersListView company={company} orders={[]} />);
    expect(html).toContain("Todavía no hay órdenes de compra");
    expect(html).toContain('href="/purchases/new"');
    expect(html).not.toContain("<form");
  });

  it("aprobada no se presenta como pagada", () => {
    const html = renderToStaticMarkup(<OrdersListView company={company} orders={[approved]} />);
    expect(html).toContain("Aprobada");
    expect(html).not.toContain("Pagada");
  });

  it("sin PAY02 el botón de pago está deshabilitado y la actualización es separada", () => {
    const html = renderToStaticMarkup(<PurchaseOrderView company={company} order={order} paymentAvailable={false} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar y pagar<\/button>/);
    expect(html).toContain("El servicio de pagos está pendiente de integración");
    expect(html).toContain("Actualizar datos de la orden");
    expect(html).toContain("ARGt 10,00");
    expect(html).toContain(order.wallet!.address);
  });

  it("ARS listo muestra el original y ARGt con equivalencia nominal explícita, sin habilitar PAY02", () => {
    const html = renderToStaticMarkup(<PurchaseOrderView company={company} order={{ ...order, quoted_currency: "ARS" }} paymentAvailable={false} />);
    expect(html).toContain("ARS 10,00");
    expect(html).toContain("ARGt 10</span>");
    expect(html).toContain("Equivalencia nominal del MVP: 1 ARS = 1 ARGt. No es una cotización de cambio de mercado.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar y pagar<\/button>/);
  });

  it("USD conserva su precio y conversión pendiente sin inventar una equivalencia", () => {
    const usd = { ...order, quoted_currency: "USD" as const, pricing_status: "pending_conversion" as const, amount_atomic: null };
    const html = renderToStaticMarkup(<PurchaseOrderView company={company} order={usd} paymentAvailable />);
    expect(html).toContain("USD 10,00");
    expect(html).toContain("Conversión pendiente");
    expect(html).not.toContain("Equivalencia nominal del MVP");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar y pagar<\/button>/);
  });

  it("ejemplo está rotulado y no contiene enlaces a proveedor ficticio", () => {
    const html = renderToStaticMarkup(<PurchaseOrderView company={company} order={{ ...order, quote_source: "example" }} paymentAvailable />);
    expect(html).toContain("Ejemplo: esta orden viene de una cotización de muestra.");
    expect(html).toContain('<span class="sr-only"> (datos de prueba)</span>');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar y pagar<\/button>/);
    expect(html).not.toContain('href="/suppliers/');
  });

  it("un hash unknown se presenta pendiente y confirmed muestra Pagada con su enlace exacto", () => {
    const hash = `0x${"12".repeat(32)}`;
    const payment: OrderPayment = { id: "90000000-0000-4000-8000-000000000001", status: "unknown", tx_hash: hash,
      explorer_url: `https://arbiscan.io/tx/${hash}`, amount_atomic: order.amount_atomic!, chain: "arbitrum", token: "ARGt" };
    const unknown = renderToStaticMarkup(<PurchaseOrderView company={company} order={approved} payment={payment} paymentAvailable />);
    expect(unknown).toContain("Verificación pendiente");
    expect(unknown).not.toContain("Pagada");
    const confirmed = renderToStaticMarkup(<PurchaseOrderView company={company} order={approved} payment={{ ...payment, status: "confirmed" }} paymentAvailable />);
    expect(confirmed).toContain("Pagada");
    expect(confirmed).toContain(`href="https://arbiscan.io/tx/${hash}"`);
  });
});
