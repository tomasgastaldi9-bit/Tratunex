"use client";
// "use client": este componente corre en el navegador porque necesita saber
// en qué página está el usuario (usePathname) para resaltar la sección activa.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { NAV_GROUPS, NAV_ITEMS, isNavItemActive, type NavItem } from "./navigation";

/**
 * Menú principal (en compu): columna clara a la izquierda con el nombre de la
 * app, las secciones agrupadas y "Cambiar empresa" abajo de todo.
 *
 * No recibe las secciones por props: las lee de navigation.ts, así hay un solo
 * menú en toda la app. Normalmente no lo usás directo: viene dentro de <AppShell>.
 */
export function Sidebar({ className }: { className?: string }) {
  const rutaActual = usePathname();

  return (
    <nav aria-label="Menú principal" className={cx("flex h-full flex-col border-r border-line bg-canvas", className)}>
      <Link
        href="/"
        className="mx-3 mt-4 mb-2 rounded-control px-3 py-2 text-[17px] font-semibold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-ink"
      >
        Tratunex
      </Link>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1.5 text-xs text-ink-subtle">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} activa={isNavItemActive(item, rutaActual)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3 py-3">
        <Link
          href="/login/companies"
          className="block rounded-control px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          Cambiar empresa
        </Link>
      </div>
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
        "flex items-center gap-2.5 rounded-control px-3 py-[7px] text-sm transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-ink",
        activa ? "bg-wash font-medium text-ink" : "text-ink-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      <Icono size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {item.label}
    </Link>
  );
}

/**
 * Barra de abajo en el celular: las 5 secciones principales, al alcance del
 * pulgar. El resto se abre desde Inicio.
 */
export function MobileNav() {
  const rutaActual = usePathname();
  const items = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const Icono = item.icon;
          const activa = isNavItemActive(item, rutaActual);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={activa ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[11px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                  activa ? "font-medium text-ink" : "text-ink-subtle hover:text-ink",
                )}
              >
                <Icono size={20} strokeWidth={activa ? 2 : 1.75} aria-hidden />
                {item.shortLabel ?? item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
