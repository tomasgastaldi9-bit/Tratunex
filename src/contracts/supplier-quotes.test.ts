import { describe, expect, it } from "vitest";
import {
  QuoteMoneySchema, QuoteSourceSchema, SupplierQuoteListSchema, SupplierQuoteSchema,
} from "./supplier-quotes";

const quote = {
  id: "11111111-1111-4111-8111-111111111111",
  company_id: "22222222-2222-4222-8222-222222222222",
  purchase_request_id: "33333333-3333-4333-8333-333333333333",
  supplier_contact_id: "44444444-4444-4444-8444-444444444444",
  unit_price: null,
  can_supply: "unknown",
  available_quantity: null,
  minimum_order_quantity: null,
  lead_time_days: null,
  lead_time_text: null,
  price_includes_vat: "unknown",
  delivery_included: "unknown",
  accepts_argt: "unknown",
  payment_terms: null,
  notes: null,
  summary: "Cotización de ejemplo sin condiciones confirmadas",
  source: { kind: "example", label: "Datos de prueba" },
  created_at: "2026-11-07T15:00:00Z",
};

describe("ORD-02: importes exactos y escala explícita", () => {
  it.each(["0", "1", "9007199254740993", "1000000000000000001", "9".repeat(78)])("conserva el entero atómico %s como string", amount_atomic => {
    expect(QuoteMoneySchema.parse({ amount_atomic, currency: "ARGt", decimals: 18 })).toEqual({ amount_atomic, currency: "ARGt", decimals: 18 });
  });

  it.each([0, 1, 9007199254740992, 1.5, "", "-1", "+1", "01", "00", "1.0", "1e18", " 1", "1 ", "9".repeat(79)])("rechaza números o strings no canónicos: %s", amount_atomic => {
    expect(QuoteMoneySchema.safeParse({ amount_atomic, currency: "ARGt", decimals: 18 }).success).toBe(false);
  });

  it.each([0, 2, 6, 17, 19, -1, 18.5])("ARGt rechaza la escala %s", decimals => {
    expect(QuoteMoneySchema.safeParse({ amount_atomic: "1", currency: "ARGt", decimals }).success).toBe(false);
  });

  it("ARS y USD conservan su propia escala sin convertir a ARGt", () => {
    expect(QuoteMoneySchema.parse({ amount_atomic: "12345", currency: "ARS", decimals: 2 })).toEqual({ amount_atomic: "12345", currency: "ARS", decimals: 2 });
    expect(QuoteMoneySchema.parse({ amount_atomic: "12345", currency: "USD", decimals: 6 })).toEqual({ amount_atomic: "12345", currency: "USD", decimals: 6 });
    expect(QuoteMoneySchema.safeParse({ amount_atomic: "1", currency: "USD" }).success).toBe(false);
  });

  it("rechaza escala fuera de rango, moneda desconocida y metadatos inesperados", () => {
    const money = { amount_atomic: "1", currency: "ARS", decimals: 0 };
    for (const change of [{ decimals: -1 }, { decimals: 19 }, { decimals: 1.5 }, { currency: "USDT" }, { value: 1 }]) {
      expect(QuoteMoneySchema.safeParse({ ...money, ...change }).success).toBe(false);
    }
  });
});

describe("ORD-02: procedencia explícita de cotizaciones", () => {
  it.each(["mock", "web", "phone"] as const)("conserva el transporte %s de una llamada", transport => {
    const source = { kind: "call", call_id: quote.id, transport };
    expect(QuoteSourceSchema.parse(source)).toEqual(source);
  });

  it("distingue una fuente web de un ejemplo rotulado", () => {
    expect(QuoteSourceSchema.parse({ kind: "web", url: "https://proveedor.example/cotizacion" })).toEqual({ kind: "web", url: "https://proveedor.example/cotizacion" });
    expect(QuoteSourceSchema.parse(quote.source)).toEqual(quote.source);
  });

  it.each([
    { kind: "call", call_id: quote.id },
    { kind: "call", call_id: quote.id, transport: "live" },
    { kind: "call", call_id: "id-externo", transport: "phone" },
    { kind: "web", url: "javascript:alert(1)" },
    { kind: "web", url: "https://proveedor.example", transport: "phone" },
    { kind: "example", label: " " },
    { kind: "example", label: "Datos de prueba", call_id: quote.id },
    { kind: "mock", label: "Datos de prueba" },
  ])("rechaza procedencia incompleta o mezclada: %j", source => {
    expect(QuoteSourceSchema.safeParse(source).success).toBe(false);
  });
});

describe("ORD-02: datos desconocidos y límites de cotización", () => {
  it("conserva precio, stock y plazo desconocidos sin convertirlos a cero", () => {
    const parsed = SupplierQuoteSchema.parse(quote);
    expect(parsed).toMatchObject({ unit_price: null, can_supply: "unknown", available_quantity: null, minimum_order_quantity: null, lead_time_days: null,
      lead_time_text: null, price_includes_vat: "unknown", delivery_included: "unknown", accepts_argt: "unknown" });
  });

  it("distingue cero confirmado de un valor todavía desconocido", () => {
    expect(SupplierQuoteSchema.parse({ ...quote, available_quantity: 0, minimum_order_quantity: 0, lead_time_days: 0 })).toMatchObject({ available_quantity: 0, minimum_order_quantity: 0, lead_time_days: 0 });
  });

  it("acepta límites enteros de stock y plazo", () => {
    expect(SupplierQuoteSchema.parse({ ...quote, available_quantity: 1_000_000_000, minimum_order_quantity: 1_000_000_000, lead_time_days: 365 })).toMatchObject({ available_quantity: 1_000_000_000, minimum_order_quantity: 1_000_000_000, lead_time_days: 365 });
  });

  it.each([
    { available_quantity: -1 }, { available_quantity: 1.5 }, { available_quantity: 1_000_000_001 }, { available_quantity: "5" },
    { minimum_order_quantity: -1 }, { minimum_order_quantity: 1_000_000_001 },
    { lead_time_days: -1 }, { lead_time_days: 366 }, { lead_time_days: 1.5 }, { lead_time_days: "3" },
  ])("rechaza cantidades/plazos inválidos sin coerción: %j", change => {
    expect(SupplierQuoteSchema.safeParse({ ...quote, ...change }).success).toBe(false);
  });

  it("exige identidad interna, fecha UTC y campos desconocidos explícitos", () => {
    for (const change of [{ company_id: "otra-empresa" }, { created_at: "2026-11-07T12:00:00-03:00" }, { lead_time_days: undefined }, { available_quantity: undefined }, { supplier_wallet: "0x1234" }]) {
      expect(SupplierQuoteSchema.safeParse({ ...quote, ...change }).success).toBe(false);
    }
  });

  it("admite una lista vacía y limita el lote a 100 cotizaciones", () => {
    expect(SupplierQuoteListSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(SupplierQuoteListSchema.safeParse({ items: Array.from({ length: 100 }, () => quote) }).success).toBe(true);
    expect(SupplierQuoteListSchema.safeParse({ items: Array.from({ length: 101 }, () => quote) }).success).toBe(false);
  });
});
