import { describe, expect, it } from "vitest";
// Ruta relativa (y no "@/"): Vitest no entiende el alias "@/" en este proyecto.
import { pesosToAtomic, purchaseRequestInputSchema } from "../../../contracts/purchases";
import {
  createdPurchaseUrl,
  formatNeededBy,
  formatQuantity,
  pesosTextToAtomic,
  purchaseFieldErrors,
  readCreatedPurchase,
  readPurchaseForm,
} from "./purchase-form-data";

// Los campos de un formulario válido, como los manda el navegador: todo es texto.
// Cada prueba cambia solo lo que le interesa.
const CAMPOS_VALIDOS: Record<string, string> = {
  product: "Vasos térmicos de 240 cc",
  quantity: "500",
  unit: "cajas",
  needed_by: "2026-11-09",
  budget: "150000",
  zone: "CABA",
  action_id: "accion-de-prueba",
};

/** Arma un FormData igual al que arma el navegador al enviar el formulario. */
function armarFormulario(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) formData.append(nombre, valor);
  return formData;
}

/** Lee el formulario, lo valida con el contrato y devuelve los errores por campo. */
function erroresDe(campos: Record<string, string>) {
  const resultado = purchaseRequestInputSchema.safeParse(readPurchaseForm(armarFormulario(campos)).input);
  return resultado.success ? {} : purchaseFieldErrors(resultado.error);
}

describe("readPurchaseForm", () => {
  it("convierte la cantidad a número y los pesos a unidades mínimas de ARGt", () => {
    const { action_id, input } = readPurchaseForm(armarFormulario(CAMPOS_VALIDOS));

    expect(action_id).toBe("accion-de-prueba");
    expect(input).toEqual({
      product: "Vasos térmicos de 240 cc",
      quantity: 500,
      unit: "cajas",
      needed_by: "2026-11-09",
      // 150.000 pesos = 150.000 ARGt = 150000 seguido de 18 ceros.
      budget_atomic: "150000000000000000000000",
      zone: "CABA",
    });
    expect(purchaseRequestInputSchema.safeParse(input).success).toBe(true);
  });

  it("devuelve lo que escribió la persona tal cual, para no borrárselo", () => {
    const { values } = readPurchaseForm(armarFormulario({ ...CAMPOS_VALIDOS, budget: "150.000" }));
    expect(values.budget).toBe("150.000");
    expect(values.quantity).toBe("500");
  });

  it("la cantidad vacía queda como NaN (y no como 0)", () => {
    const { input } = readPurchaseForm(armarFormulario({ ...CAMPOS_VALIDOS, quantity: "" }));
    expect(input.quantity).toBeNaN();
  });

  it("si faltan campos, no explota: quedan vacíos", () => {
    const { action_id, input } = readPurchaseForm(new FormData());
    expect(action_id).toBe("");
    expect(input.product).toBe("");
    expect(input.budget_atomic).toBe("");
  });
});

describe("pesosTextToAtomic", () => {
  it("pasa pesos enteros a unidades mínimas", () => {
    expect(pesosTextToAtomic("1")).toBe(pesosToAtomic(1));
    expect(pesosTextToAtomic(" 2500 ")).toBe(pesosToAtomic(2500));
  });

  it("todo lo que no son solo dígitos queda vacío (BigInt no explota después)", () => {
    for (const malo of ["", "150.000", "12,5", "-3", "abc", "1e5"]) {
      expect(pesosTextToAtomic(malo)).toBe("");
    }
  });
});

describe("purchaseFieldErrors", () => {
  it("un formulario válido no tiene errores", () => {
    expect(erroresDe(CAMPOS_VALIDOS)).toEqual({});
  });

  it("marca cada campo con el mensaje del contrato", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, product: "  " }).product).toBe("Escribí qué necesitás comprar");
    expect(erroresDe({ ...CAMPOS_VALIDOS, quantity: "" }).quantity).toBe("Escribí la cantidad con números");
    expect(erroresDe({ ...CAMPOS_VALIDOS, quantity: "2.5" }).quantity).toBe(
      "La cantidad tiene que ser un número entero",
    );
    expect(erroresDe({ ...CAMPOS_VALIDOS, quantity: "0" }).quantity).toBe("La cantidad tiene que ser al menos 1");
    expect(erroresDe({ ...CAMPOS_VALIDOS, needed_by: "" }).needed_by).toBe("Elegí la fecha para cuándo lo necesitás");
  });

  it("el error del presupuesto va al campo 'budget' (en el contrato se llama budget_atomic)", () => {
    expect(erroresDe({ ...CAMPOS_VALIDOS, budget: "150.000" }).budget).toBe(
      "Escribí un monto válido, sin comas ni puntos",
    );
    expect(erroresDe({ ...CAMPOS_VALIDOS, budget: "" }).budget).toBe("Escribí un monto válido, sin comas ni puntos");
    expect(erroresDe({ ...CAMPOS_VALIDOS, budget: "0" }).budget).toBe("El presupuesto tiene que ser mayor a cero");
  });

  it("si hay varios errores, marca todos los campos (uno por campo)", () => {
    const errores = erroresDe({ ...CAMPOS_VALIDOS, product: "", quantity: "", budget: "" });
    expect(Object.keys(errores).sort()).toEqual(["budget", "product", "quantity"]);
  });
});

describe("createdPurchaseUrl y readCreatedPurchase", () => {
  const ID = "3f2b8c1e-5d4a-4b6c-9e8f-1a2b3c4d5e6f";

  it("se entienden entre sí", () => {
    const url = new URL(createdPurchaseUrl(ID), "http://localhost");
    expect(url.pathname).toBe("/purchases/new");
    expect(readCreatedPurchase(Object.fromEntries(url.searchParams))).toBe(ID);
  });

  it("no acepta lo que no tiene forma de id, ni valores repetidos", () => {
    expect(readCreatedPurchase({})).toBeNull();
    expect(readCreatedPurchase({ created: "1" })).toBeNull();
    expect(readCreatedPurchase({ created: "<script>" })).toBeNull();
    expect(readCreatedPurchase({ created: [ID, ID] })).toBeNull();
  });
});

describe("resumen de la compra", () => {
  it("muestra la fecha en castellano sin correr el día", () => {
    expect(formatNeededBy("2026-11-09")).toBe("9 de noviembre de 2026");
  });

  it("muestra la cantidad con su unidad (vacía = unidades)", () => {
    expect(formatQuantity(500, "cajas")).toBe("500 cajas");
    expect(formatQuantity(1500, "")).toBe("1.500 unidades");
    expect(formatQuantity(1, "")).toBe("1 unidad");
  });
});
