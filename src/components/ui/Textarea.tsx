import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field, fieldBoxStyles } from "./Field";

/**
 * Campo de texto largo, de varias líneas (notas de una llamada, descripción
 * de lo que vende la empresa, etc.).
 *
 * Acepta todo lo que acepta un <textarea> común (name, placeholder, value,
 * onChange, rows, required, disabled...) y además:
 *  - label: el título del campo. Es obligatorio, aunque lo ocultes con hideLabel.
 *  - hideLabel: oculta el título a la vista (sigue existiendo para lectores de pantalla).
 *  - hint: texto de ayuda chiquito debajo del campo.
 *  - error: mensaje en rojo debajo del campo; además pinta el borde de rojo.
 *  - maxLength: además de cortar el texto en ese largo, suma a la ayuda
 *    "Máximo N caracteres." para que la persona sepa el límite ANTES de llegar.
 *
 *   <Textarea
 *     label="Notas de la llamada"
 *     name="notas"
 *     maxLength={500}
 *     hint="Lo que quieras recordar para el próximo contacto."
 *   />
 *
 * ¿Por qué no hay un contador "123 / 500" en vivo? Porque contar mientras
 * escribís necesita estado (o sea, un componente "use client"). Así como
 * está, este campo funciona también en componentes de servidor.
 */
type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
};

export function Textarea({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  required,
  maxLength,
  className,
  ...resto
}: TextareaProps) {
  // Si hay un límite de caracteres, lo sumamos al final del texto de ayuda.
  const avisoLimite = maxLength !== undefined ? `Máximo ${maxLength} caracteres.` : undefined;
  const ayuda = [hint, avisoLimite].filter(Boolean).join(" ") || undefined;

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={ayuda}
      error={error}
      required={required}
      id={id}
      className={className}
    >
      {(propsCampo) => (
        // La "caja" gris, igual a la de Input y Select (borde negro al escribir).
        <div className={cx(fieldBoxStyles(!!error), "has-[textarea:disabled]:opacity-50")}>
          <textarea
            required={required}
            maxLength={maxLength}
            className={cx(
              // El relleno (p-3) va en el <textarea> y no en la caja: así
              // tocar cerca del borde también pone el cursor en el campo.
              // block + w-full: ocupa todo el ancho, sin un espacio fantasma abajo.
              "block min-h-28 w-full resize-y bg-transparent p-3 leading-relaxed outline-none",
              "placeholder:text-ink-subtle",
              // 16px en el celular (evita el zoom del iPhone), 14px en compu.
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
