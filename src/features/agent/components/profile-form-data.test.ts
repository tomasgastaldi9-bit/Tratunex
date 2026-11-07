import { describe, expect, it } from "vitest";
// Ruta relativa (y no "@/"): Vitest no entiende el alias "@/" en este proyecto.
import { saveCompanyProfileInputSchema } from "../../../contracts/agent";
import { profileFieldErrors, readProfileForm } from "./profile-form-data";

// Los campos de un formulario válido, como los manda el navegador: todo es texto.
// Cada prueba cambia solo lo que le interesa.
const CAMPOS_VALIDOS: Record<string, string | string[]> = {
  industry: "distributor",
  offering: "Insumos de limpieza para comercios",
  target_customer: "Almacenes y supermercados chicos",
  value_proposition: "Entrega en 24 h y precios de mayorista",
  zone: "CABA y GBA",
  tone: "professional_warm",
  days: ["1", "3", "5"],
  start: "09:00",
  end: "18:00",
  base_version: "",
  action_id: "accion-de-prueba",
};

/** Arma un FormData igual al que arma el navegador al enviar el formulario. */
function armarFormulario(campos: Record<string, string | string[]>): FormData {
  const formData = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) {
    // Un campo con varios valores (como "days") se agrega una vez por valor,
    // igual que hace el navegador con varias casillas marcadas.
    for (const unValor of Array.isArray(valor) ? valor : [valor]) {
      formData.append(nombre, unValor);
    }
  }
  return formData;
}

/** Valida los campos con el contrato y devuelve el error (falla la prueba si no hay error). */
function errorDe(campos: Record<string, string | string[]>) {
  const { input } = readProfileForm(armarFormulario(campos));
  const resultado = saveCompanyProfileInputSchema.safeParse(input);
  if (resultado.success) throw new Error("Se esperaba un error de validación");
  return resultado.error;
}

describe("readProfileForm", () => {
  it("arma el pedido con todos los campos y convierte los días a número", () => {
    const { action_id, input } = readProfileForm(armarFormulario(CAMPOS_VALIDOS));

    expect(action_id).toBe("accion-de-prueba");
    expect(input).toEqual({
      base_version: null,
      profile: {
        industry: "distributor",
        offering: "Insumos de limpieza para comercios",
        target_customer: "Almacenes y supermercados chicos",
        value_proposition: "Entrega en 24 h y precios de mayorista",
        zone: "CABA y GBA",
        tone: "professional_warm",
        call_window: { days: [1, 3, 5], start: "09:00", end: "18:00" },
      },
    });
    // Lo que arma tiene que pasar la validación del contrato tal cual.
    expect(saveCompanyProfileInputSchema.safeParse(input).success).toBe(true);
  });

  it("toma base_version vacío como null (primera versión)", () => {
    const { input } = readProfileForm(armarFormulario({ ...CAMPOS_VALIDOS, base_version: "" }));
    expect(input.base_version).toBeNull();
  });

  it("convierte base_version a número cuando viene escrito", () => {
    const { input } = readProfileForm(armarFormulario({ ...CAMPOS_VALIDOS, base_version: "4" }));
    expect(input.base_version).toBe(4);
  });

  it("acepta la zona vacía (es opcional)", () => {
    const { input } = readProfileForm(armarFormulario({ ...CAMPOS_VALIDOS, zone: "" }));
    expect(input.profile.zone).toBe("");
    expect(saveCompanyProfileInputSchema.safeParse(input).success).toBe(true);
  });

  it("devuelve una lista de días vacía si no se marcó ninguna casilla", () => {
    const sinDias = { ...CAMPOS_VALIDOS };
    delete sinDias.days;
    const { input } = readProfileForm(armarFormulario(sinDias));
    expect(input.profile.call_window.days).toEqual([]);
  });
});

describe("profileFieldErrors", () => {
  it("marca un texto obligatorio vacío con la clave del campo", () => {
    const errores = profileFieldErrors(errorDe({ ...CAMPOS_VALIDOS, offering: "   " }));
    expect(errores).toEqual({ offering: "Completá qué vende la empresa" });
  });

  it("marca los días cuando no se eligió ninguno", () => {
    const sinDias = { ...CAMPOS_VALIDOS };
    delete sinDias.days;
    const errores = profileFieldErrors(errorDe(sinDias));
    expect(errores).toEqual({ days: "Elegí al menos un día para llamar" });
  });

  it("marca la hora de fin cuando es anterior a la de inicio", () => {
    const errores = profileFieldErrors(errorDe({ ...CAMPOS_VALIDOS, start: "18:00", end: "09:00" }));
    expect(errores).toEqual({ end: "La hora de fin tiene que ser después de la de inicio" });
  });

  it("deja un solo mensaje por campo (el primero) aunque haya varios errores", () => {
    // Dos días inválidos dan dos errores, pero los dos son del campo "days".
    const error = errorDe({ ...CAMPOS_VALIDOS, days: ["8", "9"] });
    expect(error.issues.length).toBe(2);

    const errores = profileFieldErrors(error);
    expect(Object.keys(errores)).toEqual(["days"]);
    expect(errores.days).toBe(error.issues[0]?.message);
  });

  it("junta errores de campos distintos en el mismo objeto", () => {
    const errores = profileFieldErrors(
      errorDe({ ...CAMPOS_VALIDOS, target_customer: "", end: "25:00" }),
    );
    expect(errores).toEqual({
      target_customer: "Completá a quién le vende",
      end: "Escribí la hora como 09:00",
    });
  });
});
