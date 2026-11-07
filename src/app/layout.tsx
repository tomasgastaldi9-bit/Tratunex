import type { Metadata } from "next";
import { Kantumruy_Pro } from "next/font/google";
import type { ReactNode } from "react";

// Estilos globales: colores, bordes y sombras del diseño (ver globals.css).
import "./globals.css";

// Fuente del diseño de Figma. Next la descarga al compilar y la sirve desde
// nuestro propio servidor (no depende de Google en cada visita).
// "variable" la guarda en --font-kantumruy, que globals.css usa como fuente base.
const kantumruy = Kantumruy_Pro({
  subsets: ["latin", "latin-ext"],
  variable: "--font-kantumruy",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tratunex",
  description: "Plataforma de prospección y seguimiento comercial.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={kantumruy.variable}>
      {/* antialiased: suaviza los bordes de las letras en pantallas de Mac. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
