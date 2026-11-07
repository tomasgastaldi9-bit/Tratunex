import { describe, expect, it } from "vitest";
import { companyProfileSchema, saveCompanyProfileInputSchema } from "./agent";

// Un perfil válido de ejemplo; cada prueba cambia solo lo que quiere romper.
const perfilValido = {
  industry: "distributor",
  offering: "Insumos de limpieza para comercios",
  target_customer: "Almacenes y supermercados chicos",
  value_proposition: "Entrega en 24 h y precios de mayorista",
  zone: "CABA y GBA",
  tone: "professional_warm",
  call_window: { days: [5, 1, 3, 1], start: "09:00", end: "18:00" },
};

describe("companyProfileSchema", () => {
  it("acepta un perfil completo y ordena los días sin repetir", () => {
    const resultado = companyProfileSchema.parse(perfilValido);
    expect(resultado.call_window.days).toEqual([1, 3, 5]);
  });

  it("saca los espacios sobrantes y permite la zona vacía", () => {
    const resultado = companyProfileSchema.parse({ ...perfilValido, offering: "  Insumos  ", zone: "" });
    expect(resultado.offering).toBe("Insumos");
    expect(resultado.zone).toBe("");
  });

  it("rechaza un texto obligatorio vacío", () => {
    const resultado = companyProfileSchema.safeParse({ ...perfilValido, target_customer: "   " });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un texto más largo que el máximo", () => {
    const resultado = companyProfileSchema.safeParse({ ...perfilValido, offering: "a".repeat(601) });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un horario sin días", () => {
    const resultado = companyProfileSchema.safeParse({
      ...perfilValido,
      call_window: { days: [], start: "09:00", end: "18:00" },
    });
    expect(resultado.success).toBe(false);
  });

  it("rechaza una hora de fin anterior a la de inicio, marcando el campo end", () => {
    const resultado = companyProfileSchema.safeParse({
      ...perfilValido,
      call_window: { days: [1], start: "18:00", end: "09:00" },
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["call_window", "end"]);
  });

  it("rechaza horas mal escritas y rubros desconocidos", () => {
    expect(companyProfileSchema.safeParse({ ...perfilValido, call_window: { days: [1], start: "9", end: "18:00" } }).success).toBe(false);
    expect(companyProfileSchema.safeParse({ ...perfilValido, industry: "bakery" }).success).toBe(false);
  });
});

describe("saveCompanyProfileInputSchema", () => {
  it("acepta base_version null (primera versión) o un número desde 1", () => {
    expect(saveCompanyProfileInputSchema.safeParse({ base_version: null, profile: perfilValido }).success).toBe(true);
    expect(saveCompanyProfileInputSchema.safeParse({ base_version: 3, profile: perfilValido }).success).toBe(true);
    expect(saveCompanyProfileInputSchema.safeParse({ base_version: 0, profile: perfilValido }).success).toBe(false);
  });
});
