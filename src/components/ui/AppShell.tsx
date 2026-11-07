import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/**
 * El "marco" de todas las pantallas internas: menú + área de contenido, con
 * los márgenes del Figma (40px en compu, 16px en celular).
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
    // pb-32 en celular: deja lugar para la barra de menú fija de abajo.
    <div className="flex min-h-screen flex-col p-4 pb-32 md:flex-row md:gap-10 md:p-10">
      {/* Link invisible que aparece al usar Tab: permite saltar el menú e ir
          directo al contenido (ayuda a quien navega con teclado). */}
      <a
        href="#contenido"
        className="sr-only rounded-control bg-ink px-4 py-2 text-sm font-bold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
      >
        Saltar al contenido
      </a>

      {/* En compu el menú queda quieto mientras scrolleás la página. */}
      <div className="md:sticky md:top-10 md:h-[calc(100vh-80px)]">
        <Sidebar />
      </div>

      {/* tabIndex={-1}: permite que "Saltar al contenido" mueva el foco del
          teclado hasta acá (sin esto, el foco se queda arriba en el menú). */}
      <main id="contenido" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-5 outline-none">
        {children}
      </main>
    </div>
  );
}
