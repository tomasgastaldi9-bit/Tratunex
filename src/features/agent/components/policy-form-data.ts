import type { ZodError } from "zod";
// Rutas relativas (y no "@/"): este archivo lo importa un test, y Vitest no
// entiende el alias "@/" para importar VALORES (con "import type" no hay problema).
import {
  atomicToPesos,
  decidePurchasePolicy,
  pesosToAtomic,
  type PolicyCheck,
  type PurchasePolicy,
} from "../../../contracts/purchases";
import { pesosTextToAtomic } from "./purchase-form-data";

/**
 * Lógica "pura" del formulario de reglas de pago (/agent/rules): sin React,
 * sin base de datos y sin "use client". Por eso se puede probar con Vitest
 * (ver el .test.ts de al lado) y la usan la acción del servidor, la página y
 * el formulario.
 *
 * Las reglas del action_id NO están acá: son las mismas del perfil y se
 * importan de profile-form-data.ts.
 */

/**
 * Lo que muestra y escribe la persona, todavía SIN validar.
 * Los montos van en PESOS enteros y como texto (tal cual los escribió).
 */
export type PolicyFormValues = {
  max_per_purchase: string;
  auto_pay_limit: string;
  only_allowed_suppliers: boolean;
  allowed_supplier_ids: string[];
};

/**
 * Nombres de los campos del formulario (el atributo name de cada uno).
 * Son también las claves de los errores por campo.
 */
export const POLICY_FIELD_NAMES = [
  "max_per_purchase",
  "auto_pay_limit",
  "allowed_supplier_ids",
] as const;
export type PolicyFieldName = (typeof POLICY_FIELD_NAMES)[number];

/** Un mensaje de error por campo. Si un campo no está, es que no tiene error. */
export type PolicyFieldErrors = Partial<Record<PolicyFieldName, string>>;

/** Lo que arma readPolicyForm: el action_id aparte y las reglas para savePurchasePolicy (sin validar). */
export type PolicyFormSubmission = {
  action_id: string;
  policy: PurchasePolicy;
};

/** Lee un campo de texto del formulario. Si no vino (o vino un archivo), devuelve "". */
function texto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * Convierte los campos del formulario en las reglas que espera el servidor.
 * No valida nada: eso lo hace después el contrato (purchasePolicySchema).
 *
 *  - Los montos: de pesos a unidades mínimas de ARGt (pesosTextToAtomic). Si
 *    no son solo dígitos quedan vacíos y el contrato dice qué está mal.
 *  - "only_allowed_suppliers": una casilla. El navegador la manda SOLO si
 *    está marcada; si no vino, es false.
 *  - "allowed_supplier_ids": llega una vez por cada proveedor marcado; lo
 *    juntamos en una lista.
 */
export function readPolicyForm(formData: FormData): PolicyFormSubmission {
  return {
    action_id: texto(formData, "action_id"),
    policy: {
      max_per_purchase_atomic: pesosTextToAtomic(texto(formData, "max_per_purchase")),
      auto_pay_limit_atomic: pesosTextToAtomic(texto(formData, "auto_pay_limit")),
      only_allowed_suppliers: formData.get("only_allowed_suppliers") !== null,
      allowed_supplier_ids: formData.getAll("allowed_supplier_ids").filter((id) => typeof id === "string"),
    },
  };
}

/**
 * Mensaje para cuando la lista de proveedores llegó rota (un id que no es id).
 * No es algo que la persona haya escrito mal, así que le decimos qué hacer.
 * (Además, Zod escribe ese error en inglés: no lo mostramos tal cual.)
 */
export const SUPPLIERS_UNREADABLE_MESSAGE = "No pudimos leer la lista de proveedores. Recargá la página y probá de nuevo.";

/**
 * Convierte el error de validación del contrato en un mensaje por campo.
 *
 * Zod dice DÓNDE está cada error con un "camino" (path). Por ejemplo:
 *  - ["max_per_purchase_atomic"] → campo "max_per_purchase"
 *  - ["auto_pay_limit_atomic"]   → campo "auto_pay_limit" (también el de
 *    "lo que paga solo no puede superar el máximo")
 *  - ["allowed_supplier_ids"]    → la lista de proveedores
 *  - ["allowed_supplier_ids", 2] → un id roto en la posición 2 de la lista
 *
 * Si un campo tiene varios errores, nos quedamos con el primero.
 */
export function policyFieldErrors(error: ZodError): PolicyFieldErrors {
  const errores: PolicyFieldErrors = {};

  for (const problema of error.issues) {
    const [dato, posicion] = problema.path;
    let campo: PolicyFieldName | null = null;
    let mensaje = problema.message;

    if (dato === "max_per_purchase_atomic") campo = "max_per_purchase";
    else if (dato === "auto_pay_limit_atomic") campo = "auto_pay_limit";
    else if (dato === "allowed_supplier_ids") {
      campo = "allowed_supplier_ids";
      if (typeof posicion === "number") mensaje = SUPPLIERS_UNREADABLE_MESSAGE;
    }

    if (campo !== null && errores[campo] === undefined) {
      errores[campo] = mensaje;
    }
  }

  return errores;
}

/**
 * Las reglas guardadas → lo que muestra el formulario (montos en pesos).
 * Sin reglas (null), arranca vacío y con el filtro de proveedores apagado.
 */
export function policyToFormValues(policy: PurchasePolicy | null): PolicyFormValues {
  if (policy === null) {
    return { max_per_purchase: "", auto_pay_limit: "", only_allowed_suppliers: false, allowed_supplier_ids: [] };
  }
  return {
    max_per_purchase: atomicToPesos(policy.max_per_purchase_atomic).toString(),
    auto_pay_limit: atomicToPesos(policy.auto_pay_limit_atomic).toString(),
    only_allowed_suppliers: policy.only_allowed_suppliers,
    allowed_supplier_ids: policy.allowed_supplier_ids,
  };
}

// ---------------------------------------------------------------------------
// Aviso de "guardamos las reglas": viaja en la dirección (?saved=1)
// ---------------------------------------------------------------------------

/** Arma la dirección a la que vuelve la acción después de guardar bien. */
export function savedPolicyUrl(): string {
  return "/agent/rules?saved=1";
}

/** true si la dirección dice que recién se guardaron las reglas (lo contrario de savedPolicyUrl). */
export function readPolicySaved(params: Record<string, string | string[] | undefined>): boolean {
  return params.saved === "1";
}

// ---------------------------------------------------------------------------
// "Así decide el agente": ejemplos calculados con la MISMA regla del servidor
// ---------------------------------------------------------------------------

/** Un ejemplo: un monto de compra y qué haría el agente con él. */
export type PolicyExample = { amount_atomic: string; check: PolicyCheck };

/**
 * Los ejemplos, o por qué todavía no se pueden mostrar (montos incompletos
 * o al revés). Tiene la misma forma que Result: ok true con datos, ok false con mensaje.
 */
export type PolicyExamples =
  | { ok: true; examples: PolicyExample[] }
  // reason "no_suppliers": el filtro está activo y no hay ningún proveedor
  // tildado; la pantalla lo muestra como aviso en vez de un texto suelto.
  | { ok: false; message: string; reason?: "no_suppliers" };

/** Pesos escritos (solo dígitos) → número entero grande (BigInt), o null si no es un monto. */
function leerPesos(pesos: string): bigint | null {
  const limpio = pesos.trim();
  return /^\d+$/.test(limpio) ? BigInt(limpio) : null;
}

/**
 * Arma hasta tres ejemplos con lo que está escrito AHORA en el formulario:
 *  1. Un monto bajo el límite (la mitad del límite) → paga solo.
 *  2. Uno entre el límite y el máximo (a mitad de camino) → pide aprobación.
 *  3. Uno arriba del máximo (un 20 % más) → rechaza.
 * La decisión NO la calculamos acá: la pide a decidePurchasePolicy, la misma
 * función que usa el servidor antes de pagar. Así la pantalla nunca puede
 * prometer algo distinto de lo que hace el agente.
 *
 * Si un ejemplo no puede existir, no se muestra: con límite 0 no hay compra
 * "bajo el límite", y con límite igual al máximo no hay nada "entre los dos".
 *
 * Si el filtro de proveedores está activo, el ejemplo es con el primer
 * proveedor marcado. Si no hay ninguno, no hay ejemplos: tres "Rechaza"
 * iguales no ayudan, mejor avisar que falta elegir (reason "no_suppliers").
 */
export function policyExamples(values: PolicyFormValues): PolicyExamples {
  const maximo = leerPesos(values.max_per_purchase);
  const limite = leerPesos(values.auto_pay_limit);
  if (maximo === null || limite === null) {
    return { ok: false, message: "Escribí los dos montos para ver cómo decide el agente." };
  }
  if (limite > maximo) {
    return { ok: false, message: "Lo que el agente paga solo no puede superar el máximo por compra." };
  }

  if (values.only_allowed_suppliers && values.allowed_supplier_ids.length === 0) {
    return {
      ok: false,
      reason: "no_suppliers",
      message: "Elegí al menos un proveedor permitido. Si no, el agente no le puede pagar a nadie.",
    };
  }

  const reglas: PurchasePolicy = {
    max_per_purchase_atomic: pesosToAtomic(maximo),
    auto_pay_limit_atomic: pesosToAtomic(limite),
    only_allowed_suppliers: values.only_allowed_suppliers,
    allowed_supplier_ids: values.allowed_supplier_ids,
  };
  const proveedor = values.allowed_supplier_ids[0] ?? "";

  // Usamos BigInt(1), BigInt(2)… y no "1n": el proyecto compila para una
  // versión de JavaScript que todavía no entiende esa forma corta.
  const cero = BigInt(0);
  const uno = BigInt(1);
  const dos = BigInt(2);
  const montos: bigint[] = [];
  // 1. Bajo el límite: la mitad (o el límite mismo si es 1 peso).
  if (limite >= uno) montos.push(limite / dos > cero ? limite / dos : limite);
  // 2. Entre el límite y el máximo: a mitad de camino, y al menos 1 peso arriba del límite.
  if (maximo > limite) {
    const medio = limite + (maximo - limite) / dos;
    montos.push(medio > limite ? medio : limite + uno);
  }
  // 3. Arriba del máximo: un 20 % más (al menos 1 peso más).
  const extra = maximo / BigInt(5);
  montos.push(maximo + (extra > cero ? extra : uno));

  return {
    ok: true,
    examples: montos.map((pesos) => {
      const amount_atomic = pesosToAtomic(pesos);
      return { amount_atomic, check: decidePurchasePolicy(reglas, amount_atomic, proveedor) };
    }),
  };
}
