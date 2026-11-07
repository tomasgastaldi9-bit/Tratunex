import { describe, expect, it } from "vitest";
// Ruta relativa (y no "@/"): Vitest no entiende el alias "@/" en este proyecto.
import { pesosToAtomic, purchasePolicySchema } from "../../../contracts/purchases";
import {
  policyExamples,
  policyFieldErrors,
  policyToFormValues,
  readPolicyForm,
  readPolicySaved,
  savedPolicyUrl,
  SUPPLIERS_UNREADABLE_MESSAGE,
  type PolicyFormValues,
} from "./policy-form-data";

const PROVEEDOR_A = "3f2b8c1e-5d4a-4b6c-9e8f-1a2b3c4d5e6f";
const PROVEEDOR_B = "7a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

// Los campos de un formulario válido, como los manda el navegador.
// "allowed_supplier_ids" llega una vez por cada casilla marcada.
const CAMPOS_VALIDOS: Record<string, string | string[]> = {
  max_per_purchase: "200000",
  auto_pay_limit: "50000",
  only_allowed_suppliers: "1",
  allowed_supplier_ids: [PROVEEDOR_A, PROVEEDOR_B],
  action_id: "accion-de-prueba",
};

/** Arma un FormData igual al que arma el navegador al enviar el formulario. */
function armarFormulario(campos: Record<string, string | string[]>): FormData {
  const formData = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) {
    for (const unValor of Array.isArray(valor) ? valor : [valor]) formData.append(nombre, unValor);
  }
  return formData;
}

/** Lee el formulario, lo valida con el contrato y devuelve los errores por campo. */
function erroresDe(campos: Record<string, string | string[]>) {
  const resultado = purchasePolicySchema.safeParse(readPolicyForm(armarFormulario(campos)).policy);
  return resultado.success ? {} : policyFieldErrors(resultado.error);
}

describe("readPolicyForm", () => {
  it("pasa los pesos a unidades mínimas y junta la lista de proveedores", () => {
    const { action_id, policy } = readPolicyForm(armarFormulario(CAMPOS_VALIDOS));

    expect(action_id).toBe("accion-de-prueba");
    expect(policy).toEqual({
      max_per_purchase_atomic: pesosToAtomic(200000),
      auto_pay_limit_atomic: pesosToAtomic(50000),
      only_allowed_suppliers: true,
      allowed_supplier_ids: [PROVEEDOR_A, PROVEEDOR_B],
    });
    expect(purchasePolicySchema.safeParse(policy).success).toBe(true);
  });

  it("la casilla sin marcar no viene: el filtro queda apagado", () => {
    // Copia de los campos válidos, sin la casilla (como si no estuviera marcada).
    const campos: Record<string, string | string[]> = { ...CAMPOS_VALIDOS, allowed_supplier_ids: [] };
    delete campos.only_allowed_suppliers;
    const { policy } = readPolicyForm(armarFormulario(campos));
    expect(policy.only_allowed_suppliers).toBe(false);
    expect(policy.allowed_supplier_ids).toEqual([]);
    expect(purchasePolicySchema.safeParse(policy).success).toBe(true);
  });
});

describe("policyFieldErrors", () => {
  it("un formulario válido no tiene errores", () => {
    expect(erroresDe(CAMPOS_VALIDOS)).toEqual({});
  });

  it("si lo que paga solo supera el máximo, lo marca en 'El agente paga solo hasta'", () => {
    const errores = erroresDe({ ...CAMPOS_VALIDOS, max_per_purchase: "50000", auto_pay_limit: "200000" });
    expect(errores).toEqual({
      auto_pay_limit: "Lo que el agente paga solo no puede superar el máximo por compra",
    });
  });

  it("igual al máximo sí se puede", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, max_per_purchase: "50000", auto_pay_limit: "50000" })).toEqual({});
  });

  it("un monto con puntos o vacío se marca en su campo", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, max_per_purchase: "200.000" }).max_per_purchase).toBe(
      "Escribí un monto válido, sin comas ni puntos",
    );
    expect(erroresDe({ ...CAMPOS_VALIDOS, auto_pay_limit: "" }).auto_pay_limit).toBe(
      "Escribí un monto válido, sin comas ni puntos",
    );
  });

  it("filtro activo sin proveedores elegidos: lo marca en la lista", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, allowed_supplier_ids: [] }).allowed_supplier_ids).toBe(
      "Elegí al menos un proveedor permitido, o desactivá el filtro",
    );
  });

  it("un id roto en la lista: pide recargar (y no muestra el mensaje en inglés)", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, allowed_supplier_ids: ["no-es-un-id"] }).allowed_supplier_ids).toBe(
      SUPPLIERS_UNREADABLE_MESSAGE,
    );
  });
});

describe("policyToFormValues", () => {
  it("sin reglas, arranca vacío y con el filtro apagado", () => {
    expect(policyToFormValues(null)).toEqual({
      max_per_purchase: "",
      auto_pay_limit: "",
      only_allowed_suppliers: false,
      allowed_supplier_ids: [],
    });
  });

  it("muestra las reglas guardadas en pesos", () => {
    const valores = policyToFormValues({
      max_per_purchase_atomic: pesosToAtomic(200000),
      auto_pay_limit_atomic: pesosToAtomic(50000),
      only_allowed_suppliers: true,
      allowed_supplier_ids: [PROVEEDOR_A],
    });
    expect(valores).toEqual({
      max_per_purchase: "200000",
      auto_pay_limit: "50000",
      only_allowed_suppliers: true,
      allowed_supplier_ids: [PROVEEDOR_A],
    });
  });
});

describe("savedPolicyUrl y readPolicySaved", () => {
  it("se entienden entre sí", () => {
    const url = new URL(savedPolicyUrl(), "http://localhost");
    expect(url.pathname).toBe("/agent/rules");
    expect(readPolicySaved(Object.fromEntries(url.searchParams))).toBe(true);
    expect(readPolicySaved({})).toBe(false);
    expect(readPolicySaved({ saved: ["1", "1"] })).toBe(false);
  });
});

describe("policyExamples", () => {
  const VALORES: PolicyFormValues = {
    max_per_purchase: "200000",
    auto_pay_limit: "50000",
    only_allowed_suppliers: false,
    allowed_supplier_ids: [],
  };

  it("arma tres ejemplos: paga solo, pide aprobación y rechaza", () => {
    const ejemplos = policyExamples(VALORES);
    expect(ejemplos.ok).toBe(true);
    if (!ejemplos.ok) return;
    expect(ejemplos.examples.map((e) => e.amount_atomic)).toEqual([
      pesosToAtomic(25000),
      pesosToAtomic(125000),
      pesosToAtomic(240000),
    ]);
    expect(ejemplos.examples.map((e) => e.check.decision)).toEqual(["auto_pay", "needs_approval", "rejected"]);
  });

  it("con el filtro activo usa un proveedor elegido", () => {
    const ejemplos = policyExamples({ ...VALORES, only_allowed_suppliers: true, allowed_supplier_ids: [PROVEEDOR_A] });
    expect(ejemplos.ok && ejemplos.examples.map((e) => e.check.decision)).toEqual([
      "auto_pay",
      "needs_approval",
      "rejected",
    ]);
  });

  it("con el filtro activo y ningún proveedor elegido, avisa en vez de mostrar rechazos", () => {
    const ejemplos = policyExamples({ ...VALORES, only_allowed_suppliers: true, allowed_supplier_ids: [] });
    expect(ejemplos.ok).toBe(false);
    expect(!ejemplos.ok && ejemplos.reason).toBe("no_suppliers");
    // Al tildar uno, los ejemplos vuelven.
    expect(policyExamples({ ...VALORES, only_allowed_suppliers: true, allowed_supplier_ids: [PROVEEDOR_A] }).ok).toBe(true);
  });

  it("si un ejemplo no puede existir, no lo muestra", () => {
    // Límite igual al máximo: no hay nada "entre los dos".
    const iguales = policyExamples({ ...VALORES, auto_pay_limit: "200000" });
    expect(iguales.ok && iguales.examples.map((e) => e.check.decision)).toEqual(["auto_pay", "rejected"]);
    // Límite 0: no hay compra "bajo el límite".
    const sinLimite = policyExamples({ ...VALORES, auto_pay_limit: "0" });
    expect(sinLimite.ok && sinLimite.examples.map((e) => e.check.decision)).toEqual(["needs_approval", "rejected"]);
  });

  it("sin montos válidos o con el límite arriba del máximo, explica por qué no hay ejemplos", () => {
    expect(policyExamples({ ...VALORES, max_per_purchase: "" }).ok).toBe(false);
    expect(policyExamples({ ...VALORES, auto_pay_limit: "50.000" }).ok).toBe(false);
    expect(policyExamples({ ...VALORES, auto_pay_limit: "300000" })).toEqual({
      ok: false,
      message: "Lo que el agente paga solo no puede superar el máximo por compra.",
    });
  });
});
