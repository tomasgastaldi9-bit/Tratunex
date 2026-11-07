import { FileText, ShoppingCart, UsersRound, Wallet, type LucideIcon } from "lucide-react";

/**
 * Secciones del menú principal de Tratunex (el menú lateral negro).
 *
 * Es el ÚNICO lugar donde se define el menú: si agregás una sección nueva,
 * sumala acá y aparece sola en la compu y en el celular.
 *
 * El orden sigue el recorrido de compras del MVP (BRIEF §4):
 * nueva compra → proveedores → cotizaciones → pagos.
 *
 * Cada sección dice de quién es (BRIEF §5), para saber a quién preguntar.
 */
export type NavItem = {
  /** Ruta de la página (tiene que empezar con /). */
  href: string;
  /** Nombre que se ve debajo del ícono. */
  label: string;
  /** Ícono de lucide-react que represente la sección. */
  icon: LucideIcon;
  /** Responsable de la sección. */
  owner: "Vale" | "Tomás" | "Bautista" | "Nano";
  /** Pantallas existentes que pertenecen al mismo paso del recorrido. */
  aliases?: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/purchases/new", label: "Nueva compra", icon: ShoppingCart, owner: "Vale", aliases: ["/agent/rules"] },
  { href: "/suppliers", label: "Proveedores", icon: UsersRound, owner: "Nano", aliases: ["/prospects"] },
  { href: "/orders/quotes", label: "Cotizaciones", icon: FileText, owner: "Nano", aliases: ["/calls/quotes"] },
  { href: "/orders", label: "Pagos", icon: Wallet, owner: "Nano" },
];

/** Una sola sección activa: el prefijo completo más específico gana. */
export function getActiveNavHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let active: string | null = null;
  let longest = 0;
  for (const item of NAV_ITEMS) {
    for (const prefix of [item.href, ...(item.aliases ?? [])]) {
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && prefix.length > longest) {
        active = item.href;
        longest = prefix.length;
      }
    }
  }
  return active;
}
