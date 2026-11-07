import { cx } from "./cx";

type StatCardProps = {
  /** El número o dato grande. */
  value: string | number;
  /** Qué es el número. Corto. */
  label: string;
  /** Aclaración opcional debajo del número (por ejemplo, "de 3 cotizaciones"). */
  hint?: string;
  className?: string;
};

/**
 * Tarjeta de un número importante: etiqueta chica arriba, número grande abajo.
 * Sin colores: si el número necesita llamar la atención, acompañalo con un
 * Badge de estado.
 */
export function StatCard({ value, label, hint, className }: StatCardProps) {
  return (
    <div className={cx("flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-4", className)}>
      {/* whitespace-pre-line: respeta los \n del texto para cortarlo en renglones. */}
      <p className="text-[13px] leading-tight whitespace-pre-line text-ink-muted">{label}</p>
      {/* tabular-nums: todos los dígitos ocupan el mismo ancho, así no "bailan" al cambiar. */}
      <p className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
