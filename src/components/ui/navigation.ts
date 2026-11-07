import {
  Bot,
  ClipboardList,
  Contact,
  House,
  PhoneCall,
  PhoneIncoming,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

/**
 * Secciones del menú principal de Tratunex (el menú lateral oscuro).
 *
 * Es el ÚNICO lugar donde se define el menú: si agregás una sección nueva,
 * sumala acá y aparece sola en la compu y en el celular.
 *
 * Los grupos siguen el recorrido de la demo (BRIEF §4):
 * necesidad → reglas → proveedores → cotización por llamada → elección y pago.
 * Solo van páginas que existen: un link a una página que no existe da 404.
 *
 * Cada sección dice de quién es (BRIEF §5), para saber a quién preguntar.
 */
export type NavItem = {
  /** Ruta de la página (tiene que empezar con /). */
  href: string;
  /** Nombre que se ve al lado del ícono. Corto: una o dos palabras. */
  label: string;
  /** Nombre más corto para la barra del celular (si no, usa label). */
  shortLabel?: string;
  /** Ícono de lucide-react que represente la sección. */
  icon: LucideIcon;
  /** Responsable de la sección. */
  owner: "Vale" | "Tomás" | "Bautista" | "Nano";
  /** true = también aparece en la barra de abajo del celular (máximo 5). */
  mobile?: boolean;
  /** true = solo se marca activa en su ruta exacta (no en sus "hijas"). */
  exact?: boolean;
};

export type NavGroup = {
  /** Título del grupo, en mayúsculas chiquitas. */
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Principal",
    items: [
      { href: "/", label: "Inicio", icon: House, owner: "Nano", mobile: true, exact: true },
      { href: "/purchases/new", label: "Nueva compra", shortLabel: "Comprar", icon: ShoppingCart, owner: "Vale", mobile: true },
    ],
  },
  {
    title: "Compras",
    items: [
      { href: "/suppliers", label: "Proveedores", icon: Truck, owner: "Nano", mobile: true },
      { href: "/calls/quotes/import", label: "Cotizaciones", shortLabel: "Cotizar", icon: PhoneIncoming, owner: "Bautista", mobile: true },
      { href: "/calls", label: "Llamadas", icon: PhoneCall, owner: "Bautista", exact: true },
      { href: "/prospects", label: "Buscar proveedores", icon: Search, owner: "Tomás" },
      { href: "/contacts", label: "Contactos", icon: Contact, owner: "Nano" },
    ],
  },
  {
    title: "Agente",
    items: [
      { href: "/agent", label: "Agente", icon: Bot, owner: "Vale", mobile: true, exact: true },
      { href: "/agent/rules", label: "Reglas de pago", icon: ShieldCheck, owner: "Vale" },
      { href: "/agent/profile", label: "Perfil de empresa", icon: ClipboardList, owner: "Vale" },
    ],
  },
];

/** Todas las secciones en una sola lista (para la barra del celular y las pruebas). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * ¿La sección está activa en esta ruta?
 * - exact: solo en su ruta (así "Agente" no se prende en "Reglas de pago").
 * - si no: también en sus páginas "hijas" (/suppliers/123 cuenta como Proveedores).
 * Nunca se prende una sección "padre" si hay otra más específica que coincide
 * (/calls/quotes/import es Cotizaciones, no Llamadas).
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  if (item.exact) return false;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  const masEspecifica = NAV_ITEMS.some(
    (otro) => otro.href.length > item.href.length && (pathname === otro.href || pathname.startsWith(`${otro.href}/`)),
  );
  return !masEspecifica;
}
