import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";

/**
 * Marco de /purchases/new: el menú lateral + el área de contenido con los
 * márgenes del diseño (igual que las pantallas del Agente).
 */
export default function NewPurchaseLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
