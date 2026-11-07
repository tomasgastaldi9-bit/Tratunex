import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Etiqueta chiquita para mostrar un estado.
 *
 * "tone" elige el color según lo que SIGNIFICA (ver globals.css):
 *  - "neutral": gris. Nada especial todavía (ej. "Nuevo").
 *  - "strong": negro. Para destacar algo sin darle un significado de color.
 *  - "info": azul. Oportunidad o dato (ej. "Cliente potencial").
 *  - "success": verde. Salió bien (ej. "Compró").
 *  - "warning": ámbar. Te toca hacer algo (ej. "En seguimiento").
 *  - "danger": rojo. Salió mal o es delicado (ej. "No compró").
 *
 * Siempre que puedas, sumá un ícono (prop "icon"): así la etiqueta se
 * entiende también si alguien no distingue colores.
 *
 *   import { Clock } from "lucide-react";
 *   <Badge tone="warning" icon={Clock}>En seguimiento</Badge>
 *
 * Si necesitás la etiqueta de una etapa del pipeline, del resultado de una
 * llamada o del modo (prueba / real), NO la armes a mano: usá los
 * componentes listos de StatusBadges.tsx.
 */
export type BadgeTone = "neutral" | "strong" | "info" | "success" | "warning" | "danger";

const TONOS: Record<BadgeTone, string> = {
  neutral: "bg-surface text-ink border-line",
  strong: "bg-ink text-white border-ink",
  info: "bg-info-soft text-info border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: LucideIcon;
};

export function Badge({ tone = "neutral", icon: Icono, className, children, ...resto }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs leading-none font-bold whitespace-nowrap",
        TONOS[tone],
        className,
      )}
      {...resto}
    >
      {Icono && <Icono size={14} aria-hidden className="shrink-0" />}
      {children}
    </span>
  );
}
