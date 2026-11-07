import type { ZodError } from "zod";
// Ruta relativa (y no "@/"): este archivo lo importa un test, y Vitest no
// entiende el alias "@/" para importar VALORES (con "import type" no hay problema).
import { KNOWLEDGE_TEXT_MAX, type FaqItem, type ProductItem } from "../../../contracts/agent";
import type { SavedNotice } from "./profile-form-data";

/**
 * Lógica "pura" del editor de la base de conocimiento: sin React, sin base de
 * datos y sin "use client". Por eso se puede probar con Vitest (ver el .test.ts
 * de al lado) y la usan la acción del servidor y el editor.
 *
 * Las reglas del action_id y la lectura del aviso "guardamos" (readSavedNotice)
 * NO están acá: son las mismas del perfil y se importan de profile-form-data.ts,
 * así hay un solo lugar donde se escriben.
 */

/**
 * Lo que arma readKnowledgeForm: el action_id aparte y el pedido para
 * saveAgentKnowledge, todavía SIN validar.
 *
 * "knowledge" es unknown ("no sabemos qué es") a propósito: viene de un campo
 * oculto que el navegador puede mandar cambiado, así que hasta que el contrato
 * lo valide no damos por hecho que sea una lista de ítems.
 */
export type KnowledgeFormSubmission = {
  action_id: string;
  input: { base_version: number; knowledge: unknown };
};

/** Lee un campo de texto del formulario. Si no vino (o vino un archivo), devuelve "". */
function texto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * Convierte el JSON del campo oculto en un valor de JavaScript.
 * Si el texto no es JSON válido, JSON.parse "tira" un error; lo atrapamos y
 * devolvemos null. null no es una lista, así que después la validación lo
 * rechaza con un error prolijo, en vez de que la acción explote.
 */
function leerJson(textoJson: string): unknown {
  try {
    return JSON.parse(textoJson);
  } catch {
    return null;
  }
}

/**
 * Convierte los campos del formulario en el pedido que espera el servidor.
 * No valida nada: eso lo hace después el contrato (saveAgentKnowledgeInputSchema).
 *
 *  - "knowledge": la lista ENTERA viaja como texto JSON en un campo oculto
 *    (el editor la arma con JSON.stringify). Acá la volvemos a convertir.
 *  - "base_version": el navegador la manda como texto. Vacía quiere decir que
 *    algo anduvo mal (para cargar conocimiento SIEMPRE hay una versión), así
 *    que la dejamos como NaN ("no es un número") y la validación la rechaza.
 */
export function readKnowledgeForm(formData: FormData): KnowledgeFormSubmission {
  const baseVersion = texto(formData, "base_version").trim();

  return {
    action_id: texto(formData, "action_id"),
    input: {
      base_version: baseVersion === "" ? Number.NaN : Number(baseVersion),
      knowledge: leerJson(texto(formData, "knowledge")),
    },
  };
}

// ---------------------------------------------------------------------------
// Errores por campo
// ---------------------------------------------------------------------------

/** Los campos de texto que puede tener un ítem (producto o pregunta). */
export type KnowledgeItemField = Exclude<keyof ProductItem | keyof FaqItem, "kind">;

const CAMPOS_DE_ITEM: readonly KnowledgeItemField[] = ["name", "description", "price_hint", "question", "answer"];

/**
 * Un mensaje de error por clave. Hay dos tipos de clave:
 *  - "<posición>.<campo>", por ejemplo "2.name": el campo "name" del tercer
 *    ítem (la posición arranca en 0, como en las listas de JavaScript).
 *  - "_list": un error de la lista entera (demasiados ítems o demasiados
 *    caracteres) o de datos que llegaron rotos. Se muestra en el aviso general.
 * Si una clave no está, es que no tiene error.
 */
export type KnowledgeFieldErrors = Partial<Record<`${number}.${KnowledgeItemField}` | "_list", string>>;

/**
 * Mensaje para cuando lo que llegó no tiene la forma esperada (JSON roto, un
 * tipo de ítem que no existe, sin versión). No es algo que la persona haya
 * escrito mal en un campo, así que le decimos qué hacer: recargar.
 * (Además, Zod escribe esos errores en inglés: no los mostramos tal cual.)
 */
export const KNOWLEDGE_UNREADABLE_MESSAGE = "No pudimos leer la lista. Recargá la página y probá de nuevo.";

/** true si el texto es uno de los campos de un ítem. */
function esCampoDeItem(nombre: PropertyKey | undefined): nombre is KnowledgeItemField {
  return typeof nombre === "string" && (CAMPOS_DE_ITEM as readonly string[]).includes(nombre);
}

/**
 * Convierte el error de validación del contrato en un mensaje por clave.
 *
 * Zod dice DÓNDE está cada error con un "camino" (path). Por ejemplo:
 *  - ["knowledge", 2, "name"] → el nombre del ítem 2       → clave "2.name"
 *  - ["knowledge"]            → la lista entera             → clave "_list"
 *  - ["base_version"]         → dato oculto, no un campo    → clave "_list"
 *
 * Los errores "invalid_type" (llegó un tipo de dato equivocado, por ejemplo
 * texto donde va una lista) solo pasan si los datos ocultos llegaron rotos:
 * van a "_list" con el mensaje de "recargá la página".
 *
 * Si una clave tiene varios errores, nos quedamos con el primero: mostrar
 * uno por vez es más fácil de leer.
 */
export function knowledgeFieldErrors(error: ZodError): KnowledgeFieldErrors {
  const errores: KnowledgeFieldErrors = {};

  for (const problema of error.issues) {
    const [raiz, posicion, campo] = problema.path;
    let clave: keyof KnowledgeFieldErrors = "_list";
    let mensaje = KNOWLEDGE_UNREADABLE_MESSAGE;

    if (problema.code !== "invalid_type" && raiz === "knowledge") {
      if (typeof posicion === "number" && esCampoDeItem(campo)) {
        // Un campo de un ítem (por ejemplo, el nombre vacío).
        clave = `${posicion}.${campo}`;
        mensaje = problema.message;
      } else if (posicion === undefined) {
        // La lista entera: los mensajes del contrato ya están en español.
        mensaje = problema.message;
      }
    }

    if (errores[clave] === undefined) {
      errores[clave] = mensaje;
    }
  }

  return errores;
}

/**
 * El título del Alert cuando no se pudo guardar por datos mal cargados.
 *  - Si hay al menos un campo de un ítem marcado, el título manda a mirarlos.
 *  - Si el ÚNICO error es el de la lista entera ("_list": demasiados ítems,
 *    se pasó del máximo o datos ilegibles), no hay ningún campo marcado:
 *    decir "Revisá los campos marcados" confundiría. Usamos ese mensaje como título.
 */
export const KNOWLEDGE_FIELDS_TITLE = "Revisá los campos marcados.";

export function knowledgeFailureTitle(errores: KnowledgeFieldErrors): string {
  const hayCampoMarcado = Object.keys(errores).some((clave) => clave !== "_list");
  return !hayCampoMarcado && errores._list !== undefined ? errores._list : KNOWLEDGE_FIELDS_TITLE;
}

// ---------------------------------------------------------------------------
// Aviso de "guardamos": viaja en la dirección (?saved=3&created=1)
// ---------------------------------------------------------------------------

/**
 * Arma la dirección a la que vuelve la acción después de guardar bien.
 * Es igual a savedProfileUrl pero para /agent/knowledge. La página la lee con
 * readSavedNotice (de profile-form-data.ts): los nombres "saved" y "created"
 * son los mismos, y el test de al lado comprueba que se entienden entre sí.
 */
export function savedKnowledgeUrl({ version, created }: SavedNotice): string {
  return `/agent/knowledge?saved=${version}&created=${created ? 1 : 0}`;
}

// ---------------------------------------------------------------------------
// Contador de caracteres ("1.234 de 6.000 caracteres")
// ---------------------------------------------------------------------------

/** Formato argentino: punto para los miles (6.000, no 6,000). */
const formatoNumero = new Intl.NumberFormat("es-AR");

/** El texto del contador. Recibe cuántos caracteres se usaron (knowledgeTextLength). */
export function knowledgeCounterText(usados: number): string {
  return `${formatoNumero.format(usados)} de ${formatoNumero.format(KNOWLEDGE_TEXT_MAX)} caracteres`;
}

/** Color del contador; coincide con los tonos de Badge del kit. */
export type KnowledgeCounterTone = "neutral" | "warning" | "danger";

/**
 * Qué color lleva el contador:
 *  - "neutral": hay lugar de sobra.
 *  - "warning": desde el 90 % del máximo, para avisar ANTES de llegar.
 *  - "danger": se pasó del máximo; así no se puede guardar.
 * Justo en el máximo todavía se puede guardar, por eso es "warning".
 */
export function knowledgeCounterTone(usados: number): KnowledgeCounterTone {
  if (usados > KNOWLEDGE_TEXT_MAX) return "danger";
  if (usados >= KNOWLEDGE_TEXT_MAX * 0.9) return "warning";
  return "neutral";
}
