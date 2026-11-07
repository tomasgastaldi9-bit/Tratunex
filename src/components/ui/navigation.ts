import { Bot, ListChecks, Phone, Search, SquareKanban, type LucideIcon } from "lucide-react";

/**
 * Secciones del menú principal de Tratunex (el menú lateral negro).
 *
 * Es el ÚNICO lugar donde se define el menú: si agregás una sección nueva,
 * sumala acá y aparece sola en la compu y en el celular.
 *
 * El orden sigue el recorrido del producto (BRIEF §4):
 * entrenar al agente → buscar prospectos → llamar → seguir en el pipeline → tareas.
 *
 * Cada sección dice de quién es (BRIEF §5), para saber a quién preguntar.
 */
export type NavItem = {
  /** Ruta de la página (tiene que empezar con /). */
  href: string;
  /** Nombre que se ve debajo del ícono. Corto: una palabra si se puede. */
  label: string;
  /** Ícono de lucide-react que represente la sección. */
  icon: LucideIcon;
  /** Responsable de la sección. */
  owner: "Vale" | "Tomás" | "Bautista" | "Nano";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/agent", label: "Agente", icon: Bot, owner: "Vale" },
  { href: "/prospects", label: "Prospección", icon: Search, owner: "Tomás" },
  { href: "/calls", label: "Llamadas", icon: Phone, owner: "Bautista" },
  { href: "/pipeline", label: "Pipeline", icon: SquareKanban, owner: "Nano" },
  { href: "/tasks", label: "Tareas", icon: ListChecks, owner: "Nano" },
];
