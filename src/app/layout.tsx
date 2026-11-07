import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

// Estilos globales: colores, bordes y sombras del diseño (ver globals.css).
import "./globals.css";

// Fuente de la app: grotesca sobria, clara en tamaños chicos y en números.
// Next la descarga al compilar y la sirve desde nuestro propio servidor
// (no depende de Google en cada visita).
// "variable" la guarda en --font-hanken, que globals.css usa como fuente base.
const hanken = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tratunex",
  description: "Agente de compras para pymes: cotiza con proveedores, compara y paga en ARGt.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={hanken.variable}>
      {/* antialiased: suaviza los bordes de las letras en pantallas de Mac. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
