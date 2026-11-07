"use server";
// "use server": esta función corre SOLO en el servidor, aunque la llame el
// formulario desde el navegador. Por eso acá podemos hablar con la base sin
// mostrarle nada secreto a la persona.

import { redirect } from "next/navigation";
import { purchasePolicySchema } from "@/contracts/purchases";
import {
  policyFieldErrors,
  readPolicyForm,
  savedPolicyUrl,
  type PolicyFieldErrors,
} from "@/features/agent/components/policy-form-data";
// Las reglas del action_id son las mismas que las del perfil: las reusamos.
import { actionIdAfterError, actionIdForSubmission } from "@/features/agent/components/profile-form-data";
import { savePurchasePolicy } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Lo que la acción le devuelve al formulario cuando NO pudo guardar.
 * (Si guarda bien, no devuelve nada: redirige a la página con "?saved=1".)
 *
 * A diferencia del perfil, acá no devolvemos "lo que escribió la persona":
 * los campos de PolicyForm son controlados (viven en el estado de React), así
 * que React 19 no los borra al enviar y no hay nada que restaurar.
 */
export type SavePolicyState = {
  /** Mensaje general arriba del botón (null = no hay error). */
  message: string | null;
  /** Un mensaje por campo, para mostrar debajo de cada uno. */
  fieldErrors: PolicyFieldErrors;
  /** El action_id que tiene que usar el próximo intento (ver README, "action_id"). */
  action_id: string;
  /**
   * Número de respuesta: 0 al abrir la página y +1 en cada respuesta.
   * El formulario lo usa para saber que llegó una respuesta nueva y llevar
   * el foco al primer campo con error.
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
 * Guarda las reglas de pago. La usa PolicyForm con useActionState: React le
 * pasa el estado anterior (prevState) y los datos del formulario.
 */
export async function savePolicyAction(prevState: SavePolicyState, formData: FormData): Promise<SavePolicyState> {
  // prevState viene del navegador: no confiamos en nada de lo que trae.
  // Solo usamos su número de respuesta para sumarle 1.
  const attempt = (typeof prevState?.attempt === "number" ? prevState.attempt : 0) + 1;

  // 1. Leer y validar (los pesos ya vienen convertidos a unidades mínimas de ARGt).
  //    El contrato revisa también que lo que paga solo no supere el máximo.
  const { action_id: actionIdDelFormulario, policy } = readPolicyForm(formData);
  // Si el navegador no mandó el action_id, armamos uno acá, del lado del servidor.
  const action_id = actionIdForSubmission(actionIdDelFormulario, nuevoActionId);
  const validado = purchasePolicySchema.safeParse(policy);
  if (!validado.success) {
    return {
      message: "Revisá los campos marcados.",
      fieldErrors: policyFieldErrors(validado.error),
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
      action_id: actionIdAfterError(contexto.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 3. Guardar. company_id sale del contexto; action_id evita duplicados si se
  //    reintenta. Si no es admin, la base responde FORBIDDEN y lo mostramos.
  const guardado = await savePurchasePolicy({ ...contexto.data, action_id }, { policy: validado.data });
  if (!guardado.ok) {
    return {
      message: guardado.error.message,
      fieldErrors: {},
      action_id: actionIdAfterError(guardado.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 4. ¡Listo! Volvemos a la misma página con ?saved=1 (la lee readPolicySaved).
  //    La página arma un action_id nuevo para el próximo guardado.
  //    Ojo: redirect "corta" la función a propósito; no hay que envolverlo en try.
  redirect(savedPolicyUrl());
}
