"use client";
// "use client": este formulario corre en el navegador porque necesita saber
// si se está guardando (para mostrar "Guardando…") y qué respondió el servidor
// (errores), sin recargar toda la página.

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { saveProfileAction, type SaveProfileState } from "@/app/agent/profile/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { INDUSTRY_LABELS, PROFILE_TEXT_MAX, PROFILE_ZONE_MAX, TONE_LABELS } from "@/contracts/agent";
import { DayPicker } from "./DayPicker";
import type { ProfileFormValues } from "./profile-form-data";

/**
 * Formulario del perfil de empresa (/agent/profile).
 *
 * - initialValues: con qué arranca (la versión vigente, o vacío con los valores por defecto).
 * - baseVersion: la versión que está viendo la persona (null si todavía no hay ninguna).
 *   Se manda oculta: si mientras tanto alguien guardó otra, el servidor avisa en vez de pisarla.
 * - actionId: identificador de este guardado, para no duplicarlo si se reintenta.
 * - canEdit: false si la persona no es admin. Ve todo, pero no puede cambiar nada.
 */
type ProfileFormProps = {
  initialValues: ProfileFormValues;
  baseVersion: number | null;
  actionId: string;
  canEdit: boolean;
};

// Las opciones de los desplegables salen de las listas del contrato, así hay
// un solo lugar donde se escriben los nombres de cada rubro y tono.
const OPCIONES_RUBRO: SelectOption[] = Object.entries(INDUSTRY_LABELS).map(([value, label]) => ({ value, label }));
const OPCIONES_TONO: SelectOption[] = Object.entries(TONE_LABELS).map(([value, label]) => ({ value, label }));

export function ProfileForm({ initialValues, baseVersion, actionId, canEdit }: ProfileFormProps) {
  // useActionState conecta el formulario con la acción del servidor:
  //  - state: la última respuesta (al principio, lo que le pasamos acá abajo).
  //  - formAction: lo que va en <form action>; llama a saveProfileAction.
  //  - pending: true mientras el servidor está guardando.
  // Ojo: useActionState usa este estado inicial UNA sola vez, cuando el
  // formulario aparece. Si después cambian los props (otro actionId), no se
  // entera solo. Por eso la página le pone key={actionId} a <ProfileForm>:
  // cada vez que la página se arma de nuevo (por ejemplo, después de guardar),
  // la key cambia y React arma este formulario desde cero con los datos nuevos.
  const estadoInicial: SaveProfileState = {
    message: null,
    fieldErrors: {},
    values: initialValues,
    action_id: actionId,
    attempt: 0,
  };
  const [state, formAction, pending] = useActionState(saveProfileAction, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  // Después de cada respuesta con error, el formulario se vuelve a dibujar y el
  // foco del teclado se perdería. Lo llevamos al primer campo con error (o al
  // botón, si el error es general) para que la persona sepa dónde seguir.
  useEffect(() => {
    if (state.attempt === 0) return; // Recién abierta la página: no movemos nada.
    const formulario = formRef.current;
    const primerError = formulario?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const botonGuardar = formulario?.querySelector<HTMLElement>('button[type="submit"]');
    (primerError ?? botonGuardar)?.focus();
  }, [state.attempt]);

  // El botón ya no envía mientras guarda, pero apretar Enter en un campo
  // también envía el formulario. Si ya está guardando, frenamos ese segundo envío.
  function evitarDobleEnvio(event: FormEvent<HTMLFormElement>) {
    if (pending) event.preventDefault();
  }

  const { values, fieldErrors: errores } = state;

  return (
    <form
      // React 19 vacía el formulario después de cada envío. Cambiar la "key"
      // en cada respuesta lo vuelve a armar con los valores que devolvió el
      // servidor (lo que había escrito la persona), así no se le borra nada.
      key={state.attempt}
      ref={formRef}
      action={formAction}
      onSubmit={evitarDobleEnvio}
      // max-w-2xl: en la compu los textos no se estiran de punta a punta (se leen mejor).
      className="flex max-w-2xl flex-col gap-5"
    >
      {/* Campos ocultos: viajan con el formulario pero no se ven.
          Van fuera del fieldset porque uno deshabilitado no manda sus campos. */}
      <input type="hidden" name="base_version" value={baseVersion ?? ""} />
      <input type="hidden" name="action_id" value={state.action_id} />

      {/* fieldset disabled apaga TODOS los campos de adentro de una vez (si no es admin).
          min-w-0: sin esto, en el celular el fieldset no se achica y empuja la página de costado. */}
      <fieldset disabled={!canEdit} className="min-w-0">
        <div className="flex flex-col gap-5">
          {/* En el celular, uno abajo del otro; desde tablet (sm), lado a lado. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select
              label="Rubro"
              name="industry"
              required
              placeholder="Elegí el rubro"
              options={OPCIONES_RUBRO}
              defaultValue={values.industry}
              error={errores.industry}
            />
            <Select
              label="Tono del agente"
              name="tone"
              required
              options={OPCIONES_TONO}
              defaultValue={values.tone}
              error={errores.tone}
            />
          </div>

          <Textarea
            label="Qué vende tu empresa"
            name="offering"
            required
            maxLength={PROFILE_TEXT_MAX}
            defaultValue={values.offering}
            error={errores.offering}
          />
          <Textarea
            label="A quién le vende"
            name="target_customer"
            required
            maxLength={PROFILE_TEXT_MAX}
            defaultValue={values.target_customer}
            error={errores.target_customer}
          />
          <Textarea
            label="Propuesta de valor"
            name="value_proposition"
            required
            maxLength={PROFILE_TEXT_MAX}
            defaultValue={values.value_proposition}
            error={errores.value_proposition}
          />

          {/* Zona es el único campo opcional: por eso no lleva "required". */}
          <Input
            label="Zona"
            name="zone"
            hint="Dónde están tus clientes. Ejemplo: CABA y GBA."
            maxLength={PROFILE_ZONE_MAX}
            defaultValue={values.zone}
            error={errores.zone}
          />

          <DayPicker defaultDays={values.call_window.days} error={errores.days} />

          {/* type="time": el navegador muestra su selector de hora y siempre
              manda la hora como "09:00", que es lo que espera el contrato. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              type="time"
              label="Desde"
              name="start"
              required
              hint="Hora de Argentina"
              defaultValue={values.call_window.start}
              error={errores.start}
            />
            <Input
              type="time"
              label="Hasta"
              name="end"
              required
              hint="Hora de Argentina"
              defaultValue={values.call_window.end}
              error={errores.end}
            />
          </div>
        </div>
      </fieldset>

      {/* Error general (por ejemplo, la base no respondió): qué pasó, arriba del botón. */}
      {state.message && <Alert tone="danger" title={state.message} />}

      {/* Si no es admin, no hay botón: no tendría sentido apretarlo. */}
      {canEdit && (
        <div>
          <Button type="submit" variant="primary" loading={pending}>
            {pending ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      )}
    </form>
  );
}
