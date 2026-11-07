import { describe, expect, it } from "vitest";
import { pesosToAtomic } from "../../../contracts/purchases";
import type { PurchasePolicy, QuoteForRanking } from "../../../contracts/purchases";
import { rankQuotesByRules, todayInArgentina } from "./ranking";

// La compra de la demo: 500 vasos, presupuesto $ 100.000, para el 20/11; hoy es 07/11 (faltan 13 días).
const request = { quantity: 500, budget_atomic: pesosToAtomic(100000), needed_by: "2026-11-20" };
const today = "2026-11-07";
const policy: PurchasePolicy = {
  max_per_purchase_atomic: pesosToAtomic(500000),
  auto_pay_limit_atomic: pesosToAtomic(100000),
  only_allowed_suppliers: false,
  allowed_supplier_ids: [],
};

let n = 0;
/** Arma una cotización que sirve; cada prueba cambia solo lo que le importa. */
function quote(over: Partial<QuoteForRanking> = {}): QuoteForRanking {
  n += 1;
  return {
    quote_id: `q${n}`,
    supplier_contact_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    supplier_name: `Proveedor ${n}`,
    unit_price_atomic: pesosToAtomic(180),
    available_quantity: 1000,
    delivery_days: 5,
    accepts_argt: "yes",
    origin: "call",
    ...over,
  };
}

const rank = (quotes: QuoteForRanking[], p: PurchasePolicy | null = policy) => rankQuotesByRules({ request, quotes, policy: p, today });

describe("rankQuotesByRules", () => {
  it("demo: la más barata sin stock y la que no acepta ARGt quedan afuera; gana la que sirve", () => {
    const barata = quote({ quote_id: "barata", supplier_name: "Vasos Baratos", unit_price_atomic: pesosToAtomic(150), available_quantity: 300 });
    const sinArgt = quote({ quote_id: "sin-argt", supplier_name: "Plásticos Norte", unit_price_atomic: pesosToAtomic(170), accepts_argt: "no" });
    const sirve = quote({ quote_id: "sirve", supplier_name: "Descartables Sur", unit_price_atomic: pesosToAtomic(180) });

    const r = rank([barata, sinArgt, sirve]);

    expect(r.recommended_quote_id).toBe("sirve");
    expect(r.ranking).toEqual([
      {
        quote_id: "sirve",
        supplier_contact_id: sirve.supplier_contact_id,
        supplier_name: "Descartables Sur",
        position: 1,
        eligible: true,
        total_atomic: pesosToAtomic(90000),
        reasons: ["El precio total más bajo", "Entrega en 5 días", "Acepta ARGt"],
        policy: { decision: "auto_pay", reason: "$ 90.000 está dentro de las reglas: hasta $ 100.000 el agente paga solo." },
      },
      {
        quote_id: "barata",
        supplier_contact_id: barata.supplier_contact_id,
        supplier_name: "Vasos Baratos",
        position: 2,
        eligible: false,
        total_atomic: pesosToAtomic(75000),
        reasons: ["Tiene 300 de 500"],
        policy: null,
      },
      {
        quote_id: "sin-argt",
        supplier_contact_id: sinArgt.supplier_contact_id,
        supplier_name: "Plásticos Norte",
        position: 3,
        eligible: false,
        total_atomic: pesosToAtomic(85000),
        reasons: ["No acepta cobrar en ARGt"],
        policy: null,
      },
    ]);
  });

  it("cada causa de descarte tiene su motivo, y se juntan todas", () => {
    const r = rank([
      quote({ quote_id: "sin-precio", unit_price_atomic: null }),
      quote({ quote_id: "cara", unit_price_atomic: pesosToAtomic(240) }),
      quote({ quote_id: "todo-mal", unit_price_atomic: pesosToAtomic(300), accepts_argt: "no", available_quantity: 10, delivery_days: 20 }),
    ]);
    expect(r.recommended_quote_id).toBeNull();
    expect(r.ranking.map((q) => [q.quote_id, q.position, q.eligible, q.total_atomic, q.reasons, q.policy])).toEqual([
      ["sin-precio", 1, false, null, ["No dio precio en pesos"], null],
      ["cara", 2, false, pesosToAtomic(120000), ["$ 120.000 supera el presupuesto de $ 100.000"], null],
      [
        "todo-mal",
        3,
        false,
        pesosToAtomic(150000),
        ["$ 150.000 supera el presupuesto de $ 100.000", "No acepta cobrar en ARGt", "Tiene 10 de 500", "Entrega en 20 días y la necesitás en 13 días"],
        null,
      ],
    ]);
  });

  it("el total justo igual al presupuesto califica; stock y plazo desconocidos no descartan", () => {
    const r = rank([quote({ quote_id: "justo", unit_price_atomic: pesosToAtomic(200), available_quantity: null, delivery_days: null })]);
    expect(r.recommended_quote_id).toBe("justo");
    expect(r.ranking[0]).toMatchObject({ eligible: true, total_atomic: pesosToAtomic(100000), reasons: ["El precio total más bajo", "Acepta ARGt"] });
  });

  it("límite de fecha: llega justo el día pedido califica; un día después no", () => {
    const r = rank([quote({ quote_id: "tarde", delivery_days: 14 }), quote({ quote_id: "justo", delivery_days: 13 })]);
    expect(r.recommended_quote_id).toBe("justo");
    expect(r.ranking[1]).toMatchObject({ quote_id: "tarde", eligible: false, reasons: ["Entrega en 14 días y la necesitás en 13 días"] });
    // Una fecha que ya pasó también descarta (si sabemos el plazo).
    const pasada = rankQuotesByRules({ request: { ...request, needed_by: "2026-11-05" }, quotes: [quote({ delivery_days: 1 })], policy, today });
    expect(pasada.ranking[0]?.reasons).toEqual(["Entrega en 1 día y la fecha que pediste ya pasó"]);
  });

  it("desempates: total → plazo (desconocido al final) → ARGt sí antes que sin confirmar → llamada, web, ejemplo", () => {
    const r = rank([
      quote({ quote_id: "cara", unit_price_atomic: pesosToAtomic(190) }),
      quote({ quote_id: "sin-plazo", delivery_days: null }),
      quote({ quote_id: "lenta", delivery_days: 7 }),
      quote({ quote_id: "ejemplo", delivery_days: 3, origin: "example" }),
      quote({ quote_id: "web", delivery_days: 3, origin: "web" }),
      quote({ quote_id: "sin-confirmar", delivery_days: 3, accepts_argt: "unknown" }),
      quote({ quote_id: "llamada", delivery_days: 3, origin: "call" }),
    ]);
    expect(r.ranking.map((q) => q.quote_id)).toEqual(["llamada", "web", "ejemplo", "sin-confirmar", "lenta", "sin-plazo", "cara"]);
    expect(r.ranking.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.recommended_quote_id).toBe("llamada");
    // Motivos: el más barato solo para las que empatan en el mínimo; "de prueba" y "sin confirmar" a la vista.
    expect(r.ranking.find((q) => q.quote_id === "ejemplo")?.reasons).toEqual(["El precio total más bajo", "Entrega en 3 días", "Acepta ARGt", "Cotización de prueba"]);
    expect(r.ranking.find((q) => q.quote_id === "sin-confirmar")?.reasons).toEqual(["El precio total más bajo", "Entrega en 3 días", "No confirmó si acepta ARGt"]);
    expect(r.ranking.find((q) => q.quote_id === "cara")?.reasons).toEqual(["Entrega en 5 días", "Acepta ARGt"]);
  });

  it("la regla de pago se calcula para cada una que califica (sin reglas → pide aprobación)", () => {
    const r = rank([quote({ unit_price_atomic: pesosToAtomic(100) }), quote({ unit_price_atomic: pesosToAtomic(150) })], null);
    expect(r.ranking.map((q) => q.policy?.decision)).toEqual(["needs_approval", "needs_approval"]);
    expect(r.ranking.map((q) => q.eligible)).toEqual([true, true]);
  });

  it("pide aprobación sigue calificando y se puede recomendar", () => {
    const r = rankQuotesByRules({
      request: { ...request, budget_atomic: pesosToAtomic(1000000) },
      // $ 150.000 > $ 100.000 que paga solo → pide aprobación.
      quotes: [quote({ quote_id: "con-ok", unit_price_atomic: pesosToAtomic(300) })],
      policy,
      today,
    });
    expect(r.recommended_quote_id).toBe("con-ok");
    expect(r.ranking[0]).toMatchObject({ eligible: true, policy: { decision: "needs_approval" } });
  });

  it("total arriba del máximo por compra (pero dentro del presupuesto) → no califica, con el motivo de la regla", () => {
    const r = rankQuotesByRules({
      request: { ...request, budget_atomic: pesosToAtomic(1000000) },
      quotes: [quote({ quote_id: "sobre-maximo", unit_price_atomic: pesosToAtomic(1200) }), quote({ quote_id: "cara-ok", unit_price_atomic: pesosToAtomic(1300), available_quantity: 1 })],
      policy,
      today,
    });
    expect(r.recommended_quote_id).toBeNull();
    const rejected = { decision: "rejected", reason: "$ 600.000 supera el máximo por compra de $ 500.000." };
    expect(r.ranking[0]).toMatchObject({ quote_id: "sobre-maximo", eligible: false, reasons: [rejected.reason], policy: rejected });
    // Si además falla otra cosa, se juntan todos los motivos (el de la regla al final).
    expect(r.ranking[1]).toMatchObject({
      quote_id: "cara-ok",
      eligible: false,
      reasons: ["Tiene 1 de 500", "$ 650.000 supera el máximo por compra de $ 500.000."],
      policy: { decision: "rejected" },
    });
  });

  it("proveedor fuera de la lista de permitidos → no califica y no se recomienda, aunque sea la más barata", () => {
    const permitido = quote({ quote_id: "permitido", unit_price_atomic: pesosToAtomic(190) });
    const noPermitido = quote({ quote_id: "no-permitido", unit_price_atomic: pesosToAtomic(150) });
    const soloLista: PurchasePolicy = { ...policy, only_allowed_suppliers: true, allowed_supplier_ids: [permitido.supplier_contact_id] };
    const r = rank([noPermitido, permitido], soloLista);
    expect(r.recommended_quote_id).toBe("permitido");
    expect(r.ranking[0]).toMatchObject({ quote_id: "permitido", position: 1, eligible: true, policy: { decision: "auto_pay" }, reasons: ["El precio total más bajo", "Entrega en 5 días", "Acepta ARGt"] });
    expect(r.ranking[1]).toMatchObject({
      quote_id: "no-permitido",
      position: 2,
      eligible: false,
      reasons: ["El proveedor no está en la lista de proveedores permitidos."],
      policy: { decision: "rejected", reason: "El proveedor no está en la lista de proveedores permitidos." },
    });
  });

  it("si no califica por otra causa (y la regla no la rechaza), policy queda null", () => {
    const r = rank([quote({ available_quantity: 1 })]);
    expect(r.ranking[0]).toMatchObject({ eligible: false, policy: null });
  });
});

describe("todayInArgentina", () => {
  it("usa la fecha de Buenos Aires, no la de UTC", () => {
    // 02:30 UTC del 8 = 23:30 del 7 en Argentina.
    expect(todayInArgentina(new Date("2026-11-08T02:30:00Z"))).toBe("2026-11-07");
    expect(todayInArgentina(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-08");
  });
});
