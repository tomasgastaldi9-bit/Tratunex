import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

// Estilos globales: colores, bordes y sombras del diseño (ver globals.css).
import "./globals.css";

// Fuente de la app: geométrica y redonda, se lee bien en números grandes.
// Next la descarga al compilar y la sirve desde nuestro propio servidor
// (no depende de Google en cada visita).
// "variable" la guarda en --font-outfit, que globals.css usa como fuente base.
const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tratunex",
  description: "Agente de compras para pymes: cotiza con proveedores, compara y paga en ARGt.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={outfit.variable}>
      {/* antialiased: suaviza los bordes de las letras en pantallas de Mac. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
