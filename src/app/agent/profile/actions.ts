"use server";
// "use server": esta función corre SOLO en el servidor, aunque la llame el
// formulario desde el navegador. Por eso acá podemos hablar con la base sin
// mostrarle nada secreto a la persona.

import { redirect } from "next/navigation";
import { saveCompanyProfileInputSchema } from "@/contracts/agent";
import {
  actionIdAfterError,
  actionIdForSubmission,
  profileFieldErrors,
  readProfileForm,
  savedProfileUrl,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from "@/features/agent/components/profile-form-data";
import { saveCompanyProfile } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Lo que la acción le devuelve al formulario cuando NO pudo guardar.
 * (Si guarda bien, no devuelve nada: redirige a la página con "?saved=N".)
 */
export type SaveProfileState = {
  /** Mensaje general arriba del botón (null = no hay error). */
  message: string | null;
  /** Un mensaje por campo, para mostrar debajo de cada uno. */
  fieldErrors: ProfileFieldErrors;
  /** Lo que había escrito la persona, para no borrárselo. */
  values: ProfileFormValues;
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
 * Cómo se crea un action_id nuevo. Las reglas de CUÁNDO usar uno nuevo están
 * en profile-form-data.ts (actionIdForSubmission y actionIdAfterError), con
 * sus tests; acá solo les pasamos esta función para que lo creen.
 * (Va con flecha para llamarla siempre como crypto.randomUUID(): en algunos
 * lugares, como el navegador, pasarla "suelta", sin el crypto adelante, falla.)
 */
const nuevoActionId = () => crypto.randomUUID();

/**
 * Guarda el perfil de empresa. La usa ProfileForm con useActionState:
 * React le pasa el estado anterior (prevState) y los datos del formulario.
 */
export async function saveProfileAction(prevState: SaveProfileState, formData: FormData): Promise<SaveProfileState> {
  // prevState viene del navegador: no confiamos en nada de lo que trae.
  // Solo usamos su número de respuesta para sumarle 1 (y si no es un número, arrancamos de 0).
  const attempt = (typeof prevState?.attempt === "number" ? prevState.attempt : 0) + 1;

  // 1. Leer y validar lo que mandó el formulario.
  const { action_id: actionIdDelFormulario, input } = readProfileForm(formData);
  // El action_id viene de un campo oculto, pero el navegador puede mandarlo
  // vacío (o no mandarlo). En ese caso armamos uno nuevo acá, del lado del servidor.
  const action_id = actionIdForSubmission(actionIdDelFormulario, nuevoActionId);
  const validado = saveCompanyProfileInputSchema.safeParse(input);
  if (!validado.success) {
    return {
      message: "Revisá los campos marcados.",
      fieldErrors: profileFieldErrors(validado.error),
      values: input.profile,
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
      values: input.profile,
      action_id: actionIdAfterError(contexto.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 3. Guardar. company_id sale del contexto; action_id evita duplicados si se reintenta.
  const guardado = await saveCompanyProfile({ ...contexto.data, action_id }, validado.data);
  if (!guardado.ok) {
    return {
      message: guardado.error.message,
      fieldErrors: {},
      values: input.profile,
      action_id: actionIdAfterError(guardado.error, action_id, nuevoActionId),
      attempt,
    };
  }

  // 4. ¡Listo! Volvemos a la misma página contando qué pasó (?saved=N&created=1 o 0;
  //    la página lo lee con readSavedNotice). La página arma un action_id nuevo
  //    para el próximo guardado. Ojo: redirect "corta" la función a propósito
  //    (lanza un aviso especial que Next atrapa); no hay que envolverlo en try.
  redirect(savedProfileUrl(guardado.data));
}
