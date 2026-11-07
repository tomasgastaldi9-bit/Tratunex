import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonStyles } from "./Button";
import { MobileNav, Sidebar } from "./Sidebar";

/**
 * El "marco" de todas las pantallas internas: menú lateral oscuro + barra de
 * arriba + área de contenido sobre fondo gris claro.
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
    <div className="min-h-screen md:flex">
      {/* Link invisible que aparece al usar Tab: permite saltar el menú e ir
          directo al contenido (ayuda a quien navega con teclado). */}
      <a
        href="#contenido"
        className="sr-only rounded-control bg-ink px-4 py-2 text-sm font-bold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        Saltar al contenido
      </a>

      {/* En compu el menú ocupa todo el alto y queda quieto al scrollear. */}
      <aside className="hidden shrink-0 md:sticky md:top-0 md:block md:h-screen md:w-[264px]">
        <Sidebar />
      </aside>
      <MobileNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* tabIndex={-1}: permite que "Saltar al contenido" mueva el foco del
            teclado hasta acá. pb-32 en celular: lugar para la barra de abajo. */}
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-[1240px] min-w-0 flex-1 flex-col gap-6 px-4 pt-6 pb-32 outline-none md:px-8 md:pt-8 md:pb-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** Barra blanca de arriba: la fecha de hoy y el atajo a "Nueva compra". */
function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-3.5 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {/* En el celular no hay menú lateral: la marca va acá. */}
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex size-9 items-center justify-center rounded-[11px] bg-ink text-base font-bold text-white">
              t
            </span>
            <span className="text-lg font-semibold tracking-tight">Tratunex</span>
          </Link>
          <p className="hidden items-center gap-2 text-sm text-ink-muted md:flex">
            <CalendarDays size={16} aria-hidden />
            <span>{fechaDeHoy()}</span>
          </p>
        </div>
        <Link href="/purchases/new" className={buttonStyles({ size: "md" })}>
          <Plus size={16} aria-hidden />
          Nueva compra
        </Link>
      </div>
    </header>
  );
}

/** "Sábado, 7 de noviembre", en hora de Argentina (el servidor está en UTC). */
export function fechaDeHoy(): string {
  const texto = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  // Solo la primera letra en mayúscula ("Sábado, 7 de noviembre").
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
