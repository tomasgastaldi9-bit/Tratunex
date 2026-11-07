import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Lo que se muestra cuando una lista todavía no tiene nada
 * (sin contactos, sin llamadas, sin tareas).
 *
 * Un estado vacío NO pide perdón ("No hay datos", "Lo sentimos..."):
 * invita a dar el siguiente paso. Contá qué falta y ofrecé el botón para hacerlo.
 *  - Mal:  title="No hay datos"
 *  - Bien: title="Todavía no cargaste contactos"
 *          description="Importalos desde un archivo y el agente empieza a llamar."
 *          action={<Button icon={Upload}>Importar contactos</Button>}
 *
 *   import { Upload, Users } from "lucide-react";
 *   import { Button } from "./Button";
 *   <EmptyState
 *     icon={Users}
 *     title="Todavía no cargaste contactos"
 *     description="Importalos desde un archivo y el agente empieza a llamar."
 *     action={<Button icon={Upload}>Importar contactos</Button>}
 *   />
 *
 * - icon: un ícono de lucide-react que represente lo que falta (por defecto, una bandeja).
 * - title: qué falta, en una frase corta.
 * - description: (opcional) por qué conviene hacerlo o qué pasa después.
 * - action: (opcional) el botón para dar el siguiente paso.
 */
type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icono = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        // Borde punteado: se lee como "acá va a haber algo", un lugar libre para llenar.
        "flex flex-col items-center gap-5 rounded-card border border-dashed border-ink-subtle/40 bg-surface px-5 py-12 text-center",
        className,
      )}
    >
      {/* Círculo gris de 48px con el ícono en el medio. Es decorativo (aria-hidden):
          lo importante ya lo dice el título. */}
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-wash text-ink-muted ring-1 ring-line">
        <Icono size={24} aria-hidden />
      </span>

      <div className="flex max-w-sm flex-col gap-2.5">
        <p className="text-base leading-tight font-bold">{title}</p>
        {description && <p className="text-sm leading-snug text-ink-muted">{description}</p>}
      </div>

      {action}
    </div>
  );
}
