import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

// Estilos globales: colores, bordes y sombras del diseño (ver globals.css).
import "./globals.css";

// Fuente de la app: Inter, la tipografía de la marca (kit de marca 1.0).
// Con el eje "opsz" (tamaño óptico), los títulos grandes usan solos la versión
// Display y el texto chico la de lectura, como pide el manual.
// Next la descarga al compilar y la sirve desde nuestro propio servidor
// (no depende de Google en cada visita).
// "variable" la guarda en --font-inter, que globals.css usa como fuente base.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tratunex",
  description: "Agente de compras para pymes: cotiza con proveedores, compara y paga en ARGt.",
};

// Color de la barra del navegador en el celular: tinta, como la marca.
export const viewport: Viewport = { themeColor: "#1A1A1A" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      {/* antialiased: suaviza los bordes de las letras en pantallas de Mac. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
