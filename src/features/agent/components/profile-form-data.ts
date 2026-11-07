import type { ZodError } from "zod";

/**
 * Lógica "pura" del formulario del perfil de empresa: sin React, sin base de
 * datos y sin "use client". Por eso se puede probar con Vitest (ver el .test.ts
 * de al lado) y la usan la acción del servidor, la página y el formulario.
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
 *
 * Los saltos de línea los dejamos siempre como "\n". ¿Por qué? En la pantalla,
 * el límite de caracteres (maxLength) cuenta un Enter como 1 caracter, pero al
 * ENVIAR el formulario el navegador lo manda como "\r\n" (2 caracteres). Sin
 * esto, un texto de 600 caracteres con Enters llegaría con más de 600, la
 * validación lo rechazaría aunque en pantalla entraba justo, y además
 * guardaríamos los "\r" de más.
 */
function texto(formData: FormData, nombre: ProfileFieldName): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor.replace(/\r\n/g, "\n") : "";
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

// ---------------------------------------------------------------------------
// action_id: qué identificador lleva cada guardado (README del módulo, "action_id")
// ---------------------------------------------------------------------------
//
// Estas funciones NO crean el id nuevo ellas mismas: lo piden con "nuevoId",
// una función que les pasamos. En la app le pasamos () => crypto.randomUUID();
// en los tests, una que devuelve siempre el mismo texto. Así la prueba puede
// saber exactamente qué id esperar (un UUID al azar no se puede adivinar).

/**
 * El action_id de ESTE envío: el que vino en el campo oculto del formulario.
 * El navegador lo puede mandar vacío (o no mandarlo); sin action_id la base no
 * puede evitar duplicados, así que en ese caso usamos uno nuevo.
 */
export function actionIdForSubmission(actionIdDelFormulario: string, nuevoId: () => string): string {
  return actionIdDelFormulario.trim() === "" ? nuevoId() : actionIdDelFormulario;
}

/**
 * Qué action_id tiene que usar el PRÓXIMO intento después de un error:
 *  - retryable true (la base no respondió): el MISMO, para reintentar sin
 *    duplicar. Si en realidad se había guardado, la base devuelve lo mismo.
 *  - retryable false (datos, permisos, conflicto): uno NUEVO, porque el
 *    próximo intento va a ser otro pedido distinto.
 */
export function actionIdAfterError(
  error: { retryable: boolean },
  actionIdActual: string,
  nuevoId: () => string,
): string {
  return error.retryable ? actionIdActual : nuevoId();
}

// ---------------------------------------------------------------------------
// Aviso de "guardamos": viaja en la dirección (?saved=3&created=1)
// ---------------------------------------------------------------------------
//
// Después de guardar, la acción redirige a la página con dos datos en la
// dirección. Quien ARMA la dirección (savedProfileUrl, en la acción) y quien la
// LEE (readSavedNotice, en la página) están acá juntos a propósito: si un día
// cambia un nombre, se cambian los dos a la vez y no se desincronizan.

/** Lo que pasó al guardar: qué versión quedó y si se creó una nueva. */
export type SavedNotice = { version: number; created: boolean };

/** Arma la dirección a la que vuelve la acción después de guardar bien. */
export function savedProfileUrl({ version, created }: SavedNotice): string {
  return `/agent/profile?saved=${version}&created=${created ? 1 : 0}`;
}

/**
 * Lee el aviso de la dirección (lo contrario de savedProfileUrl).
 * Devuelve null si no hay aviso o si algo no tiene la forma esperada: la
 * dirección la puede escribir cualquiera a mano, así que no confiamos en ella.
 *  - saved: un número entero desde 1.
 *  - created: "1" (se creó una versión nueva) o "0" (no había cambios).
 */
export function readSavedNotice(params: Record<string, string | string[] | undefined>): SavedNotice | null {
  const { saved, created } = params;
  // Si el dato vino repetido (?saved=1&saved=2) llega como lista: no lo aceptamos.
  if (typeof saved !== "string" || typeof created !== "string") return null;

  const version = Number(saved);
  if (!Number.isSafeInteger(version) || version < 1) return null;

  if (created === "1") return { version, created: true };
  if (created === "0") return { version, created: false };
  return null;
}
