import { describe, expect, it } from "vitest";
import { parseProspectCsv } from "./csv";

describe("CSV de prospectos", () => {
  it("lee comillas, comas, saltos y conserva números internacionales", () => {
    const result = parseProspectCsv('\uFEFFnombre,telefono,web\r\n"Papel, S.A.","+54 9 351 555 0123",https://papel.example\r\n"Agencia\nDemo",+12025550123,\r\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ name: "Papel, S.A.", phone_e164: "+5493515550123", website: "https://papel.example/" });
    expect(result.rows[1]).toMatchObject({ name: "Agencia\nDemo", phone_e164: "+12025550123", website: null });
  });
  it("marca números sin prefijo internacional sin inventar país ni descartar otras filas", () => {
    const result = parseProspectCsv('nombre,telefono,web\nUno,0351 456 7890,https://uno.example\nDos,+12025550123,');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].errors).toContain("Indicá el teléfono con código de país, por ejemplo +54.");
    expect(result.rows[1].errors).toEqual([]);
  });
  it("rechaza encabezados duplicados, columnas faltantes y CSV mal cerrado", () => {
    expect(parseProspectCsv('nombre,nombre,telefono\na,b,+12025550123').ok).toBe(false);
    expect(parseProspectCsv('nombre,telefono\na,+12025550123').ok).toBe(false);
    expect(parseProspectCsv('nombre,telefono,web\n"sin cierre').ok).toBe(false);
  });
  it("marca una web inválida y nunca acepta una URL ejecutable", () => {
    const result = parseProspectCsv('nombre,telefono,web\nUno,+12025550123,javascript:alert(1)');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0].errors).toContain("La web debe ser una URL http o https válida.");
  });
});
