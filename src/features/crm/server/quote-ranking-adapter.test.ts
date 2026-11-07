import { describe, expect, it } from "vitest";
import { createQuoteComparisonExample } from "../mocks/quote-comparison-example";
import { prepareQuoteRankingInput, quotePriceForRanking, rankingMatchesComparison } from "./quote-ranking-adapter";

const example = createQuoteComparisonExample("10000000-0000-4000-8000-000000000001");

describe("ORD02: adaptación exacta al contrato público BUY03", () => {
  it("proyecta centavos ARS nominales a ARGt18 con BigInt, sin perder enteros grandes", () => {
    expect(quotePriceForRanking({ amount_atomic: "9007199254740993", currency: "ARS", decimals: 2 }))
      .toBe("90071992547409930000000000000000");
    expect(quotePriceForRanking({ amount_atomic: "101", currency: "ARS", decimals: 2 })).toBe("1010000000000000000");
    expect(quotePriceForRanking({ amount_atomic: "0", currency: "ARS", decimals: 2 })).toBe("0");
    expect(quotePriceForRanking({ amount_atomic: "1000000000000000001", currency: "ARGt", decimals: 18 })).toBe("1000000000000000001");
  });
  it("USD y precio desconocido quedan null sin inventar una cotización de cambio", () => {
    expect(quotePriceForRanking({ amount_atomic: "101", currency: "USD", decimals: 2 })).toBeNull();
    expect(quotePriceForRanking(null)).toBeNull();
    const rows = structuredClone(example.rows);
    rows[0].quote.unit_price = { amount_atomic: "101", currency: "USD", decimals: 2 };
    const prepared = prepareQuoteRankingInput(example.purchase.id, rows);
    expect(prepared).toMatchObject({ ok: true, data: { quotes: [{ quote_id: rows[0].quote.id, unit_price_atomic: null }, {}, {}] } });
  });
  it("envía identidad, stock, plazo y origen del conjunto completo", () => {
    const prepared = prepareQuoteRankingInput(example.purchase.id, example.rows);
    if (!prepared.ok) throw new Error("Falta input");
    expect(prepared.data).toMatchObject({ purchase_request_id: example.purchase.id, quotes: example.rows.map(row => ({
      quote_id: row.quote.id, supplier_contact_id: row.supplier.id, supplier_name: row.supplier.name,
      available_quantity: row.quote.available_quantity, delivery_days: row.quote.lead_time_days,
      accepts_argt: row.quote.accepts_argt, origin: "example",
    })) });
  });
  it("acorta solo la etiqueta del ranking y conserva el nombre completo y la identidad de la fila", () => {
    const rows = structuredClone(example.rows);
    const fullName = "A".repeat(121);
    rows[0].supplier.name = fullName;
    const prepared = prepareQuoteRankingInput(example.purchase.id, rows);
    if (!prepared.ok || example.recommendation.status !== "ready") throw new Error("Falta fixture");
    const label = `${"A".repeat(119)}…`;
    expect(prepared.data.quotes[0]).toMatchObject({ supplier_name: label,
      quote_id: rows[0].quote.id, supplier_contact_id: rows[0].supplier.id,
      unit_price_atomic: quotePriceForRanking(rows[0].quote.unit_price),
    });
    const ranking = structuredClone(example.recommendation.data);
    ranking.ranking[0].supplier_name = label;
    expect(rankingMatchesComparison(ranking, prepared.data, rows, example.purchase.quantity)).toBe(true);
    expect(rows[0].supplier.name).toBe(fullName);
  });
  it("no corta un par UTF-16 al limitar la etiqueta a 120 unidades", () => {
    const rows = structuredClone(example.rows);
    rows[0].supplier.name = `${"A".repeat(118)}😀B`;
    const prepared = prepareQuoteRankingInput(example.purchase.id, rows);
    if (!prepared.ok) throw new Error("Falta input");
    expect(prepared.data.quotes[0].supplier_name).toBe(`${"A".repeat(118)}…`);
    expect(prepared.data.quotes[0].supplier_name.length).toBeLessThanOrEqual(120);
    expect(rows[0].supplier.name).toBe(`${"A".repeat(118)}😀B`);
  });
  it("no valida como elegible una cotización cuyo proveedor declaró que no puede abastecer", () => {
    const rows = structuredClone(example.rows);
    rows[0].quote.can_supply = "no";
    const prepared = prepareQuoteRankingInput(example.purchase.id, rows);
    if (!prepared.ok || example.recommendation.status !== "ready") throw new Error("Falta fixture");
    expect(rankingMatchesComparison(example.recommendation.data, prepared.data, rows, example.purchase.quantity)).toBe(false);
  });
});
