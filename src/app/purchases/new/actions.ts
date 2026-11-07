"use server";
// "use server": esta función corre SOLO en el servidor, aunque la llame el
// formulario desde el navegador. Por eso acá podemos hablar con la base sin
// mostrarle nada secreto a la persona.

import { redirect } from "next/navigation";
import { purchaseRequestInputSchema } from "@/contracts/purchases";
// Las reglas del action_id son las mismas que las del perfil: las reusamos.
import { actionIdAfterError, actionIdForSubmission } from "@/features/agent/components/profile-form-data";
import {
  createdPurchaseUrl,
  purchaseFieldErrors,
  readPurchaseForm,
  type PurchaseFieldErrors,
  type PurchaseFormValues,
} from "@/features/agent/components/purchase-form-data";
import { createPurchaseRequest } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Lo que la acción le devuelve al formulario cuando NO pudo crear la compra.
 * (Si sale bien, no devuelve nada: redirige a la página con "?created=<id>".)
 */
export type CreatePurchaseState = {
  /** Mensaje general arriba del botón (null = no hay error). */
  message: string | null;
  /** Un mensaje por campo, para mostrar debajo de cada uno. */
  fieldErrors: PurchaseFieldErrors;
  /** Lo que había escrito la persona, para no borrárselo. */
  values: PurchaseFormValues;
  /** El action_id que tiene que usar el próximo intento (ver README, "action_id"). */
  action_id: string;
  /**
   * Número de respuesta: 0 al abrir la página y +1 en cada respuesta.
   * El formulario lo usa como "key" para volver a dibujarse con los valores
   * de arriba (React 19 vacía el formulario después de cada envío).
   */
  attempt: number;
};

/**
 * Cómo se crea un action_id nuevo (las reglas de CUÁNDO usar uno nuevo están
 * en profile-form-data.ts). Va con flecha para llamarla siempre como
 * crypto.randomUUID(): pasarla "suelta", sin el crypto adelante, falla.
 */
const nuevoActionId = () => crypto.randomUUID();

/**
 * Crea la compra. La usa PurchaseRequestForm con useActionState: React le
 * pasa el estado anterior (prevState) y los datos del formulario.
 */
export async function createPurchaseAction(
  prevState: CreatePurchaseState,
  formData: FormData,
): Promise<CreatePurchaseState> {
  // prevState viene del navegador: no confiamos en nada de lo que trae.
  // Solo usamos su número de respuesta para sumarle 1.
  const attempt = (typeof prevState?.attempt === "number" ? prevState.attempt : 0) + 1;

  // 1. Leer y validar lo que mandó el formulario (los pesos ya vienen
  //    convertidos a unidades mínimas de ARGt).
  const { action_id: actionIdDelFormulario, values, input } = readPurchaseForm(formData);
  // Si el navegador no mandó el action_id, armamos uno acá, del lado del servidor.
  const action_id = actionIdForSubmission(actionIdDelFormulario, nuevoActionId);
  const validado = purchaseRequestInputSchema.safeParse(input);
  if (!validado.success) {
    return {
      message: "Revisá los campos marcados.",
      fieldErrors: purchaseFieldErrors(validado.error),
      values,
      // Datos mal: reintentar igual no lo arregla, así que va otro action_id.
      action_id: actionIdAfterError({ retryable: false }, action_id, nuevoActionId),
      attempt,
    };
  }

  // 2. ¿Quién es y de qué empresa? Lo decide el servidor (nunca el navegador).
  //    Desde una acción se llama sin opciones: acá sí se pueden actualizar cookies.
  const contexto = await getCompanyContext();
  if (!contexto.ok) {
    return {
      message: contexto.error.message,
      fieldErrors: {},
      values,
      action_id: actionIdAfterError(contexto.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 3. Crear. company_id sale del contexto; action_id evita una compra
  //    duplicada si se reintenta (cualquier miembro puede crear compras).
  const creada = await createPurchaseRequest({ ...contexto.data, action_id }, validado.data);
  if (!creada.ok) {
    return {
      message: creada.error.message,
      fieldErrors: {},
      values,
      action_id: actionIdAfterError(creada.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 4. ¡Listo! Volvemos a la misma página con el id de la compra (?created=<id>);
  //    la página la vuelve a leer y muestra el resumen. Si era un reintento
  //    (created false), es la MISMA compra de antes: mostramos esa.
  //    Ojo: redirect "corta" la función a propósito; no hay que envolverlo en try.
  redirect(createdPurchaseUrl(creada.data.purchase_request.id));
}
