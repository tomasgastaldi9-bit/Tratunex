import { useId } from "react";
import { cx } from "@/components/ui/cx";
import { WEEKDAY_LABELS, type Weekday } from "@/contracts/agent";

/**
 * Selector de "Días para llamar": 7 casillas con forma de pastilla, una por día.
 *
 * Por dentro son casillas comunes (input type="checkbox" con name="days"),
 * escondidas a la vista pero no para el teclado ni el lector de pantalla.
 * Lo que se ve es la etiqueta (label) que las envuelve, pintada como botón:
 * gris claro sin marcar y negra con letra blanca cuando está marcada.
 * Ventaja: el navegador manda solo los días marcados, uno por casilla
 * ("days=1", "days=3"...), y funciona con Tab y barra espaciadora sin
 * programar nada.
 *
 * - defaultDays: los días que arrancan marcados (1 = lunes … 7 = domingo).
 * - error: mensaje en rojo debajo, igual que en los otros campos.
 * - disabled: apaga todas las casillas (por ejemplo, si la persona no es admin).
 *
 *   <DayPicker defaultDays={[1, 2, 3, 4, 5]} error={errores.days} />
 */
type DayPickerProps = {
  defaultDays: number[];
  error?: string;
  disabled?: boolean;
};

// Los días en orden, de lunes a domingo.
const DIAS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function DayPicker({ defaultDays, error, disabled = false }: DayPickerProps) {
  // useId arma un id único para conectar el mensaje de error con las casillas.
  const idError = `${useId()}-error`;

  return (
    // fieldset + legend: así el lector de pantalla anuncia "Días para llamar,
    // grupo" antes de leer cada día. min-w-0: un fieldset, por defecto, no se
    // achica más que su contenido y en el celular empujaría la página de costado.
    <fieldset disabled={disabled} className="min-w-0">
      {/* Mismo estilo que el título de los otros campos (el label de Field). */}
      <legend className="text-sm leading-none font-bold">
        Días para llamar
        {/* Asterisco de "obligatorio", igual que en los otros campos. Es solo
            visual: si no se marca ningún día, el servidor avisa con el error. */}
        <span aria-hidden className="text-danger">
          {" "}
          *
        </span>
      </legend>

      {/* En el celular, los 7 días en una sola fila de columnas iguales (grid).
          Desde tablet (sm), pastillas de su propio ancho, una al lado de la otra. */}
      <div className="mt-2 grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap sm:gap-2.5">
        {DIAS.map((dia) => {
          const nombreCompleto = WEEKDAY_LABELS[dia];
          return (
            <label
              key={dia}
              className={cx(
                // relative: la casilla escondida (sr-only) se ubica adentro de
                // la pastilla y no en otra parte de la página.
                // min-h-10 = 40px de alto: fácil de tocar con el dedo.
                "relative inline-flex min-h-10 cursor-pointer items-center justify-center rounded-control border px-1 select-none sm:min-w-14 sm:px-3",
                "text-sm leading-none font-medium transition-colors duration-150",
                // Sin marcar: gris claro, como los campos. Con el mouse encima, un gris más oscuro.
                "bg-surface text-ink hover:bg-surface-hover",
                // Marcada (la casilla de adentro está tildada): negra con letra blanca.
                // "has-checked" quiere decir "si adentro tiene algo marcado".
                "has-checked:bg-ink has-checked:text-white",
                // Anillo negro cuando se llega con el teclado (Tab), como los botones.
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
                // Deshabilitada: más clara y sin el cursor de "clic".
                "has-disabled:cursor-not-allowed has-disabled:opacity-50",
                // Con error, borde rojo como los otros campos; si no, borde invisible
                // (así la pastilla mide lo mismo con y sin error).
                error ? "border-danger" : "border-line has-checked:border-ink",
              )}
            >
              <input
                type="checkbox"
                name="days"
                value={dia}
                defaultChecked={defaultDays.includes(dia)}
                // A la vista dice "Lun", pero el lector de pantalla lee "Lunes".
                aria-label={nombreCompleto}
                // Si hay error, cada casilla queda marcada como inválida y
                // apunta al mensaje: al llegar a cualquier día, se lee el error.
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? idError : undefined}
                className="sr-only"
              />
              {/* Las tres primeras letras: "Lun", "Mar", "Mié"… */}
              {nombreCompleto.slice(0, 3)}
            </label>
          );
        })}
      </div>

      {/* Mismo estilo que el error de los otros campos (el de Field). */}
      {error && (
        <p id={idError} className="mt-2 text-xs leading-snug font-bold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
