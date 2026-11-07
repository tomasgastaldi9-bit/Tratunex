"use server";
// "use server": esta función corre SOLO en el servidor, aunque la llame el
// formulario desde el navegador. Por eso acá podemos hablar con la base sin
// mostrarle nada secreto a la persona.

import { redirect } from "next/navigation";
import { saveCompanyProfileInputSchema } from "@/contracts/agent";
import {
  profileFieldErrors,
  readProfileForm,
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
 * Qué action_id usar después de un error (README del módulo, "action_id"):
 *  - retryable true (la base no respondió): el MISMO, para reintentar sin
 *    duplicar. Si en realidad se había guardado, la base devuelve lo mismo.
 *  - retryable false (datos, permisos, conflicto): uno NUEVO.
 */
function siguienteActionId(error: { retryable: boolean }, actionIdActual: string): string {
  return error.retryable ? actionIdActual : crypto.randomUUID();
}

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
  // vacío (o no mandarlo). Sin action_id la base no puede evitar duplicados,
  // así que en ese caso armamos uno nuevo acá, del lado del servidor.
  const action_id = actionIdDelFormulario.trim() === "" ? crypto.randomUUID() : actionIdDelFormulario;
  const validado = saveCompanyProfileInputSchema.safeParse(input);
  if (!validado.success) {
    return {
      message: "Revisá los campos marcados.",
      fieldErrors: profileFieldErrors(validado.error),
      values: input.profile,
      // Los datos estaban mal: el próximo intento es otro pedido, con otro action_id.
      action_id: crypto.randomUUID(),
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
      action_id: siguienteActionId(contexto.error, action_id),
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
      action_id: siguienteActionId(guardado.error, action_id),
      attempt,
    };
  }

  // 4. ¡Listo! Volvemos a la misma página contando qué pasó. La página arma un
  //    action_id nuevo para el próximo guardado. Ojo: redirect "corta" la función
  //    a propósito (lanza un aviso especial que Next atrapa); no hay que envolverlo en try.
  redirect(`/agent/profile?saved=${guardado.data.version}&created=${guardado.data.created ? 1 : 0}`);
}
