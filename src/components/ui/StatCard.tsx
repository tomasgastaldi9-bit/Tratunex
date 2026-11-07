import { cx } from "./cx";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "info";

/** Color del borde izquierdo y del puntito de cada tono. */
const TONOS: Record<StatTone, { borde: string; punto: string }> = {
  neutral: { borde: "border-l-ink", punto: "bg-ink" },
  success: { borde: "border-l-success", punto: "bg-success" },
  warning: { borde: "border-l-warning", punto: "bg-warning" },
  danger: { borde: "border-l-danger", punto: "bg-danger" },
  info: { borde: "border-l-info", punto: "bg-info" },
};

type StatCardProps = {
  /** El número o dato grande. */
  value: string | number;
  /** Qué es el número. Corto; se muestra en mayúsculas chiquitas. */
  label: string;
  /** Aclaración opcional debajo del número (por ejemplo, "de 3 cotizaciones"). */
  hint?: string;
  /** Color del borde y del puntito. Solo usá color si el dato dice algo (pendiente = warning). */
  tone?: StatTone;
  className?: string;
};

/**
 * Tarjeta de un número importante: etiqueta arriba, número grande abajo,
 * con un borde de color a la izquierda que dice de qué tipo es.
 */
export function StatCard({ value, label, hint, tone = "neutral", className }: StatCardProps) {
  const colores = TONOS[tone];
  return (
    <div
      className={cx(
        "relative flex flex-col gap-3 rounded-card border border-l-4 border-line bg-surface px-5 py-4 shadow-card",
        colores.borde,
        className,
      )}
    >
      <span aria-hidden className={cx("absolute top-4 right-4 size-2 rounded-full", colores.punto)} />
      {/* whitespace-pre-line: respeta los \n del texto para cortarlo en renglones. */}
      <p className="pr-4 text-xs leading-tight font-semibold tracking-[0.12em] whitespace-pre-line text-ink-muted uppercase">
        {label}
      </p>
      {/* tabular-nums: todos los dígitos ocupan el mismo ancho, así no "bailan" al cambiar. */}
      <p className="text-[34px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
