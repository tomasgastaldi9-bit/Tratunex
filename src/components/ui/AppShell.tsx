import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { MobileNav, Sidebar } from "./Sidebar";

/**
 * El "marco" de todas las pantallas internas: menú oscuro a la izquierda y el
 * contenido sobre fondo gris claro, con tarjetas blancas.
 *
 * CÓMO USARLO en tu sección: creá un layout.tsx en tu carpeta de app y
 * envolvé a los hijos. Ejemplo para /agent (src/app/agent/layout.tsx):
 *
 *   import { AppShell } from "@/components/ui/AppShell";
 *   export default function AgentLayout({ children }: { children: React.ReactNode }) {
 *     return <AppShell>{children}</AppShell>;
 *   }
 *
 * Así cada uno decide qué pantallas llevan menú (el login, por ejemplo, no).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* Link invisible que aparece al usar Tab: permite saltar el menú e ir
          directo al contenido (ayuda a quien navega con teclado). */}
      <a
        href="#contenido"
        className="sr-only rounded-control bg-ink px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        Saltar al contenido
      </a>

      {/* En compu el menú ocupa todo el alto y queda quieto al scrollear.
          Columna gris oscura: logo (lleva al inicio), los pasos y "Cambiar empresa". */}
      <aside className="hidden shrink-0 bg-gray-900 md:sticky md:top-0 md:flex md:h-screen md:w-[232px] md:flex-col">
        <Link
          href="/"
          className="mx-3 mt-5 mb-4 rounded-control px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Logo tone="light" />
        </Link>
        <p className="px-6 pb-1.5 text-xs text-gray-500">Compras</p>
        <Sidebar className="flex-1 overflow-y-auto" />
        <div className="border-t border-white/10 px-3 py-3">
          <Link
            href="/login/companies"
            className="block rounded-control px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            Cambiar empresa
          </Link>
        </div>
      </aside>

      {/* En el celular no hay menú lateral: arriba va el nombre y abajo la barra. */}
      <header className="flex items-center border-b border-line bg-surface px-4 py-3 md:hidden">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <MobileNav />

      {/* tabIndex={-1}: permite que "Saltar al contenido" mueva el foco del
          teclado hasta acá. pb-28 en celular: lugar para la barra de abajo. */}
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[1120px] min-w-0 flex-1 flex-col gap-6 px-4 pt-6 pb-28 outline-none md:px-10 md:pt-10 md:pb-16"
      >
        {children}
      </main>
    </div>
  );
}

/** "Sábado 7 de noviembre", en hora de Argentina (el servidor está en UTC). */
export function fechaDeHoy(): string {
  const texto = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  })
    .format(new Date())
    .replace(",", "");
  // Solo la primera letra en mayúscula.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
