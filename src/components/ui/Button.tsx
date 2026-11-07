import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Botón de Tratunex.
 *
 * Variantes (qué tan importante es la acción):
 *  - "primary": negro con letra blanca. La acción MÁS importante de la
 *    pantalla. Tratá de que haya una sola por sección.
 *  - "secondary": gris claro. Acciones de apoyo ("Cancelar", "Ver detalle").
 *  - "ghost": sin fondo. Acciones discretas dentro de listas o tarjetas.
 *  - "danger": rojo. Solo para acciones que borran o no tienen vuelta atrás.
 *    El texto tiene que decir qué pasa ("Borrar contacto", no "Aceptar").
 *
 * Tamaños:
 *  - "md" (por defecto): letra de 14px, cómodo de leer y de tocar.
 *  - "sm": letra de 12px, como el Figma. Para lugares apretados (filas de listas).
 *
 * Extras:
 *  - icon: un ícono de lucide-react a la izquierda del texto.
 *      import { Phone } from "lucide-react";
 *      <Button icon={Phone}>Llamar</Button>
 *  - loading: muestra una ruedita, ignora los clics (evita el doble clic) y
 *    avisa al lector de pantalla que está trabajando, SIN sacarle el foco a
 *    quien usa el teclado. Cambiá también el texto: <Button loading>Llamando…</Button>
 *    Igual, en tu función de guardar, chequeá que no esté ya guardando: el
 *    navegador puede enviar un formulario apretando Enter en un campo.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTES: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink/80",
  secondary: "bg-surface text-ink hover:bg-surface-hover",
  ghost: "bg-transparent text-ink hover:bg-surface",
  danger: "bg-danger text-white hover:bg-danger/85",
};

const TAMANIOS: Record<ButtonSize, string> = {
  sm: "min-h-8 px-4 py-2 text-xs",
  // 40px de alto mínimo: fácil de tocar con el dedo en el celular.
  md: "min-h-10 px-5 py-2.5 text-sm",
};

const TAMANIO_ICONO: Record<ButtonSize, number> = { sm: 14, md: 16 };

/**
 * Devuelve las clases de un botón. Sirve para que un link (<Link> de Next)
 * se vea igual que un botón, sin ser un <button>:
 *   <Link href="/agent" className={buttonStyles({ variant: "secondary" })}>Ir al agente</Link>
 */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    // Base común: esquinas de 10px, texto en una línea, transición suave.
    "inline-flex items-center justify-center gap-2 rounded-control leading-none font-bold whitespace-nowrap",
    "transition-colors duration-150",
    // Anillo negro visible cuando se navega con teclado (accesibilidad).
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    // Deshabilitado: más claro y sin clic.
    "disabled:pointer-events-none disabled:opacity-40",
    VARIANTES[variant],
    TAMANIOS[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
};

export function Button({
  variant,
  size = "md",
  icon: IconoBoton,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...resto
}: ButtonProps) {
  const lado = TAMANIO_ICONO[size];

  return (
    <button
      {...resto}
      // type="button" por defecto: así un botón dentro de un formulario no lo
      // envía sin querer. Para enviar, pasá type="submit".
      // Mientras carga lo pasamos a "button": así no vuelve a enviar el formulario.
      type={loading ? "button" : type}
      disabled={disabled}
      // Mientras carga NO usamos "disabled": un botón deshabilitado pierde el
      // foco del teclado (la persona queda "perdida" al principio de la página).
      // En cambio, le sacamos lo que hace al apretarlo (onClick) y avisamos al
      // lector de pantalla que está ocupado (aria-busy) y no disponible (aria-disabled).
      onClick={loading ? undefined : onClick}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={buttonStyles({ variant, size, className: cx(loading && "cursor-wait", className) })}
    >
      {/* Mientras carga, la ruedita reemplaza al ícono. */}
      {loading ? (
        <LoaderCircle size={lado} className="animate-spin" aria-hidden />
      ) : (
        IconoBoton && <IconoBoton size={lado} aria-hidden />
      )}
      {children}
    </button>
  );
}
