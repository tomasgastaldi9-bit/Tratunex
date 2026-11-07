import type { ZodError } from "zod";

/**
 * Lógica "pura" del formulario del perfil de empresa: sin React, sin base de
 * datos y sin "use client". Por eso se puede probar con Vitest (ver el .test.ts
 * de al lado) y la usan tanto la acción del servidor como el formulario.
 *
 * Ojo: si algún día este archivo necesita importar un VALOR de otro archivo,
 * usá una ruta relativa (../../../contracts/agent) y no "@/": Vitest no
 * entiende el alias "@/". Con "import type" no hay problema.
 */

/**
 * Lo que escribió la persona en el formulario, todavía SIN validar.
 * Tiene la misma forma que el perfil del contrato (CompanyProfile), pero con
 * tipos más "sueltos" (rubro y tono son texto cualquiera): así podemos
 * devolverle al formulario exactamente lo que escribió, aunque esté mal.
 */
export type ProfileFormValues = {
  industry: string;
  offering: string;
  target_customer: string;
  value_proposition: string;
  zone: string;
  tone: string;
  call_window: { days: number[]; start: string; end: string };
};

/** Lo que arma readProfileForm: el action_id aparte y el pedido para saveCompanyProfile. */
export type ProfileFormSubmission = {
  action_id: string;
  input: { base_version: number | null; profile: ProfileFormValues };
};

/**
 * Nombres de los campos del formulario (el atributo name de cada uno).
 * Son también las claves de los errores por campo.
 */
export const PROFILE_FIELD_NAMES = [
  "industry",
  "offering",
  "target_customer",
  "value_proposition",
  "zone",
  "tone",
  "days",
  "start",
  "end",
  "base_version",
  "action_id",
] as const;
export type ProfileFieldName = (typeof PROFILE_FIELD_NAMES)[number];

/** Un mensaje de error por campo. Si un campo no está, es que no tiene error. */
export type ProfileFieldErrors = Partial<Record<ProfileFieldName, string>>;

/**
 * Lee un campo de texto del formulario. Si no vino (o vino un archivo en vez
 * de texto), devuelve "" para que la validación diga qué falta.
 */
function texto(formData: FormData, nombre: ProfileFieldName): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * Convierte los campos del formulario en el pedido que espera el servidor.
 * No valida nada: eso lo hace después el contrato (saveCompanyProfileInputSchema).
 *
 * El navegador manda TODO como texto, así que acá hacemos las conversiones:
 *  - "days" llega una vez por cada casilla marcada ("1", "3", "5"): lo
 *    juntamos en una lista de números. Algo que no es número queda como NaN
 *    y la validación lo rechaza.
 *  - "base_version" vacío quiere decir "todavía no hay versión" (null).
 */
export function readProfileForm(formData: FormData): ProfileFormSubmission {
  const baseVersion = texto(formData, "base_version");

  return {
    action_id: texto(formData, "action_id"),
    input: {
      base_version: baseVersion === "" ? null : Number(baseVersion),
      profile: {
        industry: texto(formData, "industry"),
        offering: texto(formData, "offering"),
        target_customer: texto(formData, "target_customer"),
        value_proposition: texto(formData, "value_proposition"),
        zone: texto(formData, "zone"),
        tone: texto(formData, "tone"),
        call_window: {
          days: formData.getAll("days").map((dia) => (typeof dia === "string" ? Number(dia) : Number.NaN)),
          start: texto(formData, "start"),
          end: texto(formData, "end"),
        },
      },
    },
  };
}

/** true si el texto es uno de los nombres de campo del formulario. */
function esCampo(nombre: string): nombre is ProfileFieldName {
  return (PROFILE_FIELD_NAMES as readonly string[]).includes(nombre);
}

/**
 * Convierte el error de validación del contrato en un mensaje por campo,
 * para mostrarlo debajo de cada uno.
 *
 * Zod dice DÓNDE está cada error con un "camino" (path). Por ejemplo:
 *  - ["profile", "offering"]               → campo "offering"
 *  - ["profile", "call_window", "end"]     → campo "end"
 *  - ["profile", "call_window", "days", 0] → campo "days" (el 0 es la posición en la lista)
 * La regla: el campo es el ÚLTIMO pedazo del camino que sea texto.
 *
 * Si un campo tiene varios errores, nos quedamos con el primero: mostrar
 * uno por vez es más fácil de leer.
 */
export function profileFieldErrors(error: ZodError): ProfileFieldErrors {
  const errores: ProfileFieldErrors = {};

  for (const problema of error.issues) {
    const nombre = problema.path.findLast((parte): parte is string => typeof parte === "string");
    if (nombre !== undefined && esCampo(nombre) && errores[nombre] === undefined) {
      errores[nombre] = problema.message;
    }
  }

  return errores;
}
