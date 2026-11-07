import { cx } from "./cx";

/**
 * Cuadradito con las iniciales de una persona (en vez de una foto).
 *
 *   <Avatar name="María José Pérez" />            → "MJ"
 *   <Avatar name="Lucas" size="sm" tone="dark" /> → "L"
 *
 * - name: el nombre completo. Se toman las primeras letras de las dos
 *   primeras palabras.
 * - size: "md" (por defecto, 50px como el Figma) o "sm" (36px, para listas apretadas).
 * - tone: "light" (por defecto, blanco con letra negra: resalta sobre las
 *   tarjetas grises) o "dark" (negro con letra blanca).
 *
 * Accesibilidad: el avatar está oculto para el lector de pantalla
 * (aria-hidden), porque casi siempre va al lado del nombre escrito. Si no,
 * escucharía "M J, María José" (repetido y sin sentido).
 * Si alguna vez lo usás SOLO, sin el nombre al lado, sumá el nombre en texto
 * para el lector de pantalla: <span className="sr-only">María José Pérez</span>
 */
type AvatarProps = {
  name: string;
  size?: "sm" | "md";
  tone?: "light" | "dark";
  className?: string;
};

const TAMANIOS = {
  sm: "size-9 text-xs",
  md: "size-[50px] text-sm",
};

const TONOS = {
  light: "bg-wash text-ink ring-1 ring-line",
  dark: "bg-graphite text-white",
};

/**
 * Palabras "de unión" que no aportan a las iniciales. Sin esto,
 * "Ferretería del Sur" daría "FD" en vez de "FS".
 */
const PALABRAS_DE_UNION = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "&"]);

/**
 * Saca las iniciales de un nombre: "maría josé pérez" → "MJ",
 * "Ferretería del Sur" → "FS".
 * Array.from separa bien las letras "raras" (emojis o letras compuestas),
 * cosa que name[0] a veces corta por la mitad.
 */
function iniciales(nombre: string): string {
  const todas = nombre.trim().split(/\s+/).filter(Boolean);
  const importantes = todas.filter((palabra) => !PALABRAS_DE_UNION.has(palabra.toLowerCase()));
  // Si el nombre era solo palabras de unión (raro), usamos las originales.
  const palabras = importantes.length > 0 ? importantes : todas;
  const letras = palabras.slice(0, 2).map((palabra) => Array.from(palabra)[0]);
  // Si el nombre vino vacío, mostramos "?" en vez de un cuadrado en blanco.
  return letras.join("").toUpperCase() || "?";
}

export function Avatar({ name, size = "md", tone = "light", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cx(
        // shrink-0: dentro de una fila flex, el avatar nunca se aplasta.
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold",
        TAMANIOS[size],
        TONOS[tone],
        className,
      )}
    >
      {iniciales(name)}
    </span>
  );
}
