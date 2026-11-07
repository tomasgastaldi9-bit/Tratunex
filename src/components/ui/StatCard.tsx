import { cx } from "./cx";

/**
 * Tarjeta con un número grande y una descripción al lado
 * (en el Figma: "11 Courses completed" y "04 Courses in progress").
 *
 * En Tratunex sirve para cosas como "12 llamadas hoy" o "04 clientes potenciales".
 *
 * - value: el número (o texto corto) que se ve grande.
 * - label: lo que significa ese número. Podés usar un salto de línea
 *   ("Llamadas\nhoy") para cortarlo en dos renglones como en el Figma.
 */
type StatCardProps = {
  value: string | number;
  label: string;
  className?: string;
};

export function StatCard({ value, label, className }: StatCardProps) {
  return (
    <div className={cx("flex items-center gap-2.5 rounded-card bg-surface p-5", className)}>
      {/* tabular-nums: todos los dígitos ocupan el mismo ancho, así no "bailan" al cambiar. */}
      <p className="text-[32px] leading-none font-bold tabular-nums">{value}</p>
      {/* whitespace-pre-line: respeta los \n del texto para cortarlo en renglones. */}
      <p className="text-sm leading-none whitespace-pre-line">{label}</p>
    </div>
  );
}
