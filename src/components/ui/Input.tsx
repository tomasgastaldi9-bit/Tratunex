import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field, fieldBoxStyles } from "./Field";

/**
 * Campo de texto de una línea (nombre, teléfono, buscador, etc.).
 *
 * Acepta todo lo que acepta un <input> común (type, name, placeholder,
 * value, onChange, required, disabled...) y además:
 *  - label: el título del campo. Es obligatorio, aunque lo ocultes con
 *    hideLabel: así el lector de pantalla sabe para qué sirve el campo.
 *  - hideLabel: oculta el título a la vista (útil en un buscador, donde el
 *    ícono de lupa ya lo explica).
 *  - hint: texto de ayuda chiquito debajo del campo.
 *  - error: mensaje en rojo debajo del campo; además pinta el borde de rojo.
 *    Decí qué pasó y cómo arreglarlo ("Falta el teléfono. Escribilo con código de área.").
 *  - icon: un ícono de lucide-react a la izquierda.
 *  - className: va en el envoltorio de afuera (sirve para el layout, por
 *    ejemplo className="flex-1" para que ocupe el ancho que sobra).
 *
 *   import { Search } from "lucide-react";
 *   <Input label="Buscar contactos" hideLabel icon={Search} type="search" placeholder="Buscar" />
 *   <Input label="Teléfono" name="telefono" type="tel" required hint="Con código de área, sin el 15." />
 */
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
};

export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  icon: Icono,
  id,
  required,
  className,
  ...resto
}: InputProps) {
  return (
    // Field pone el título, la ayuda y el error, y nos da los "id" que los
    // conectan con el <input> (propsCampo).
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
        // La "caja" gris. El borde negro al escribir lo pone fieldBoxStyles
        // (focus-within), así los tres tipos de campo se ven iguales.
        // min-h-11 = 44px de alto: cómodo de tocar con el dedo en el celular.
        // has-[input:disabled]: si el campo está deshabilitado, la caja se ve más clara.
        <div
          className={cx(
            fieldBoxStyles(!!error),
            "flex min-h-11 items-center gap-2.5 px-3",
            "has-[input:disabled]:opacity-50",
          )}
        >
          {Icono && <Icono size={20} aria-hidden className="shrink-0 text-ink-muted" />}
          <input
            // required va también al <input>: así el navegador no deja enviar el formulario vacío.
            required={required}
            className={cx(
              // self-stretch: el <input> ocupa todo el alto de la caja, así se
              // puede tocar en cualquier parte y no solo justo sobre el texto.
              "min-w-0 flex-1 self-stretch bg-transparent outline-none placeholder:text-ink-subtle",
              // 16px en el celular: con menos, el iPhone hace zoom al tocar el campo.
              // En compu (md en adelante) volvemos a 14px, como el resto de la app.
              "text-base md:text-sm",
              "disabled:cursor-not-allowed",
            )}
            {...resto}
            // Va al final para que el id y los aria-* de Field no se pisen.
            {...propsCampo}
          />
        </div>
      )}
    </Field>
  );
}
