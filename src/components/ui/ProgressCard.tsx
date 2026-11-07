import { Circle, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Tarjeta de "primeros pasos": muestra cuántos pasos hiciste (con un anillo
 * de progreso), cuál es el siguiente y la lista completa.
 * Inspirada en la tarjeta del Figma con el anillo y el botón "Continue".
 *
 *   import { Button } from "./Button";
 *   <ProgressCard
 *     title="Primeros pasos"
 *     steps={[
 *       { label: "Crear tu empresa", done: true },
 *       { label: "Importar contactos", done: true },
 *       { label: "Configurar el agente", done: false },
 *       { label: "Hacer la primera llamada de prueba", done: false },
 *     ]}
 *     action={<Button size="sm">Continuar</Button>}
 *   />
 *
 * - title: el nombre de la tarjeta.
 * - steps: los pasos EN ORDEN. "done" dice si ya está hecho.
 *   El "siguiente paso" es el primero que todavía no está hecho.
 * - action: (opcional) el botón para seguir. A la derecha en la compu; en el
 *   celular baja abajo del texto si no entra.
 */
type Paso = { label: string; done: boolean };

type ProgressCardProps = {
  title: string;
  steps: Paso[];
  action?: ReactNode;
  className?: string;
};

// Medidas del anillo (en px). El círculo va justo adentro del cuadrado de 56px:
// el radio es la mitad del lado menos la mitad del grosor, así el trazo no se corta.
const LADO = 56;
const GROSOR = 5;
const RADIO = (LADO - GROSOR) / 2;
// Largo total de la circunferencia (2·π·r). Lo usamos para "dibujar" solo una parte.
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

export function ProgressCard({ title, steps, action, className }: ProgressCardProps) {
  const total = steps.length;
  const hechos = steps.filter((paso) => paso.done).length;
  // Si no hay pasos, el progreso es 0 (así nunca dividimos por cero).
  const progreso = total > 0 ? hechos / total : 0;
  // El primer paso sin hacer. Si no hay ninguno, está todo listo.
  const siguiente = steps.find((paso) => !paso.done);

  return (
    <div className={cx("flex flex-col gap-5 rounded-card bg-surface p-5", className)}>
      {/* Fila de arriba: anillo + textos a la izquierda, botón a la derecha.
          flex-wrap: en el celular, si no entran, el botón baja a otra línea. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex min-w-0 grow basis-56 items-center gap-5">
          {/* role="img" + aria-label: para el lector de pantalla, el anillo
              entero es UNA imagen que dice "2 de 4 pasos completos". */}
          <div
            role="img"
            aria-label={`${hechos} de ${total} pasos completos`}
            className="relative size-14 shrink-0"
          >
            {/* -rotate-90: el trazo de un círculo SVG arranca a las 3 en punto;
                girándolo 90° hacia atrás arranca arriba, a las 12, como un reloj. */}
            <svg viewBox={`0 0 ${LADO} ${LADO}`} className="size-14 -rotate-90" aria-hidden>
              {/* Pista: el anillo gris completo de fondo. */}
              <circle
                cx={LADO / 2}
                cy={LADO / 2}
                r={RADIO}
                fill="none"
                stroke="var(--color-line)"
                strokeWidth={GROSOR}
              />
              {/* Progreso: el mismo círculo en negro, pero solo dibujamos una parte.
                  strokeDasharray = largo del trazo; strokeDashoffset = cuánto
                  "escondemos". Si no hay nada hecho no lo dibujamos: con la punta
                  redondeada quedaría un puntito negro aunque el progreso sea 0. */}
              {hechos > 0 && (
                <circle
                  cx={LADO / 2}
                  cy={LADO / 2}
                  r={RADIO}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth={GROSOR}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUNFERENCIA}
                  strokeDashoffset={CIRCUNFERENCIA * (1 - progreso)}
                />
              )}
            </svg>
            {/* El "2/4" en el medio. aria-hidden porque ya lo dice el aria-label. */}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-xs leading-none font-bold tabular-nums"
            >
              {hechos}/{total}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm leading-tight font-bold">{title}</p>
            <p className="text-xs leading-tight text-ink-muted">
              {siguiente ? `Siguiente paso: ${siguiente.label}` : "¡Todo listo!"}
            </p>
          </div>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* <ol>: lista ORDENADA, porque los pasos tienen un orden. */}
      <ol className="flex flex-col gap-2.5">
        {steps.map((paso, indice) => {
          const Icono = paso.done ? CircleCheck : Circle;
          return (
            // key: React necesita un identificador por fila. Usamos la posición
            // (los pasos no se reordenan) para no fallar si dos pasos se llaman igual.
            <li key={indice} className="flex items-center gap-2.5 text-sm leading-tight">
              <Icono
                size={18}
                aria-hidden
                className={cx("shrink-0", paso.done ? "text-success" : "text-ink-subtle")}
              />
              {/* Los íconos están ocultos para el lector de pantalla, así que le
                  decimos el estado con texto invisible (sr-only). */}
              <span className={paso.done ? "text-ink-muted" : "text-ink"}>
                <span className="sr-only">{paso.done ? "Hecho: " : "Pendiente: "}</span>
                {paso.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
