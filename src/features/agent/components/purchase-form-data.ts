import type { ZodError } from "zod";
// Ruta relativa (y no "@/"): este archivo lo importa un test, y Vitest no
// entiende el alias "@/" para importar VALORES (con "import type" no hay problema).
import { pesosToAtomic } from "../../../contracts/purchases";

/**
 * Lógica "pura" del formulario "Nueva compra" (/purchases/new): sin React,
 * sin base de datos y sin "use client". Por eso se puede probar con Vitest
 * (ver el .test.ts de al lado) y la usan la acción del servidor, la página y
 * el formulario.
 *
 * Las reglas del action_id (actionIdForSubmission y actionIdAfterError) NO
 * están acá: son las mismas del perfil y se importan de profile-form-data.ts.
 */

/**
 * Lo que escribió la persona, todavía SIN validar y tal cual lo manda el
 * navegador: todo es texto. Así, si algo está mal, le devolvemos al
 * formulario exactamente lo que había escrito.
 *  - budget: el presupuesto en PESOS enteros (lo que entiende la persona).
 */
export type PurchaseFormValues = {
  product: string;
  quantity: string;
  unit: string;
  needed_by: string;
  budget: string;
  zone: string;
};

/** El formulario vacío: con esto arranca la pantalla (y vuelve a arrancar después de crear una compra). */
export const EMPTY_PURCHASE_VALUES: PurchaseFormValues = {
  product: "",
  quantity: "",
  unit: "",
  needed_by: "",
  budget: "",
  zone: "",
};

/**
 * Nombres de los campos del formulario (el atributo name de cada uno).
 * Son también las claves de los errores por campo.
 */
export const PURCHASE_FIELD_NAMES = ["product", "quantity", "unit", "needed_by", "budget", "zone"] as const;
export type PurchaseFieldName = (typeof PURCHASE_FIELD_NAMES)[number];

/** Un mensaje de error por campo. Si un campo no está, es que no tiene error. */
export type PurchaseFieldErrors = Partial<Record<PurchaseFieldName, string>>;

/**
 * Lo que arma readPurchaseForm:
 *  - action_id: aparte, porque va en el contexto y no en el pedido.
 *  - values: lo que escribió la persona (para devolvérselo si hay error).
 *  - input: el pedido para createPurchaseRequest, ya convertido (cantidad
 *    como número, presupuesto en unidades mínimas de ARGt), pero SIN validar.
 *    Tiene la misma forma que PurchaseRequestInput del contrato.
 */
export type PurchaseFormSubmission = {
  action_id: string;
  values: PurchaseFormValues;
  input: {
    product: string;
    quantity: number;
    unit: string;
    needed_by: string;
    budget_atomic: string;
    zone: string;
  };
};

/** Lee un campo de texto del formulario. Si no vino (o vino un archivo), devuelve "". */
function texto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * Pesos enteros escritos por la persona → unidades mínimas de ARGt, como texto.
 *
 * Solo acepta dígitos ("150000"). Cualquier otra cosa ("150.000", "12,5",
 * "abc" o vacío) devuelve "", y el contrato lo rechaza con su mensaje
 * ("Escribí un monto válido, sin comas ni puntos").
 *
 * ¿Por qué "" y no lo que escribió? Porque el contrato compara montos con
 * BigInt, y BigInt("12,5") "explota" (tira un error) en vez de decir que está
 * mal. BigInt("") en cambio da 0, que la validación rechaza prolijamente.
 *
 * La usa también el formulario de reglas de pago (policy-form-data.ts).
 */
export function pesosTextToAtomic(pesos: string): string {
  const limpio = pesos.trim();
  return /^\d+$/.test(limpio) ? pesosToAtomic(limpio) : "";
}

/**
 * Convierte los campos del formulario en el pedido que espera el servidor.
 * No valida nada: eso lo hace después el contrato (purchaseRequestInputSchema).
 *
 * El navegador manda TODO como texto, así que acá hacemos las conversiones:
 *  - "quantity": a número. Vacío queda como NaN ("no es un número") y la
 *    validación dice "Escribí la cantidad con números". (Ojo: Number("") da 0,
 *    por eso el vacío lo tratamos aparte.)
 *  - "budget": de pesos a unidades mínimas de ARGt (pesosTextToAtomic).
 */
export function readPurchaseForm(formData: FormData): PurchaseFormSubmission {
  const values: PurchaseFormValues = {
    product: texto(formData, "product"),
    quantity: texto(formData, "quantity"),
    unit: texto(formData, "unit"),
    needed_by: texto(formData, "needed_by"),
    budget: texto(formData, "budget"),
    zone: texto(formData, "zone"),
  };
  const cantidad = values.quantity.trim();

  return {
    action_id: texto(formData, "action_id"),
    values,
    input: {
      product: values.product,
      quantity: cantidad === "" ? Number.NaN : Number(cantidad),
      unit: values.unit,
      needed_by: values.needed_by.trim(),
      budget_atomic: pesosTextToAtomic(values.budget),
      zone: values.zone,
    },
  };
}

/** true si el texto es uno de los nombres de campo del formulario. */
function esCampo(nombre: string): nombre is PurchaseFieldName {
  return (PURCHASE_FIELD_NAMES as readonly string[]).includes(nombre);
}

/**
 * Convierte el error de validación del contrato en un mensaje por campo.
 *
 * Zod dice DÓNDE está cada error con un "camino" (path); acá el primer
 * pedazo es el nombre del dato ("product", "quantity"...). El único que se
 * llama distinto en el formulario es el presupuesto: en el contrato es
 * "budget_atomic" (unidades mínimas) y en el formulario "budget" (pesos).
 *
 * Si un campo tiene varios errores, nos quedamos con el primero: mostrar
 * uno por vez es más fácil de leer.
 */
export function purchaseFieldErrors(error: ZodError): PurchaseFieldErrors {
  const errores: PurchaseFieldErrors = {};

  for (const problema of error.issues) {
    const dato = problema.path[0];
    const nombre = dato === "budget_atomic" ? "budget" : dato;
    if (typeof nombre === "string" && esCampo(nombre) && errores[nombre] === undefined) {
      errores[nombre] = problema.message;
    }
  }

  return errores;
}

// ---------------------------------------------------------------------------
// Aviso de "creamos la compra": viaja en la dirección (?created=<id>)
// ---------------------------------------------------------------------------
//
// Quien ARMA la dirección (createdPurchaseUrl, en la acción) y quien la LEE
// (readCreatedPurchase, en la página) están acá juntos a propósito: si un día
// cambia el nombre, se cambian los dos a la vez y no se desincronizan.

/** Arma la dirección a la que vuelve la acción después de crear la compra. */
export function createdPurchaseUrl(purchaseRequestId: string): string {
  return `/purchases/new?created=${encodeURIComponent(purchaseRequestId)}`;
}

// Forma de un UUID: 8-4-4-4-12 caracteres hexadecimales.
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee el id de la compra recién creada (lo contrario de createdPurchaseUrl).
 * Devuelve null si no hay o si no tiene forma de id: la dirección la puede
 * escribir cualquiera a mano, así que no confiamos en ella (y la página
 * igual vuelve a leer la compra de la base antes de mostrarla).
 */
export function readCreatedPurchase(params: Record<string, string | string[] | undefined>): string | null {
  const { created } = params;
  // Si vino repetido (?created=a&created=b) llega como lista: no lo aceptamos.
  if (typeof created !== "string" || !FORMA_UUID.test(created)) return null;
  return created;
}

// ---------------------------------------------------------------------------
// Resumen de la compra creada
// ---------------------------------------------------------------------------

/**
 * "AAAA-MM-DD" → "9 de noviembre de 2026".
 * La fecha del contrato ya es "de Argentina" y no tiene hora. La armamos y
 * la mostramos en UTC a propósito: si usáramos la hora local, en algunos
 * husos horarios el día podría correrse al anterior.
 */
export function formatNeededBy(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * "500 cajas", "1.500 unidades", "1 unidad".
 * Unidad vacía quiere decir "unidades" (lo dice el contrato).
 */
export function formatQuantity(cantidad: number, unidad: string): string {
  const nombre = unidad.trim() !== "" ? unidad.trim() : cantidad === 1 ? "unidad" : "unidades";
  return `${cantidad.toLocaleString("es-AR")} ${nombre}`;
}
