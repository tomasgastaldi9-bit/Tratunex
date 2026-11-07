"use server";
// "use server": esta función corre SOLO en el servidor, aunque la llame el
// editor desde el navegador. Por eso acá podemos hablar con la base sin
// mostrarle nada secreto a la persona.

import { redirect } from "next/navigation";
import { saveAgentKnowledgeInputSchema } from "@/contracts/agent";
import {
  knowledgeFailureTitle,
  knowledgeFieldErrors,
  readKnowledgeForm,
  savedKnowledgeUrl,
  type KnowledgeFieldErrors,
} from "@/features/agent/components/knowledge-form-data";
// Las reglas del action_id son las mismas que las del perfil: las reusamos.
import { actionIdAfterError, actionIdForSubmission } from "@/features/agent/components/profile-form-data";
import { saveAgentKnowledge } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Lo que la acción le devuelve al editor cuando NO pudo guardar.
 * (Si guarda bien, no devuelve nada: redirige a la página con "?saved=N".)
 *
 * A diferencia del perfil, acá no devolvemos "lo que escribió la persona":
 * la lista vive en el estado de React del editor (con campos controlados), así
 * que React 19 no la borra al enviar y no hay nada que restaurar.
 */
export type SaveKnowledgeState = {
  /** Mensaje general arriba del botón (null = no hay error). */
  message: string | null;
  /** Un mensaje por campo de cada ítem ("2.name") y uno para la lista entera ("_list"). */
  fieldErrors: KnowledgeFieldErrors;
  /** El action_id que tiene que usar el próximo intento (ver README, "action_id"). */
  action_id: string;
  /**
   * Número de respuesta: 0 al abrir la página y +1 en cada respuesta.
   * El editor lo usa para saber que llegó una respuesta nueva y llevar el
   * foco al primer campo con error.
   */
  attempt: number;
};

/**
 * Cómo se crea un action_id nuevo. Las reglas de CUÁNDO usar uno nuevo están
 * en profile-form-data.ts (actionIdForSubmission y actionIdAfterError), con
 * sus tests; acá solo les pasamos esta función para que lo creen.
 * (Va con flecha para llamarla siempre como crypto.randomUUID(): en algunos
 * lugares, pasarla "suelta", sin el crypto adelante, falla.)
 */
const nuevoActionId = () => crypto.randomUUID();

/**
 * Guarda la lista completa de conocimiento. La usa KnowledgeEditor con
 * useActionState: React le pasa el estado anterior (prevState) y los datos del formulario.
 */
export async function saveKnowledgeAction(
  prevState: SaveKnowledgeState,
  formData: FormData,
): Promise<SaveKnowledgeState> {
  // prevState viene del navegador: no confiamos en nada de lo que trae.
  // Solo usamos su número de respuesta para sumarle 1 (y si no es un número, arrancamos de 0).
  const attempt = (typeof prevState?.attempt === "number" ? prevState.attempt : 0) + 1;

  // 1. Leer y validar lo que mandó el editor (la lista viaja como JSON en un campo oculto).
  const { action_id: actionIdDelFormulario, input } = readKnowledgeForm(formData);
  // El action_id viene de un campo oculto, pero el navegador puede mandarlo
  // vacío (o no mandarlo). En ese caso armamos uno nuevo acá, del lado del servidor.
  const action_id = actionIdForSubmission(actionIdDelFormulario, nuevoActionId);
  const validado = saveAgentKnowledgeInputSchema.safeParse(input);
  if (!validado.success) {
    const fieldErrors = knowledgeFieldErrors(validado.error);
    return {
      // Si solo falla la lista entera, el título es ese mensaje (ver knowledgeFailureTitle).
      message: knowledgeFailureTitle(fieldErrors),
      fieldErrors,
      // Los datos estaban mal: es un error que NO se arregla reintentando igual
      // (retryable false), así que el próximo intento lleva otro action_id.
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

  // 3. Guardar. company_id sale del contexto; action_id evita duplicados si se reintenta.
  const guardado = await saveAgentKnowledge({ ...contexto.data, action_id }, validado.data);
  if (!guardado.ok) {
    return {
      message: guardado.error.message,
      fieldErrors: {},
      action_id: actionIdAfterError(guardado.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 4. ¡Listo! Volvemos a la misma página contando qué pasó (?saved=N&created=1 o 0;
  //    la página lo lee con readSavedNotice). La página arma un action_id nuevo
  //    para el próximo guardado. Ojo: redirect "corta" la función a propósito
  //    (lanza un aviso especial que Next atrapa); no hay que envolverlo en try.
  redirect(savedKnowledgeUrl(guardado.data));
}
