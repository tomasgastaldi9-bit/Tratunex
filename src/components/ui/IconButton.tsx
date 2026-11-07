import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Botón con solo un ícono (por ejemplo, las flechas ← → del Figma).
 *
 * Como no tiene texto visible, "label" es OBLIGATORIO: es lo que lee el
 * lector de pantalla y lo que aparece al dejar el mouse encima.
 *
 *   import { ArrowRight } from "lucide-react";
 *   <IconButton icon={ArrowRight} label="Siguiente" />
 *
 * Variantes:
 *  - "outline" (por defecto): círculo con borde negro, como el Figma.
 *  - "ghost": sin borde, para barras de herramientas o filas de una lista.
 */
type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  label: string;
  variant?: "outline" | "ghost";
};

export function IconButton({
  icon: Icono,
  label,
  variant = "outline",
  className,
  type = "button",
  ...resto
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        // Círculo de 44px: 24px de ícono + 10px de relleno por lado (como el Figma).
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
        variant === "outline" ? "border border-line bg-surface shadow-card hover:border-ink-subtle" : "border border-transparent",
        "transition-colors duration-150 hover:bg-surface-hover",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...resto}
    >
      <Icono size={22} aria-hidden />
    </button>
  );
}
