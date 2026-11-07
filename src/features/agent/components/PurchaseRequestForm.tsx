"use client";
// "use client": este formulario corre en el navegador porque necesita saber
// si se está creando la compra (para mostrar "Creando…") y qué respondió el
// servidor (errores), sin recargar toda la página.

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { createPurchaseAction, type CreatePurchaseState } from "@/app/purchases/new/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  PURCHASE_PRODUCT_MAX,
  PURCHASE_QUANTITY_MAX,
  PURCHASE_UNIT_MAX,
  PURCHASE_ZONE_MAX,
} from "@/contracts/purchases";
import { EMPTY_PURCHASE_VALUES } from "./purchase-form-data";

/**
 * Formulario "Nueva compra" (/purchases/new): qué necesita la pyme, cuánto,
 * para cuándo y con qué presupuesto.
 *
 * - actionId: identificador de esta compra, para no crearla dos veces si se
 *   reintenta. La página arma uno nuevo cada vez que se muestra.
 *
 * Siempre arranca vacío: después de crear una compra, la página vuelve a
 * mostrarlo limpio para cargar otra.
 */
type PurchaseRequestFormProps = {
  actionId: string;
};

export function PurchaseRequestForm({ actionId }: PurchaseRequestFormProps) {
  // useActionState conecta el formulario con la acción del servidor:
  //  - state: la última respuesta (al principio, el estado inicial de acá abajo).
  //  - formAction: lo que va en <form action>; llama a createPurchaseAction.
  //  - pending: true mientras el servidor está creando la compra.
  // Usa el estado inicial UNA sola vez: por eso la página le pone
  // key={actionId}, así después de crear se arma un formulario nuevo.
  const estadoInicial: CreatePurchaseState = {
    message: null,
    fieldErrors: {},
    values: EMPTY_PURCHASE_VALUES,
    action_id: actionId,
    attempt: 0,
  };
  const [state, formAction, pending] = useActionState(createPurchaseAction, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  // Después de cada respuesta con error, llevamos el foco al primer campo con
  // error (o al botón, si el error es general) para que la persona sepa dónde seguir.
  useEffect(() => {
    if (state.attempt === 0) return; // Recién abierta la página: no movemos nada.
    const formulario = formRef.current;
    const primerError = formulario?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const botonCrear = formulario?.querySelector<HTMLElement>('button[type="submit"]');
    (primerError ?? botonCrear)?.focus();
  }, [state.attempt]);

  // Apretar Enter en un campo también envía el formulario. Si ya se está
  // creando la compra, frenamos ese segundo envío (sería una compra repetida).
  function evitarDobleEnvio(event: FormEvent<HTMLFormElement>) {
    if (pending) event.preventDefault();
  }

  const { values, fieldErrors: errores } = state;

  return (
    <form
      // React 19 vacía el formulario después de cada envío. Cambiar la "key"
      // en cada respuesta lo vuelve a armar con lo que había escrito la
      // persona (lo devuelve el servidor), así no se le borra nada.
      key={state.attempt}
      ref={formRef}
      action={formAction}
      onSubmit={evitarDobleEnvio}
      // max-w-2xl: en la compu los campos no se estiran de punta a punta.
      // Panel blanco con borde: agrupa la compra y separa el botón abajo.
      className="flex max-w-2xl flex-col rounded-card border border-line bg-surface"
    >
      {/* Campo oculto: viaja con el formulario pero no se ve. */}
      <input type="hidden" name="action_id" value={state.action_id} />

      <div className="flex flex-col gap-5 p-5 sm:p-6">
      <Input
        label="Qué necesitás comprar"
        name="product"
        required
        maxLength={PURCHASE_PRODUCT_MAX}
        defaultValue={values.product}
        error={errores.product}
      />

      {/* En el celular, uno abajo del otro; desde tablet (sm), lado a lado. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* type="number" + step 1: el navegador muestra el teclado numérico y
            no deja escribir decimales. El servidor igual lo vuelve a revisar. */}
        <Input
          type="number"
          label="Cantidad"
          name="quantity"
          required
          min={1}
          max={PURCHASE_QUANTITY_MAX}
          step={1}
          inputMode="numeric"
          defaultValue={values.quantity}
          error={errores.quantity}
        />
        {/* Opcional: si queda vacío, son "unidades" (lo dice el contrato). */}
        <Input
          label="Unidad"
          name="unit"
          placeholder="unidades"
          maxLength={PURCHASE_UNIT_MAX}
          defaultValue={values.unit}
          error={errores.unit}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {/* type="date": el navegador muestra su calendario y siempre manda la
          fecha como "2026-11-09", que es lo que espera el contrato. */}
      <Input
        type="date"
        label="Para cuándo"
        name="needed_by"
        required
        hint="Fecha límite de entrega."
        defaultValue={values.needed_by}
        error={errores.needed_by}
      />

      {/* Texto (y no type="number") para que "150.000" no se interprete raro
          según el idioma del navegador: pedimos solo dígitos y el servidor
          lo pasa a unidades mínimas de ARGt. inputMode muestra el teclado numérico. */}
      <Input
        label="Presupuesto total"
        name="budget"
        required
        inputMode="numeric"
        placeholder="Ejemplo: 150000"
        hint="En pesos. El agente paga en ARGt (1 ARGt ≈ 1 peso)."
        defaultValue={values.budget}
        error={errores.budget}
      />
      </div>

      <Input
        label="Zona de entrega"
        name="zone"
        maxLength={PURCHASE_ZONE_MAX}
        defaultValue={values.zone}
        error={errores.zone}
      />

      {/* Error general (por ejemplo, la base no respondió): qué pasó, arriba del botón. */}
      {state.message && <Alert tone="danger" title={state.message} />}
      </div>

      {/* Pie del panel: la acción, separada de los campos por una línea. */}
      <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? "Creando…" : "Crear compra"}
        </Button>
      </div>
    </form>
  );
}
