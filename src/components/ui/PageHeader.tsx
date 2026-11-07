import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Título de una pantalla, con una bajada opcional y lugar para botones a la derecha.
 * (En el Figma: el estilo de "Course" o "Your Statistics": 24px en negrita.)
 *
 * - title: el título (se renderiza como <h1>, que tiene que haber uno solo por pantalla).
 * - description: una línea explicando qué hay en la pantalla.
 * - actions: botones a la derecha (por ejemplo, "Guardar").
 */
type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    // En celular el título y los botones van uno abajo del otro; desde tablet, en la misma fila.
    <header className={cx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-2xl leading-none font-bold">{title}</h1>
        {description && <p className="text-sm leading-tight text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </header>
  );
}
