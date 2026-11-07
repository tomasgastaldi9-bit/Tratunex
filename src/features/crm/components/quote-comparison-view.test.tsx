import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplierQuoteSchema, type SupplierQuote } from "../../../contracts/supplier-quotes";
import type { QuoteComparison } from "../quote-comparison";

// The frame/navigation is verified separately in browser tests. Render this
// comparison with the real visual controls and no Next router/session dependency.
vi.mock("./supplier-view", () => ({ SuppliersFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./purchase-order-create-button", () => ({ CreatePurchaseOrderButton: ({ companyId, supplierQuoteId }: { companyId: string; supplierQuoteId: string }) =>
  <button data-order-company={companyId} data-order-quote={supplierQuoteId}>Crear orden de compra</button> }));

import { QuoteComparisonAccessState, QuoteComparisonStart, QuoteComparisonView } from "./quote-comparison-view";

const company = { id: "10000000-0000-4000-8000-000000000001", name: "Empresa ficticia" };
const quoteId = "60000000-0000-4000-8000-000000000001";
const supplierId = "20000000-0000-4000-8000-000000000001";
const callId = "70000000-0000-4000-8000-000000000001";
function quote(overrides: Partial<SupplierQuote> = {}): SupplierQuote {
  return SupplierQuoteSchema.parse({ id: quoteId, company_id: company.id, purchase_request_id: "50000000-0000-4000-8000-000000000001",
    supplier_contact_id: supplierId, unit_price: { amount_atomic: "9007199254740993", currency: "USD", decimals: 2 },
    can_supply: "unknown", available_quantity: null, minimum_order_quantity: 4, lead_time_days: null, lead_time_text: null,
    price_includes_vat: "unknown", delivery_included: "unknown", accepts_argt: "unknown", payment_terms: null,
    notes: null, summary: "Cotización ficticia para verificación", source: { kind: "example", label: "Cotización de ejemplo" },
    created_at: "2026-11-07T15:00:00Z", ...overrides });
}
function comparison(overrides: Partial<QuoteComparison> = {}): QuoteComparison {
  return { purchase: { id: "50000000-0000-4000-8000-000000000001", product: "Vasos ficticios", quantity: 5, unit: "unidades",
    needed_by: "2026-11-09", budget_atomic: "100000000000000000000", zone: "Zona ficticia", status: "open", created_at: "2026-11-07T15:00:00Z", created_by: null },
    rows: [{ quote: quote(), supplier: { id: supplierId, name: "Proveedor ficticio", organization: "Organización ficticia" } }],
    quotes_status: "ready", mode: "persisted", recommendation: { status: "ready", data: { recommended_quote_id: quoteId,
      ranking: [{ quote_id: quoteId, supplier_contact_id: supplierId, supplier_name: "Proveedor ficticio", position: 1,
        eligible: true, total_atomic: null, reasons: ["Motivo entregado por el servicio"], policy: null }],
      explanation: "Explicación entregada por el servicio", explanation_source: "rules" } }, ...overrides };
}
const render = (value: QuoteComparison) => renderToStaticMarkup(<QuoteComparisonView company={company} comparison={value} />);

describe("ORD02: comparación presentada con fuentes y estados explícitos", () => {
  it("presenta tabla semántica, cantidades e importes exactos sin float", () => {
    const html = render(comparison());
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("USD 90.071.992.547.409,93");
    expect(html).toContain("USD 450.359.962.737.049,65");
    expect(html).toContain("Stock sin confirmar");
    expect(html).toContain("Plazo pendiente");
    expect(html).toContain("IVA sin confirmar");
    expect(html).toContain("Motivo entregado por el servicio");
    expect(html).toContain("Califica en el ranking");
    expect(html).toContain("Reglas");
    expect(html).not.toContain("<button");
  });

  it("muestra la procedencia real y admite ranking sin proveedor elegible", () => {
    const value = comparison();
    if (value.recommendation.status !== "ready") throw new Error("Falta ranking");
    value.recommendation.data.explanation_source = "ai";
    value.recommendation.data.recommended_quote_id = null;
    value.recommendation.data.ranking[0].eligible = false;
    value.recommendation.data.ranking[0].policy = { decision: "needs_approval", reason: "Revisión humana necesaria" };
    const html = render(value);
    expect(html).toContain(">IA<");
    expect(html).toContain("Sin proveedor recomendado");
    expect(html).toContain("No califica en el ranking");
    expect(html).toContain("Requiere aprobación: Revisión humana necesaria");
    expect(html).not.toContain("data-recommended");
    expect(render({ ...value, mode: "example" })).not.toContain(">IA<");
  });

  it("resalta solo la recomendación ready y conserva la explicación recibida", () => {
    const html = render(comparison());
    expect([...html.matchAll(/data-recommended="true"/g)]).toHaveLength(2); // desktop + mobile; CSS exposes one representation.
    expect(html).toContain("Explicación entregada por el servicio");
    expect(html).toContain(`/suppliers/${supplierId}`);
    for (const recommendation of [{ status: "pending", message: "Esperando al servicio de recomendación" },
      { status: "error", error: { code: "PROVIDER_UNAVAILABLE", message: "Servicio no disponible", retryable: true } }] as const) {
      const unavailable = render(comparison({ recommendation }));
      expect(unavailable).not.toContain("data-recommended");
      expect(unavailable).not.toContain("Proveedor recomendado");
    }
  });

  it("el ejemplo es ilustrativo, rotula cada origen y evita vínculos a IDs ficticios", () => {
    const html = render(comparison({ mode: "example" }));
    expect(html).toContain("Ejemplo: comparación con datos de muestra.");
    expect(html).toContain('<span class="sr-only"> (datos de prueba)</span>');
    expect(html).toContain("Sin registro de origen (datos de prueba)");
    expect(html).toContain(">Recomendación<");
    expect(html).not.toContain('href="/suppliers/');
    expect(html).not.toContain('href="/calls/');
    const illustrativeCall = comparison({ mode: "example", rows: [{ quote: quote({ source: { kind: "call", call_id: callId, transport: "phone" } }),
      supplier: { id: supplierId, name: "Proveedor ficticio", organization: null } }] });
    expect(render(illustrativeCall)).not.toContain("Llamada real");
    expect(render(illustrativeCall)).not.toContain('href="/calls/');
  });

  it.each([["mock", "Ejemplo"],["web", "Voz en el navegador"], ["phone", "Llamada real"]] as const)("distingue la fuente de llamada %s", (transport, label) => {
    const value = comparison();
    value.rows[0].quote = quote({ source: { kind: "call", call_id: callId, transport } });
    const html = render(value);
    expect(html).toContain(label);
    expect(html).toContain(`/calls/${callId}`);
  });

  it("conserva el vínculo de una fuente web real", () => {
    const value = comparison();
    value.rows[0].quote = quote({ source: { kind: "web", url: "https://cotizacion.example/fuente" } });
    expect(render(value)).toContain('href="https://cotizacion.example/fuente"');
  });

  it("conecta la creación solo a cotizaciones guardadas y no envía datos de dinero o wallet", () => {
    const value = comparison();
    value.rows[0].quote = quote({ source: { kind: "web", url: "https://cotizacion.example/fuente" } });
    const html = render(value);
    expect([...html.matchAll(/data-order-quote=/g)]).toHaveLength(2);
    expect(html).toContain(`data-order-company="${company.id}"`);
    expect(html).toContain(`data-order-quote="${quoteId}"`);
    expect(html).not.toContain("data-order-amount");
    expect(html).not.toContain("data-order-wallet");
    expect(render({ ...value, mode: "example" })).not.toContain("Crear orden de compra");
    expect(render(comparison())).not.toContain("Crear orden de compra");
  });

  it("total fuera de rango no hace caer toda la comparación", () => {
    const value = comparison();
    value.rows[0].quote = quote({ unit_price: { amount_atomic: "9".repeat(78), currency: "ARS", decimals: 0 } });
    expect(render(value)).toContain("Total fuera de rango");
  });

  it("presenta estados vacíos, cotizaciones pendientes y recomendación pendiente", () => {
    const pending = render(comparison({ rows: [], quotes_status: "pending", recommendation: { status: "pending", message: "Faltan cotizaciones" } }));
    expect(pending).toContain("Esperando cotizaciones");
    expect(pending).toContain("Recomendación pendiente");
    expect(pending).not.toContain("data-recommended");
    expect(render(comparison({ rows: [], recommendation: { status: "pending", message: "Faltan datos" } }))).toContain("Todavía no hay cotizaciones para esta compra");
  });

  it("inicio guía desde una compra sin exponer un formulario UUID y distingue errores de acceso", () => {
    const start = renderToStaticMarkup(<QuoteComparisonStart company={company} />);
    expect(start).toContain("Elegí una compra para comparar");
    expect(start).toContain("La comparación se abre desde una solicitud de compra guardada.");
    expect(start).not.toContain("<form");
    expect(start).not.toContain("purchase_request_id");
    expect(start).toContain('href="/purchases/new"');
    expect(start).toContain('href="/orders/quotes/example"');
    expect(renderToStaticMarkup(<QuoteComparisonAccessState code="FORBIDDEN" />)).toContain("Elegí una empresa");
    expect(renderToStaticMarkup(<QuoteComparisonAccessState code="NOT_FOUND" />)).toContain("Esta compra no está disponible");
    expect(renderToStaticMarkup(<QuoteComparisonAccessState code="PROVIDER_UNAVAILABLE" />)).toContain("No pudimos cargar la comparación");
  });
});
