"use client";
// "use client": este componente corre en el navegador porque necesita saber
// en qué página está el usuario (usePathname) para resaltar la sección activa.

import { Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { NAV_GROUPS, NAV_ITEMS, isNavItemActive, type NavItem } from "./navigation";

/**
 * Menú principal: columna oscura a la izquierda (en compu) con la marca
 * arriba, las secciones agrupadas y "Cambiar empresa" abajo de todo.
 *
 * No recibe las secciones por props: las lee de navigation.ts, así hay un solo
 * menú en toda la app. Normalmente no lo usás directo: viene dentro de <AppShell>.
 */
export function Sidebar({ className }: { className?: string }) {
  const rutaActual = usePathname();

  return (
    <nav
      aria-label="Menú principal"
      className={cx(
        "relative flex h-full flex-col overflow-hidden text-white",
        // Degradé grafito → negro, con un círculo decorativo arriba a la derecha.
        "bg-[linear-gradient(165deg,var(--color-graphite-soft)_0%,var(--color-ink)_55%,var(--color-graphite)_100%)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-28 size-72 rounded-full border border-white/[0.06] bg-white/[0.03]"
      />

      {/* Marca. Es un link al inicio. */}
      <Link
        href="/"
        className="relative flex items-center gap-3 border-b border-white/10 px-6 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
      >
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-white text-xl font-bold text-ink shadow-sm">
          t
        </span>
        <span className="text-2xl font-semibold tracking-tight">
          Tratu<span className="text-white/45">nex</span>
        </span>
      </Link>

      <div className="relative flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.16em] text-white/40 uppercase">
              {group.title}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} activa={isNavItemActive(item, rutaActual)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Pie: empresa activa. Lleva a elegir otra empresa o cerrar sesión. */}
      <div className="relative border-t border-white/10 p-4">
        <Link
          href="/login/companies"
          className="flex items-center gap-3 rounded-control px-3 py-2.5 text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Building2 size={18} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold text-white">Mi empresa</span>
            <span className="text-xs text-white/50">Cambiar empresa o salir</span>
          </span>
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
        "group flex items-center gap-3 rounded-control border px-3 py-2 text-[15px]",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        // Activa: fondo un poco más claro y borde fino (se ve clarísimo dónde estás).
        activa
          ? "border-white/15 bg-white/[0.09] font-semibold text-white"
          : "border-transparent text-white/70 hover:bg-white/[0.05] hover:text-white",
      )}
    >
      <span
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors",
          activa ? "bg-white text-ink" : "bg-white/[0.06] text-white/80 group-hover:bg-white/10",
        )}
      >
        <Icono size={17} aria-hidden />
      </span>
      {item.label}
    </Link>
  );
}

/**
 * Barra de abajo en el celular: las 5 secciones principales, al alcance del
 * pulgar (como las apps). El resto se abre desde Inicio.
 */
export function MobileNav() {
  const rutaActual = usePathname();
  const items = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <nav
      aria-label="Menú principal"
      className={cx(
        "fixed inset-x-3 bottom-3 z-40 rounded-card bg-ink px-2 pt-2 text-white shadow-sidebar md:hidden",
        // Deja lugar para la barrita de inicio del iPhone.
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
      )}
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
                  "flex flex-col items-center gap-1.5 rounded-control px-1 py-2 transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  activa ? "bg-white text-ink" : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icono size={20} aria-hidden />
                <span className="text-[11px] leading-none font-semibold">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
