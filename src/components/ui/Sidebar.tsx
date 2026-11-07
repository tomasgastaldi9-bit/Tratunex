"use client";
// "use client": este componente corre en el navegador porque necesita saber
// en qué página está el usuario (usePathname) para resaltar la sección activa.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { getActiveNavHref, NAV_ITEMS, type NavItem } from "./navigation";

/**
 * Menú principal: los cuatro pasos del recorrido de compras (navigation.ts),
 * con ícono + nombre en cada uno.
 *
 * - Sidebar: la lista de la columna oscura de la izquierda (en compu). El logo
 *   y "Cambiar empresa" los pone <AppShell> arriba y abajo de esta lista.
 * - MobileNav: la barra fija de abajo en el celular, al alcance del pulgar.
 *
 * No reciben las secciones por props: las leen de navigation.ts, así hay un
 * solo menú en toda la app. Normalmente no los usás directo: vienen en <AppShell>.
 */
export function Sidebar({ className }: { className?: string }) {
  const activeHref = getActiveNavHref(usePathname());

  return (
    <nav aria-label="Menú principal" className={cx("px-3", className)}>
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} activa={activeHref === item.href} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({ item, activa }: { item: NavItem; activa: boolean }) {
  const Icono = item.icon;

  return (
    <Link
      href={item.href}
      // aria-current="page": le avisa al lector de pantalla cuál es la página actual.
      aria-current={activa ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-white",
        // Activa: fondo gris más claro, letra blanca y una rayita blanca a la izquierda.
        activa
          ? "bg-white/10 font-medium text-white before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-white"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-100",
      )}
    >
      <Icono size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {item.label}
    </Link>
  );
}

/** Barra de abajo en el celular, con los mismos cuatro pasos. */
export function MobileNav() {
  const activeHref = getActiveNavHref(usePathname());

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-0 bottom-0 z-40 bg-gray-900 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const Icono = item.icon;
          const activa = activeHref === item.href;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={activa ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-center text-[11px] leading-tight transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white",
                  activa ? "font-medium text-white" : "text-gray-500 hover:text-gray-200",
                )}
              >
                <Icono size={20} strokeWidth={activa ? 2 : 1.75} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
