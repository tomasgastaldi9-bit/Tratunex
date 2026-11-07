import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Tarjeta gris claro con esquinas de 20px: es el bloque básico del diseño.
 * Todo en el Figma (saludo, cursos, estadísticas) vive dentro de una de estas.
 *
 * padding:
 *  - "md" (por defecto): 20px de relleno, como en el Figma.
 *  - "lg": 40px arriba y abajo (la tarjeta de saludo del Figma).
 *  - "none": sin relleno, por si adentro va una lista o tabla de borde a borde.
 */
type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "md" | "lg";
};

const RELLENOS = {
  none: "",
  md: "p-5",
  lg: "px-5 py-10",
};

export function Card({ padding = "md", className, ...resto }: CardProps) {
  return (
    <div
      className={cx("rounded-card border border-line bg-surface", RELLENOS[padding], className)}
      {...resto}
    />
  );
}
