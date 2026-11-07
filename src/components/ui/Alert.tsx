import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Aviso dentro de la página: una cajita de color que le cuenta algo al usuario
 * (que algo salió bien, que falta un dato, que hubo un error).
 *
 * "tone" elige el color según lo que SIGNIFICA (ver globals.css):
 *  - "info" (por defecto): azul. Un dato útil ("La voz se prueba en el navegador").
 *  - "success": verde. Salió bien ("Guardamos el contacto").
 *  - "warning": ámbar. Te toca hacer algo ("Falta el teléfono de 3 contactos").
 *  - "danger": rojo. Salió mal ("No pudimos iniciar la llamada").
 *
 * Cómo escribir el texto: decí QUÉ PASÓ y QUÉ HACER AHORA.
 *  - Mal:  "Error 500."
 *  - Bien: title="No pudimos guardar el contacto"
 *          children="Revisá tu conexión y probá de nuevo."
 *
 * Si hay una acción que lo resuelve, pasala en "action" (va a la derecha y,
 * en el celular, baja abajo del texto si no entra):
 *
 *   import { Button } from "./Button";
 *   <Alert
 *     tone="danger"
 *     title="No pudimos iniciar la llamada"
 *     action={<Button size="sm" variant="secondary">Reintentar</Button>}
 *   >
 *     Revisá que el número tenga código de área y probá de nuevo.
 *   </Alert>
 */
export type AlertTone = "info" | "success" | "warning" | "danger";

// Fondo suave + texto fuerte del mismo color: siempre se lee bien (contraste ≥ 4.5:1).
const TONOS: Record<AlertTone, string> = {
  info: "border-info/10 bg-info-soft text-info",
  success: "border-success/10 bg-success-soft text-success",
  warning: "border-warning/10 bg-warning-soft text-warning",
  danger: "border-danger/10 bg-danger-soft text-danger",
};

// Un ícono distinto por tono: así el aviso se entiende aunque alguien no
// distinga colores (no dependemos solo del color).
const ICONOS: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

type AlertProps = {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const Icono = ICONOS[tone];

  return (
    <div
      // role le dice al lector de pantalla cómo anunciar el aviso:
      //  - "alert" (solo errores): lo lee en el momento, interrumpiendo.
      //  - "status" (el resto): lo lee cuando termina lo que estaba diciendo.
      // Interrumpir por algo que no es urgente molesta, por eso solo "danger" usa "alert".
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-card border px-4 py-3", TONOS[tone], className)}
    >
      {/* shrink-0: el ícono nunca se achica aunque el texto sea largo. */}
      <Icono size={18} aria-hidden className="mt-px shrink-0" />

      {/* flex-wrap: si no entra el texto + la acción en una línea (celular),
          la acción baja abajo en vez de aplastar el texto. */}
      <div className="flex min-w-0 grow flex-wrap items-center gap-x-5 gap-y-3">
        {/* basis-56: el texto pide al menos ~224px antes de compartir la fila con la acción. */}
        <div className="flex min-w-0 grow basis-56 flex-col gap-1.5 text-sm">
          {title && <p className="leading-tight font-semibold">{title}</p>}
          {children && <div className="leading-snug">{children}</div>}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
