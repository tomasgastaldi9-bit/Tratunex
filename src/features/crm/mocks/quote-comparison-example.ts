import type { QuoteComparison } from "../quote-comparison";
import { SupplierQuoteSchema } from "../../../contracts/supplier-quotes";

/** Todo este escenario es ficticio; nunca se persiste ni se usa para pagar. */
export function createQuoteComparisonExample(company_id: string): QuoteComparison {
  const purchase = {
    id: "00000000-0000-4000-8000-000000000100", product: "Vasos de papel de 240 cc",
    quantity: 500, unit: "unidades", needed_by: "2026-11-09", zone: "CABA",
    budget_atomic: "100000000000000000000000", status: "open" as const,
    created_at: "2026-11-07T12:00:00Z", created_by: null,
  };
  const options = [
    { name: "Sur Envases · ficticio", price: "18000", stock: 1000, days: 2, accepts: "yes" as const, reason: "Precio ilustrativo menor, stock suficiente y acepta ARGt." },
    { name: "Papel del Centro · ficticio", price: "19500", stock: 700, days: 1, accepts: "unknown" as const, reason: "Entrega ilustrativa más rápida; falta confirmar si acepta ARGt." },
    { name: "Vasos del Río · ficticio", price: "17000", stock: 300, days: 4, accepts: "no" as const, reason: "Precio ilustrativo menor; no cubre la cantidad y no acepta ARGt." },
  ];
  const rows = options.map((option, index) => {
    const supplierId = `00000000-0000-4000-8000-00000000020${index}`;
    const quote = SupplierQuoteSchema.parse({
      id: `00000000-0000-4000-8000-00000000030${index}`, company_id,
      purchase_request_id: purchase.id, supplier_contact_id: supplierId,
      unit_price: { amount_atomic: option.price, currency: "ARS", decimals: 2 },
      can_supply: option.stock >= purchase.quantity ? "yes" : "partial",
      available_quantity: option.stock, minimum_order_quantity: 100,
      lead_time_days: option.days, lead_time_text: `${option.days} días (ejemplo)`,
      price_includes_vat: "unknown", delivery_included: "unknown", accepts_argt: option.accepts,
      payment_terms: null, notes: "Datos de prueba. No es una oferta de un proveedor real.",
      summary: "Cotización ficticia para revisar la pantalla de comparación.",
      source: { kind: "example", label: "Datos de prueba" }, created_at: "2026-11-07T12:00:00Z",
    });
    return { quote, supplier: { id: supplierId, name: option.name, organization: null } };
  });
  return {
    purchase, rows, quotes_status: "ready", mode: "example",
    recommendation: { status: "ready", data: {
      recommended_quote_id: rows[0].quote.id,
      explanation: "Ejemplo de explicación: Sur Envases tiene stock para las 500 unidades, entrega en 2 días y acepta ARGt. Los precios están expresados en ARS; no hay conversión ni autorización de pago. Esta explicación es texto ficticio, sin ejecutar IA.",
      ranking: rows.map((row, index) => ({ quote_id: row.quote.id, reason: options[index].reason })),
    } },
  };
}
