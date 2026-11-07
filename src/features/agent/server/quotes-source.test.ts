import { describe, expect, it } from "vitest";
import type { ComparatorQuote } from "../../voice/server/quote-import";
import { quoteForRankingSchema } from "../../../contracts/purchases";
import { toQuoteForRanking } from "./quotes-source";

const supplier = "33333333-3333-4333-8333-333333333333";

// Una cotización como la entrega listSupplierQuotes de Voz: 150,50 pesos por unidad, de una llamada.
function comparatorQuote(over: Partial<ComparatorQuote> = {}): ComparatorQuote {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    company_id: "11111111-1111-4111-8111-111111111111",
    purchase_request_id: "55555555-5555-4555-8555-555555555555",
    supplier_contact_id: supplier,
    unit_price: { amount_atomic: "15050", currency: "ARS", decimals: 2 },
    can_supply: "yes",
    available_quantity: 800,
    minimum_order_quantity: null,
    lead_time_days: 4,
    lead_time_text: "el martes",
    price_includes_vat: "unknown",
    delivery_included: "unknown",
    accepts_argt: "yes",
    payment_terms: null,
    notes: null,
    summary: "Tiene stock y entrega el martes.",
    source: { kind: "call", call_id: "77777777-7777-4777-8777-777777777777", transport: "web" },
    created_at: "2026-11-07T12:00:00Z",
    ...over,
  };
}

describe("toQuoteForRanking", () => {
  it("pasa una cotización en pesos a la forma del ranking (centavos → ARGt de 18 decimales)", () => {
    const q = toQuoteForRanking(comparatorQuote(), "Descartables Sur");
    expect(q).toEqual({
      quote_id: "66666666-6666-4666-8666-666666666666",
      supplier_contact_id: supplier,
      supplier_name: "Descartables Sur",
      // 15050 centavos = 150,50 pesos = 150,5 ARGt = 150500000000000000000 unidades mínimas.
      unit_price_atomic: "150500000000000000000",
      available_quantity: 800,
      delivery_days: 4,
      accepts_argt: "yes",
      origin: "call",
    });
    // Y es una cotización válida para rankQuotes.
    expect(quoteForRankingSchema.safeParse(q).success).toBe(true);
  });

  it("en dólares o sin precio queda sin precio en pesos (null)", () => {
    expect(toQuoteForRanking(comparatorQuote({ unit_price: { amount_atomic: "15050", currency: "USD", decimals: 2 } }), "X").unit_price_atomic).toBeNull();
    expect(toQuoteForRanking(comparatorQuote({ unit_price: null }), "X").unit_price_atomic).toBeNull();
  });

  it('can_supply "no" cuenta como sin stock (0); si no, usa lo que dijo', () => {
    expect(toQuoteForRanking(comparatorQuote({ can_supply: "no", available_quantity: 500 }), "X").available_quantity).toBe(0);
    expect(toQuoteForRanking(comparatorQuote({ can_supply: "no", available_quantity: null }), "X").available_quantity).toBe(0);
    expect(toQuoteForRanking(comparatorQuote({ can_supply: "unknown", available_quantity: null }), "X").available_quantity).toBeNull();
    expect(toQuoteForRanking(comparatorQuote({ can_supply: "partial", available_quantity: 200 }), "X").available_quantity).toBe(200);
  });

  it("el nombre sale sin espacios sobrantes, cortado a 120 caracteres con \"…\" y nunca vacío", () => {
    expect(toQuoteForRanking(comparatorQuote(), "  Descartables Sur  ").supplier_name).toBe("Descartables Sur");
    expect(toQuoteForRanking(comparatorQuote(), "   ").supplier_name).toBe("Proveedor sin nombre");
    // Justo 120: queda igual, sin "…".
    expect(toQuoteForRanking(comparatorQuote(), "a".repeat(120)).supplier_name).toBe("a".repeat(120));
    // Más largo: se corta y termina en "…", con 120 en total, y sigue siendo válida para el ranking.
    const larga = toQuoteForRanking(comparatorQuote(), "b".repeat(300));
    expect(larga.supplier_name).toBe(`${"b".repeat(119)}…`);
    expect(larga.supplier_name).toHaveLength(120);
    expect(quoteForRankingSchema.safeParse(larga).success).toBe(true);
  });

  it("el origen sale de source.kind (llamada, web o ejemplo)", () => {
    expect(toQuoteForRanking(comparatorQuote({ source: { kind: "web", url: "https://proveedor.com.ar" } }), "X").origin).toBe("web");
    expect(toQuoteForRanking(comparatorQuote({ source: { kind: "example", label: "Datos de prueba" } }), "X").origin).toBe("example");
  });
});
