import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/ui/tokens.css";
import "@/components/ui/components.css";

export const metadata: Metadata = {
  title: "Tratunex",
  description: "Plataforma de prospección y seguimiento comercial.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
