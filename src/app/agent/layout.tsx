import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";

/**
 * Marco de todas las pantallas del Agente (/agent, /agent/profile y las que
 * vengan): el menú lateral + el área de contenido con los márgenes del diseño.
 * Al estar en el layout, cada página de /agent solo arma su contenido.
 */
export default function AgentLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
