import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Botón de Tratunex.
 *
 * Variantes (qué tan importante es la acción):
 *  - "primary": gris casi negro con letra blanca. La acción MÁS importante de
 *    la pantalla. Tratá de que haya una sola por sección.
 *  - "secondary": blanco con borde. Acciones de apoyo ("Cancelar", "Ver detalle").
 *  - "soft": gris claro, sin borde. Acciones frecuentes pero no principales
 *    ("Agregar otro", filtros).
 *  - "ghost": sin fondo. Acciones discretas dentro de listas o tarjetas.
 *  - "danger": rojo. Solo para acciones que borran o no tienen vuelta atrás.
 *    El texto tiene que decir qué pasa ("Borrar contacto", no "Aceptar").
 *
 * Todos responden al mouse (se oscurecen), al clic (se hunden 1px) y al
 * teclado (anillo visible). Deshabilitados se ven grises y no reaccionan.
 *
 * Tamaños:
 *  - "md" (por defecto): 40px de alto, letra de 14px. Cómodo de tocar.
 *  - "sm": 32px de alto. Para lugares apretados (filas de listas).
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
export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTES: Record<ButtonVariant, string> = {
  // Brillo de 1px arriba y sombra mínima abajo: se lee como algo que se aprieta.
  primary:
    "border-gray-900 bg-gray-900 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_1px_2px_rgb(0_0_0/0.15)] hover:border-gray-800 hover:bg-gray-800 active:bg-gray-950",
  secondary:
    "border-gray-300 bg-white text-gray-900 shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100",
  soft: "border-transparent bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300",
  ghost: "border-transparent bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200",
  danger: "border-danger bg-danger text-white shadow-[0_1px_2px_rgb(0_0_0/0.15)] hover:bg-danger/90 active:bg-danger",
};

const TAMANIOS: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-[13px]",
  // 40px de alto mínimo: fácil de tocar con el dedo en el celular.
  md: "min-h-10 px-4 text-sm",
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
    // Base común: borde de 1px (así todas las variantes miden lo mismo), texto en una línea.
    "inline-flex items-center justify-center gap-2 rounded-control border leading-none font-medium whitespace-nowrap select-none",
    // Transición corta de color y el "hundido" de 1px al hacer clic (sin movimiento si la persona lo pidió).
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
    // Anillo visible cuando se navega con teclado (accesibilidad).
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900",
    // Deshabilitado: gris plano, sin sombra y sin clic.
    "disabled:pointer-events-none disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none",
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
