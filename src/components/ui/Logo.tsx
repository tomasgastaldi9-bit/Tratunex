import { cx } from "./cx";

/**
 * Logo de Tratunex: una "T" geométrica dentro de un cuadrado redondeado.
 * El pie de la T termina en diagonal, como un corte: es el detalle propio
 * de la marca.
 *
 * - tone "dark": cuadrado casi negro con la T blanca (sobre fondos claros).
 * - tone "light": cuadrado blanco con la T casi negra (sobre el menú oscuro).
 * - withName: muestra "Tratunex" al lado.
 */
export function Logo({
  tone = "dark",
  size = 28,
  withName = true,
  className,
}: {
  tone?: "dark" | "light";
  size?: number;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} size={size} />
      {withName && (
        <span
          className={cx(
            "text-[17px] leading-none font-semibold tracking-[-0.02em]",
            tone === "light" ? "text-white" : "text-gray-900",
          )}
        >
          Tratunex
        </span>
      )}
      {!withName && <span className="sr-only">Tratunex</span>}
    </span>
  );
}

/** Solo el símbolo (sin el nombre). Decorativo: el nombre lo da Logo o el link que lo envuelve. */
export function LogoMark({ tone = "dark", size = 28 }: { tone?: "dark" | "light"; size?: number }) {
  const fondo = tone === "light" ? "#ffffff" : "#1a1a1a";
  const letra = tone === "light" ? "#1a1a1a" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill={fondo} />
      {/* T: barra de arriba y pie con corte en diagonal. */}
      <path d="M8 8.5H24V13H18.25V21L13.75 24V13H8Z" fill={letra} />
    </svg>
  );
}
