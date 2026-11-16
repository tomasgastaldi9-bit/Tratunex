import { cx } from "./cx";

/**
 * Logo de Tratunex (kit de marca 1.0): el símbolo "Filo partido" y el nombre.
 *
 * El símbolo es una T con forma de embudo con filo, partida al medio: de muchos
 * proveedores al mejor, y la pyme y el proveedor que se encuentran en el trato.
 * Los trazos salen tal cual del kit (02-Logo); el nombre ya está en curvas
 * (Inter Display SemiBold), así que no depende de la fuente cargada.
 *
 * - tone "dark": tinta #1A1A1A (sobre fondos claros).
 * - tone "light": blanco (sobre el menú oscuro).
 * - withName: logo horizontal con el nombre; si no, solo el símbolo.
 */

// Símbolo en un lienzo de 256: embudo con lados a 45°, tallo con punta a 45° y ranura de 8.
const SIMBOLO = "M24 38H124V204L102 226V90H76Z M132 38H232L180 90H154V174L132 196Z";
// Versión chica (24 px o menos): sin la ranura, que a ese tamaño no se ve.
const SIMBOLO_CHICO = "M24 38H232L180 90H154V174L102 226V90H76Z";
// Nombre "Tratunex" en curvas, del logo horizontal del kit.
const NOMBRE_TRANSFORM = "translate(216.505 127.500) scale(0.067114) translate(-46 0)";
const NOMBRE = "M46 -1261H510V0H775V-1261H1237V-1490H46ZM1202.28 0H1454.28V-598C1454.28 -763 1547.28 -846 1667.28 -846C1717.28 -846 1767.28 -841 1786.28 -838V-1062C1766.28 -1064 1738.28 -1066 1704.28 -1066C1568.28 -1066 1487.28 -1002 1448.28 -881H1445.28V-1056H1202.28ZM2202.56 17C2374.56 17 2463.56 -55 2513.56 -149H2517.56V0H2765.56V-720C2765.56 -940 2602.56 -1077 2327.56 -1077C2051.56 -1077 1879.56 -938 1867.56 -728H2110.56C2117.56 -817 2199.56 -881 2322.56 -881C2443.56 -881 2515.56 -817 2515.56 -727V-719C2515.56 -647 2448.56 -644 2252.56 -622C2034.56 -599 1837.56 -540 1837.56 -300C1837.56 -89 1992.56 17 2202.56 17ZM2264.56 -170C2154.56 -170 2083.56 -219 2083.56 -302C2083.56 -398 2175.56 -437 2283.56 -453C2387.56 -469 2485.56 -485 2516.56 -505V-391C2516.56 -268 2429.56 -170 2264.56 -170ZM3514.84 -1056H3299.84V-1344H3046.84V-1056H2862.84V-853H3046.84V-266C3046.84 -85 3147.84 0 3362.84 0H3514.84V-203H3406.84C3324.84 -203 3299.84 -228 3299.84 -303V-853H3514.84ZM4019.12 21C4165.12 21 4272.12 -43 4344.12 -162V0H4592.12V-1056H4339.12V-459C4339.12 -279 4241.12 -200 4108.12 -200C3973.12 -200 3895.12 -281 3895.12 -436V-1056H3643.12V-396C3643.12 -125 3798.12 21 4019.12 21ZM5037.4 -597C5037.4 -777 5136.4 -856 5268.4 -856C5403.4 -856 5481.4 -775 5481.4 -620V0H5734.4V-660C5734.4 -931 5578.4 -1077 5357.4 -1077C5212.4 -1077 5105.4 -1013 5033.4 -894V-1056H4785.4V0H5037.4ZM6393.679999999999 24C6640.679999999999 24 6836.679999999999 -119 6876.679999999999 -326H6640.679999999999C6611.679999999999 -236 6526.679999999999 -175 6399.679999999999 -175C6229.679999999999 -175 6131.679999999999 -290 6125.679999999999 -462H6889.679999999999V-531C6889.679999999999 -855 6687.679999999999 -1080 6383.679999999999 -1080C6087.679999999999 -1080 5878.679999999999 -848 5878.679999999999 -527C5878.679999999999 -207 6076.679999999999 24 6393.679999999999 24ZM6127.679999999999 -636C6144.679999999999 -787 6241.679999999999 -880 6387.679999999999 -880C6533.679999999999 -880 6631.679999999999 -787 6647.679999999999 -636ZM6892.959999999999 0H7173.959999999999L7301.959999999999 -188C7341.959999999999 -250 7378.959999999999 -309 7415.959999999999 -367C7452.959999999999 -309 7488.959999999999 -250 7527.959999999999 -188L7653.959999999999 0H7935.959999999999L7557.959999999999 -543L7918.959999999999 -1056H7641.959999999999L7529.959999999999 -888C7490.959999999999 -826 7454.959999999999 -768 7418.959999999999 -709C7382.959999999999 -768 7346.959999999999 -826 7308.959999999999 -888L7198.959999999999 -1056H6917.959999999999L7275.959999999999 -538Z";
// Proporción del logo horizontal del kit (746,03 × 155).
const HORIZONTAL_ANCHO = 746.03;
const HORIZONTAL_ALTO = 155;

const colorDe = (tone: "dark" | "light") => (tone === "light" ? "text-white" : "text-ink");

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
  if (!withName) {
    return (
      <span className={cx("inline-flex items-center", className)}>
        <LogoMark tone={tone} size={size} />
        <span className="sr-only">Tratunex</span>
      </span>
    );
  }
  // El alto del logo horizontal es el del símbolo: así reemplaza al anterior sin mover nada.
  return (
    <span className={cx("inline-flex items-center", colorDe(tone), className)}>
      <svg
        viewBox={`0 0 ${HORIZONTAL_ANCHO} ${HORIZONTAL_ALTO}`}
        height={size}
        width={Math.round((size * HORIZONTAL_ANCHO) / HORIZONTAL_ALTO)}
        aria-hidden
        className="shrink-0"
      >
        <path fill="currentColor" transform="scale(0.82447) translate(-24 -38)" d={SIMBOLO} />
        <path fill="currentColor" transform={NOMBRE_TRANSFORM} d={NOMBRE} />
      </svg>
      <span className="sr-only">Tratunex</span>
    </span>
  );
}

/** Solo el símbolo (sin el nombre). Decorativo: el nombre lo da Logo o el link que lo envuelve. */
export function LogoMark({ tone = "dark", size = 28 }: { tone?: "dark" | "light"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden className={cx("shrink-0", colorDe(tone))}>
      <path fill="currentColor" d={size <= 24 ? SIMBOLO_CHICO : SIMBOLO} />
    </svg>
  );
}
