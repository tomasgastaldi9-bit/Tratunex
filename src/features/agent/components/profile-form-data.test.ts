import { describe, expect, it, vi } from "vitest";
// Ruta relativa (y no "@/"): Vitest no entiende el alias "@/" en este proyecto.
import { PROFILE_TEXT_MAX, saveCompanyProfileInputSchema } from "../../../contracts/agent";
import {
  actionIdAfterError,
  actionIdForSubmission,
  profileFieldErrors,
  readProfileForm,
  readSavedNotice,
  savedProfileUrl,
} from "./profile-form-data";

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

  it("cambia los saltos de línea \\r\\n por \\n (así un texto que entraba en pantalla no se pasa del máximo)", () => {
    // En pantalla esto tiene justo el máximo (600): el Enter cuenta como 1.
    const enPantalla = `${"a".repeat(PROFILE_TEXT_MAX / 2 - 1)}\n${"b".repeat(PROFILE_TEXT_MAX / 2)}`;
    expect(enPantalla.length).toBe(PROFILE_TEXT_MAX);
    // Pero el navegador lo ENVÍA con "\r\n": 1 caracter más.
    const comoLoEnvia = enPantalla.replace(/\n/g, "\r\n");
    expect(comoLoEnvia.length).toBe(PROFILE_TEXT_MAX + 1);

    const { input } = readProfileForm(armarFormulario({ ...CAMPOS_VALIDOS, offering: comoLoEnvia }));

    expect(input.profile.offering).toBe(enPantalla);
    expect(input.profile.offering).not.toContain("\r");
    // Y pasa la validación del contrato, como en la pantalla.
    expect(saveCompanyProfileInputSchema.safeParse(input).success).toBe(true);
    // Sin el arreglo (con el "\r\n" tal cual llegó) la validación lo rechazaría.
    const sinArreglo = { ...input, profile: { ...input.profile, offering: comoLoEnvia } };
    expect(saveCompanyProfileInputSchema.safeParse(sinArreglo).success).toBe(false);
  });
});

describe("action_id", () => {
  // Un "creador de ids" falso: siempre devuelve el mismo texto, así sabemos
  // qué esperar. vi.fn además cuenta cuántas veces lo llamaron.
  const nuevoId = () => vi.fn(() => "id-nuevo");

  describe("actionIdForSubmission", () => {
    it("usa el action_id que vino en el formulario", () => {
      const crear = nuevoId();
      expect(actionIdForSubmission("id-del-formulario", crear)).toBe("id-del-formulario");
      expect(crear).not.toHaveBeenCalled();
    });

    it("crea uno nuevo si vino vacío o solo con espacios", () => {
      expect(actionIdForSubmission("", nuevoId())).toBe("id-nuevo");
      expect(actionIdForSubmission("   ", nuevoId())).toBe("id-nuevo");
    });
  });

  describe("actionIdAfterError", () => {
    it("conserva el MISMO action_id si el error se puede reintentar (retryable true)", () => {
      const crear = nuevoId();
      expect(actionIdAfterError({ retryable: true }, "id-actual", crear)).toBe("id-actual");
      expect(crear).not.toHaveBeenCalled();
    });

    it("usa uno NUEVO si el error no se arregla reintentando (retryable false)", () => {
      const crear = nuevoId();
      expect(actionIdAfterError({ retryable: false }, "id-actual", crear)).toBe("id-nuevo");
      expect(crear).toHaveBeenCalledTimes(1);
    });
  });
});

describe("aviso de guardado en la dirección", () => {
  /** Hace lo que hace Next: toma lo que va después del "?" y lo convierte en un objeto. */
  function parametrosDe(direccion: string): Record<string, string> {
    return Object.fromEntries(new URL(direccion, "http://localhost").searchParams);
  }

  it("arma la dirección con la versión y si se creó (1) o no (0)", () => {
    expect(savedProfileUrl({ version: 3, created: true })).toBe("/agent/profile?saved=3&created=1");
    expect(savedProfileUrl({ version: 3, created: false })).toBe("/agent/profile?saved=3&created=0");
  });

  it("lee de vuelta exactamente lo que armó savedProfileUrl", () => {
    for (const aviso of [
      { version: 1, created: true },
      { version: 7, created: false },
    ]) {
      expect(readSavedNotice(parametrosDe(savedProfileUrl(aviso)))).toEqual(aviso);
    }
  });

  it("devuelve null si no hay aviso", () => {
    expect(readSavedNotice({})).toBeNull();
    expect(readSavedNotice({ saved: "3" })).toBeNull();
  });

  it("devuelve null si la versión no es un entero desde 1", () => {
    for (const saved of ["0", "-1", "1.5", "abc", ""]) {
      expect(readSavedNotice({ saved, created: "1" })).toBeNull();
    }
  });

  it("devuelve null si created no es 1 ni 0, o si un dato vino repetido", () => {
    expect(readSavedNotice({ saved: "3", created: "si" })).toBeNull();
    expect(readSavedNotice({ saved: ["3", "4"], created: "1" })).toBeNull();
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
