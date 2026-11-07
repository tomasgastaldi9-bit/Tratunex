import { describe, expect, it } from "vitest";
import {
  agentProfileVersionSchema,
  companyProfileSchema,
  KNOWLEDGE_TEXT_MAX,
  knowledgeSchema,
  knowledgeTextLength,
  saveCompanyProfileInputSchema,
} from "./agent";

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

describe("knowledgeSchema (AGT-02)", () => {
  const producto = { kind: "product", name: " Lavandina 5 L ", description: "", price_hint: "Desde $3.200" };
  const pregunta = { kind: "faq", question: "¿Hacen envíos?", answer: "Sí, en CABA y GBA en 24 h." };

  it("acepta productos y preguntas mezclados, y saca espacios sobrantes", () => {
    const resultado = knowledgeSchema.parse([producto, pregunta]);
    expect(resultado[0]).toEqual({ kind: "product", name: "Lavandina 5 L", description: "", price_hint: "Desde $3.200" });
    expect(resultado[1]?.kind).toBe("faq");
  });

  it("acepta la lista vacía (la empresa borró todo)", () => {
    expect(knowledgeSchema.parse([])).toEqual([]);
  });

  it("rechaza un producto sin nombre y una pregunta sin respuesta", () => {
    expect(knowledgeSchema.safeParse([{ ...producto, name: "  " }]).success).toBe(false);
    expect(knowledgeSchema.safeParse([{ ...pregunta, answer: "" }]).success).toBe(false);
  });

  it("rechaza un tipo desconocido", () => {
    expect(knowledgeSchema.safeParse([{ kind: "promo", text: "2x1" }]).success).toBe(false);
  });

  it("rechaza la lista si en total supera KNOWLEDGE_TEXT_MAX", () => {
    // 11 preguntas de 200 + 400 = 6.600 caracteres: se pasa de 6.000.
    const larga = { kind: "faq", question: "p".repeat(200), answer: "r".repeat(400) };
    const resultado = knowledgeSchema.safeParse(Array.from({ length: 11 }, () => larga));
    expect(resultado.success).toBe(false);
  });

  it("knowledgeTextLength suma todos los textos de todos los ítems", () => {
    const items = knowledgeSchema.parse([producto, pregunta]);
    const esperado = "Lavandina 5 L".length + "Desde $3.200".length + pregunta.question.length + pregunta.answer.length;
    expect(knowledgeTextLength(items)).toBe(esperado);
    expect(knowledgeTextLength([])).toBe(0);
    expect(KNOWLEDGE_TEXT_MAX).toBe(6000);
  });
});

describe("agentProfileVersionSchema", () => {
  it("una versión vieja sin conocimiento se lee con knowledge null", () => {
    const resultado = agentProfileVersionSchema.parse({
      version: 1,
      profile: perfilValido,
      created_at: "2026-11-07T15:00:00Z",
      created_by: null,
    });
    expect(resultado.knowledge).toBeNull();
  });
});
