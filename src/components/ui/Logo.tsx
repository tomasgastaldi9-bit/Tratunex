import { useId } from "react";
import { cx } from "./cx";

/**
 * Logo de Tratunex: una "T" en gris metalizado. Arriba, dos alas que suben
 * hacia afuera; abajo, un pie que se afina hacia la punta.
 *
 * - tone "dark": T gris medio (sobre fondos claros).
 * - tone "light": T gris claro (sobre el menú oscuro).
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
    <span className={cx("inline-flex items-center gap-2", className)}>
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
  // id único por logo: si hay dos en la página, cada degradé tiene su nombre.
  const id = useId().replace(/:/g, "");
  // Gris "metalizado": un degradé suave de claro (arriba) a más oscuro (abajo).
  const [claro, oscuro] = tone === "light" ? ["#e6e6e6", "#9c9c9c"] : ["#8f8f8f", "#4a4a4a"];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`t-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={claro} />
          <stop offset="1" stopColor={oscuro} />
        </linearGradient>
      </defs>
      <g fill={`url(#t-${id})`} stroke={`url(#t-${id})`} strokeWidth="1" strokeLinejoin="round">
        {/* Ala izquierda y ala derecha: suben hacia afuera. */}
        <path d="M2.5 6.5L13.5 8.6V12.4L5.6 11.2Z" />
        <path d="M29.5 6.5L18.5 8.6V12.4L26.4 11.2Z" />
        {/* Pie: ancho arriba, angosto abajo. */}
        <path d="M12.6 14H19.4L17.5 28H14.5Z" />
      </g>
    </svg>
  );
}
