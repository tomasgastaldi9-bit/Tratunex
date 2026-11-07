import { useId, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * "Envoltorio" común de cualquier campo de formulario: pone el título arriba,
 * la ayuda abajo y, si hay un error, el mensaje en rojo.
 *
 * Lo usan Input, Textarea y Select por dentro. Normalmente NO lo necesitás
 * directamente; usalo solo si armás un control nuevo (por ejemplo, un selector
 * de fecha) y querés que se vea igual que los demás.
 *
 * Cómo funciona: genera los "id" que conectan el título y los mensajes con el
 * control, y se los pasa a "children" (que es una función):
 *
 *   <Field label="Fecha" hint="Horario de Argentina">
 *     {(props) => <input type="date" {...props} />}
 *   </Field>
 */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  label: string;
  /** Oculta el título a la vista (sigue existiendo para lectores de pantalla). */
  hideLabel?: boolean;
  /** Texto de ayuda chiquito debajo del campo. */
  hint?: string;
  /** Mensaje de error. Si está, el campo se marca en rojo. Decí qué pasó y cómo arreglarlo. */
  error?: string;
  /** Marca el campo como obligatorio (agrega un asterisco al título). */
  required?: boolean;
  /** Si querés fijar el id del control (si no, se genera solo). */
  id?: string;
  /**
   * Ids de OTROS textos que explican el campo (por ejemplo, un panel de ayuda
   * aparte). Se suman a la ayuda y al error, no los reemplazan.
   */
  describedBy?: string;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
};

export function Field({
  label,
  hideLabel = false,
  hint,
  error,
  required,
  id,
  describedBy: describedByExtra,
  className,
  children,
}: FieldProps) {
  // useId genera un id único para conectar el <label> con el control
  // (así, al tocar el título, el cursor va al campo).
  const idGenerado = useId();
  const idControl = id ?? idGenerado;
  const idAyuda = hint ? `${idControl}-ayuda` : undefined;
  const idError = error ? `${idControl}-error` : undefined;

  // aria-describedby: el lector de pantalla lee el error, la ayuda y cualquier
  // otro texto que nos hayan pasado, en ese orden.
  const describedBy = [idError, idAyuda, describedByExtra].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={idControl} className={cx("text-sm leading-none font-semibold", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span aria-hidden className="text-danger">
            {" "}
            *
          </span>
        )}
      </label>

      {children({ id: idControl, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}

      {error && (
        <p id={idError} className="text-xs leading-snug font-bold text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={idAyuda} className="text-xs leading-snug text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Clases de la "caja" gris de los campos (input, textarea, select), para que
 * los tres se vean iguales. Con error, el borde se pone rojo.
 */
export function fieldBoxStyles(conError: boolean) {
  return cx(
    // Caja blanca con borde fino: se ve sobre el fondo gris y dentro de una tarjeta blanca.
    "rounded-control border bg-surface transition-[border-color,box-shadow] duration-150",
    conError ? "border-danger" : "border-line hover:border-ink-subtle",
    // Al tener el cursor adentro, borde negro y un halo suave (o rojo si hay error).
    conError
      ? "focus-within:border-danger focus-within:ring-4 focus-within:ring-danger/10"
      : "focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/[0.06]",
  );
}
