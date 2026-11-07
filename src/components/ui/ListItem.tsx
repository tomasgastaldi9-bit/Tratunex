import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Una fila de una lista (contactos, llamadas, tareas).
 *
 *   import { Phone } from "lucide-react";
 *   import { Avatar } from "./Avatar";
 *   import { Badge } from "./Badge";
 *   import { Button } from "./Button";
 *
 *   <ul className="flex flex-col gap-2.5">
 *     <li>
 *       <ListItem
 *         leading={<Avatar name="María José Pérez" />}
 *         title="María José Pérez"
 *         subtitle="Panadería La Espiga · Córdoba"
 *         meta={<Badge tone="info">Cliente potencial</Badge>}
 *         actions={<Button size="sm" icon={Phone}>Llamar</Button>}
 *       />
 *     </li>
 *   </ul>
 *
 * - leading: (opcional) lo que va a la izquierda, por ejemplo un <Avatar />.
 * - title: el texto principal. Si es muy largo se corta con "…".
 * - subtitle: (opcional) un dato secundario, también se corta con "…".
 * - meta: (opcional) etiquetas, hora, duración.
 * - actions: (opcional) botones.
 *
 * Es un <div> común: quien arma la lista lo envuelve en <li> dentro de un
 * <ul> (así el lector de pantalla anuncia "lista, 5 elementos").
 *
 * En la compu todo va en una sola fila. En el celular (375px), si no entra,
 * las etiquetas y botones bajan a una segunda línea en vez de aplastar el nombre.
 */
type ListItemProps = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ListItem({ leading, title, subtitle, meta, actions, className }: ListItemProps) {
  return (
    <div
      className={cx(
        // flex-wrap: si no entra todo en una fila, el segundo grupo baja.
        "flex flex-wrap items-center gap-x-5 gap-y-4 rounded-card bg-surface p-5",
        "transition-colors hover:bg-surface-hover",
        className,
      )}
    >
      {/* Grupo 1: avatar + textos.
          - grow: ocupa todo el espacio libre de la fila.
          - basis-56: pide al menos ~224px. ¡Importante! Sin esto, en el celular
            el título se achica hasta desaparecer (ancho cero) en vez de que
            los botones bajen a otra línea.
          - min-w-0: deja que los textos se achiquen y se corten con "…". */}
      <div className="flex min-w-0 grow basis-56 items-center gap-5">
        {leading}
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* truncate = una sola línea y "…" si no entra. Ojo: truncate también
              CORTA todo lo que se sale de la caja. Con leading-none (renglón de
              la altura justa de la letra), en nuestra fuente las colitas de la
              g/p/y y los acentos de mayúsculas (Á, Ó) se salen ~1px y quedarían
              mochos. py-0.5 agranda la caja 2px arriba y abajo para que entren,
              y -my-0.5 lo compensa: la fila queda del mismo tamaño. */}
          <p className="-my-0.5 truncate py-0.5 text-sm leading-none font-bold">{title}</p>
          {subtitle && (
            <p className="-my-0.5 truncate py-0.5 text-xs leading-none text-ink-muted">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Grupo 2: etiquetas y botones. Solo se dibuja si hay algo para mostrar. */}
      {(meta || actions) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}
