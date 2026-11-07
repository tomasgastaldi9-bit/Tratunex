import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field, fieldBoxStyles } from "./Field";

/**
 * Lista desplegable para elegir UNA opción (etapa del pipeline, motivo, etc.).
 *
 * Usa el <select> nativo del navegador a propósito: en el celular abre el
 * selector propio del teléfono (cómodo con el dedo) y funciona con teclado y
 * lectores de pantalla sin que tengamos que programar nada.
 *
 * Acepta todo lo que acepta un <select> común (name, value, defaultValue,
 * onChange, required, disabled...) y además:
 *  - label: el título del campo. Es obligatorio, aunque lo ocultes con hideLabel.
 *  - hideLabel: oculta el título a la vista (sigue existiendo para lectores de pantalla).
 *  - hint: texto de ayuda chiquito debajo del campo.
 *  - error: mensaje en rojo debajo del campo; además pinta el borde de rojo.
 *  - options: la lista de opciones, cada una con "value" (lo que se guarda)
 *    y "label" (lo que lee la persona).
 *  - placeholder: texto de la primera opción, que no se puede elegir
 *    (ej. "Elegí una etapa"). Si lo pasás y no hay value/defaultValue, la
 *    lista arranca mostrándolo. Con required, el navegador no deja enviar el
 *    formulario hasta que se elija otra opción.
 *
 *   <Select
 *     label="Etapa"
 *     name="etapa"
 *     required
 *     placeholder="Elegí una etapa"
 *     options={[
 *       { value: "nuevo", label: "Nuevo" },
 *       { value: "seguimiento", label: "En seguimiento" },
 *     ]}
 *   />
 *
 * No admite "multiple" (elegir varias): eso se ve como una lista abierta,
 * no como un desplegable, y necesitaría otro diseño.
 */
export type SelectOption = { value: string; label: string };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "multiple"> & {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
};

export function Select({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  required,
  options,
  placeholder,
  value,
  defaultValue,
  className,
  ...resto
}: SelectProps) {
  // Si hay placeholder y nadie dijo qué opción mostrar, arrancamos en ""
  // (la opción del placeholder). Si no, el navegador mostraría la primera
  // opción real y parecería que ya está elegida.
  const valorInicial =
    placeholder !== undefined && value === undefined && defaultValue === undefined ? "" : defaultValue;

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      required={required}
      id={id}
      className={className}
    >
      {(propsCampo) => (
        // La "caja" gris, igual a la de Input y Textarea. min-h-11 = 44px de
        // alto (cómodo de tocar). "relative" deja ubicar la flechita adentro.
        // Ojo: es select:disabled y no :disabled a secas, porque la opción del
        // placeholder también está deshabilitada y apagaría la caja siempre.
        <div
          className={cx(
            fieldBoxStyles(!!error),
            "relative flex min-h-11",
            "has-[select:disabled]:opacity-50",
          )}
        >
          <select
            required={required}
            value={value}
            defaultValue={valorInicial}
            className={cx(
              // appearance-none: saca la flecha y el estilo propios del
              // navegador (cambian en cada uno) para usar la nuestra.
              // pr-10: deja lugar a la derecha para que el texto no pise la flecha.
              "w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-10 pl-3 outline-none",
              // 16px en el celular (evita el zoom del iPhone), 14px en compu.
              "text-base md:text-sm",
              // Mientras se muestra el placeholder, el texto va en gris claro,
              // igual que el placeholder de un Input vacío.
              "has-[option:disabled:checked]:text-ink-subtle",
              "disabled:cursor-not-allowed",
            )}
            {...resto}
            // Va al final para que el id y los aria-* de Field no se pisen.
            {...propsCampo}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opcion) => (
              // text-ink: en algunos sistemas (Windows, Android) las opciones
              // heredan el color del <select>; así no quedan grises.
              <option key={opcion.value} value={opcion.value} className="text-ink">
                {opcion.label}
              </option>
            ))}
          </select>

          {/* La flechita. pointer-events-none: el toque "la atraviesa" y abre la lista igual. */}
          <ChevronDown
            size={20}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
          />
        </div>
      )}
    </Field>
  );
}
