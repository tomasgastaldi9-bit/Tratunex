import { describe, expect, it } from "vitest";
import { supplierQuoteFixtures } from "../fixtures";
import { rowToQuoteDTO } from "./quote-store";

describe("rowToQuoteDTO", () => {
  it("normaliza numeric como texto y fechas con zona horaria de Postgres", () => {
    const fixture = supplierQuoteFixtures[0];
    const row = { ...fixture, unit_price: "85.00", created_at: "2026-11-07T17:30:00+00:00", updated_at: "2026-11-07T17:30:00.000000+00:00" };
    expect(rowToQuoteDTO(row)).toEqual({ ok: true, data: fixture });
  });

  it("una fila que no cumple el contrato es un error, no una cotización", () => {
    const result = rowToQuoteDTO({ ...supplierQuoteFixtures[0], can_supply: "maybe" });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
});
