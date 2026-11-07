import { describe, expect, it } from "vitest";
import { QuoteMoneySchema } from "../../contracts/supplier-quotes";
import { formatQuoteMoney, quoteTotal } from "./quote-comparison";

describe("ORD-02: presentación exacta de precios", () => {
  it.each([
    ["0", "ARGt 0"],
    ["1", "ARGt 0,000000000000000001"],
    ["1000000000000000000", "ARGt 1"],
    ["1000000000000000001", "ARGt 1,000000000000000001"],
    ["1234500000000000000000", "ARGt 1.234,5"],
    ["9007199254740993000000000000000001", "ARGt 9.007.199.254.740.993,000000000000000001"],
  ])("formatea %s sin perder precisión", (amount_atomic, expected) => {
    expect(formatQuoteMoney({ amount_atomic, currency: "ARGt", decimals: 18 })).toBe(expected);
  });

  it("mantiene enteros por encima de MAX_SAFE_INTEGER con escala cero", () => {
    expect(formatQuoteMoney({ amount_atomic: "9007199254740993", currency: "ARS", decimals: 0 })).toBe("ARS 9.007.199.254.740.993");
  });

  it("muestra la moneda y la escala de origen sin conversión implícita", () => {
    expect(formatQuoteMoney({ amount_atomic: "12345", currency: "ARS", decimals: 2 })).toBe("ARS 123,45");
    expect(formatQuoteMoney({ amount_atomic: "12345", currency: "USD", decimals: 6 })).toBe("USD 0,012345");
  });

  it("formatea el máximo de 78 dígitos sin convertirlo a Number", () => {
    expect(formatQuoteMoney({ amount_atomic: "9".repeat(78), currency: "ARS", decimals: 0 })).toBe(`ARS ${Array.from({ length: 26 }, () => "999").join(".")}`);
  });
});

describe("ORD-02: totales exactos y límites", () => {
  it("multiplica el último decimal de ARGt sin redondearlo", () => {
    const total = quoteTotal({ amount_atomic: "1000000000000000001", currency: "ARGt", decimals: 18 }, 3);
    expect(total).toEqual({ amount_atomic: "3000000000000000003", currency: "ARGt", decimals: 18 });
    expect(formatQuoteMoney(total)).toBe("ARGt 3,000000000000000003");
  });

  it("multiplica importes grandes preservando el entero y los 18 decimales", () => {
    const total = quoteTotal({ amount_atomic: "9007199254740993000000000000000001", currency: "ARGt", decimals: 18 }, 7);
    expect(total.amount_atomic).toBe("63050394783186951000000000000000007");
    expect(formatQuoteMoney(total)).toBe("ARGt 63.050.394.783.186.951,000000000000000007");
  });

  it("acepta los límites 1 y un millón sin mutar el precio unitario", () => {
    const price = { amount_atomic: "1", currency: "ARGt" as const, decimals: 18 };
    expect(quoteTotal(price, 1)).toEqual(price);
    expect(quoteTotal(price, 1_000_000).amount_atomic).toBe("1000000");
    expect(price.amount_atomic).toBe("1");
  });

  it("conserva moneda, escala y cero confirmado", () => {
    expect(quoteTotal({ amount_atomic: "12345", currency: "ARS", decimals: 2 }, 2)).toEqual({ amount_atomic: "24690", currency: "ARS", decimals: 2 });
    expect(quoteTotal({ amount_atomic: "0", currency: "USD", decimals: 6 }, 2)).toEqual({ amount_atomic: "0", currency: "USD", decimals: 6 });
  });

  it.each([0, -1, 1.5, 1_000_001, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("rechaza una cantidad inválida %s", quantity => {
    expect(() => quoteTotal({ amount_atomic: "1", currency: "ARGt", decimals: 18 }, quantity)).toThrow("Cantidad inválida");
  });

  it("acepta un total de 78 dígitos dentro del contrato", () => {
    const total = quoteTotal({ amount_atomic: `1${"0".repeat(71)}`, currency: "ARGt", decimals: 18 }, 1_000_000);
    expect(total.amount_atomic).toBe(`1${"0".repeat(77)}`);
    expect(QuoteMoneySchema.safeParse(total).success).toBe(true);
  });

  it("rechaza explícitamente un total que exceda el contrato de 78 dígitos", () => {
    expect(() => quoteTotal({ amount_atomic: `1${"0".repeat(72)}`, currency: "ARGt", decimals: 18 }, 1_000_000)).toThrow(/total|importe|límite/i);
  });
});
