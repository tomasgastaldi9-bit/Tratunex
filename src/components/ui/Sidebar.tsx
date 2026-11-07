"use client";
// "use client": este componente corre en el navegador porque necesita saber
// en qué página está el usuario (usePathname) para resaltar la sección activa.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { NAV_ITEMS, type NavItem } from "./navigation";

/**
 * Menú principal (el menú lateral negro del Figma), con ícono + nombre en cada
 * sección para que cualquiera entienda a dónde va.
 *
 * - En compu: columna negra a la izquierda, con la marca arriba.
 * - En celular: barra fija abajo de todo, al alcance del pulgar (como las apps).
 *
 * No recibe las secciones por props: las lee de navigation.ts, así hay un solo
 * menú en toda la app. Normalmente no lo usás directo: viene dentro de <AppShell>.
 */
type SidebarProps = {
  /** Letra o sigla de la marca, arriba de todo (solo en compu). */
  brand?: string;
  className?: string;
};

export function Sidebar({ brand = "T", className }: SidebarProps) {
  const rutaActual = usePathname();

  // Una sección está activa si estamos en su página o en una página "hija"
  // (por ejemplo, /agent/test cuenta como dentro de /agent).
  const estaActiva = (href: string) => rutaActual === href || rutaActual.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Menú principal"
      className={cx(
        "rounded-card bg-ink text-white shadow-sidebar",
        // Celular: barra fija abajo, separada 12px de los bordes.
        // El relleno de abajo usa "safe-area-inset-bottom" para dejar lugar a la
        // barrita de inicio del iPhone. (Ojo: Tailwind lee también los
        // comentarios, así que acá no hay que escribir clases a medias.)
        "fixed inset-x-3 bottom-3 z-40 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        // Desde tablet (md): columna vertical de 112px, como el Figma.
        "md:static md:flex md:h-full md:w-[112px] md:flex-col md:items-center md:gap-10 md:px-2 md:py-8",
        className,
      )}
    >
      {/* Marca: letra grande en negrita (la "M" del Figma). En celular no entra, se oculta. */}
      <Link
        href="/"
        className="hidden text-[32px] leading-none font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:block"
      >
        {brand}
        <span className="sr-only"> — Inicio de Tratunex</span>
      </Link>

      <ul className="flex flex-row md:w-full md:flex-col md:gap-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="flex-1 md:flex-none">
            <SidebarLink item={item} activa={estaActiva(item.href)} />
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
        "flex flex-col items-center gap-1.5 rounded-control px-1 py-2 md:py-3",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        // Activa: pastilla blanca con letra negra (se ve clarísimo dónde estás).
        // Resto: blanco apagado, que se ilumina al pasar el mouse.
        activa ? "bg-white text-ink" : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icono size={22} aria-hidden />
      {/* 11px es el mínimo legible; en celular hay poco lugar para 5 secciones. */}
      <span className="text-[11px] leading-none font-bold md:text-xs">{item.label}</span>
    </Link>
  );
}
