import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Título de una pantalla, con una bajada opcional y lugar para botones a la derecha.
 * (En el Figma: el estilo de "Course" o "Your Statistics": 24px en negrita.)
 *
 * - title: el título (se renderiza como <h1>, que tiene que haber uno solo por pantalla).
 * - description: una línea explicando qué hay en la pantalla.
 * - actions: botones a la derecha (por ejemplo, "Guardar").
 * - as: qué etiqueta usar para el título. Por defecto "h1". Usá "h2" solo si
 *   el encabezado va DENTRO de otra pantalla que ya tiene su h1 (por ejemplo,
 *   una vista previa). Se ve igual; solo cambia lo que entiende el lector de pantalla.
 */
type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
};

export function PageHeader({ title, description, actions, as: Titulo = "h1", className }: PageHeaderProps) {
  return (
    // En celular el título y los botones van uno abajo del otro; desde tablet, en la misma fila.
    <header className={cx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-1.5">
        <Titulo className="text-2xl leading-tight font-semibold tracking-[-0.01em]">{title}</Titulo>
        {description && <p className="max-w-2xl text-sm leading-snug text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </header>
  );
}
