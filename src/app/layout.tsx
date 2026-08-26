import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { TIENDA } from "@/config/tienda";
import { Analytics } from "@/components/analytics";
import { CartSheet } from "@/components/cart-sheet";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { Toaster } from "@/components/ui/sonner";
import { idiomaActivo } from "@/i18n";
import { siteOrigin } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Sin esto, la URL de la imagen de Open Graph sale relativa y ningún
  // scraper la resuelve: el link compartido queda sin foto (ver lib/site-url).
  metadataBase: siteOrigin() ?? undefined,
  title: {
    default: TIENDA.titulo,
    template: `%s · ${TIENDA.nombre}`,
  },
  description: TIENDA.descripcion,
  openGraph: {
    type: "website",
    locale: TIENDA.ogLocale,
    siteName: TIENDA.nombre,
  },
  // La imagen sale de `opengraph-image.tsx` (o de la del producto, que la
  // pisa); acá sólo se pide que se muestre grande y no como miniatura.
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // El idioma **efectivo** y no el que dice el config: si `TIENDA.lang` apunta
  // a un catálogo que no existe, los textos salen en es-PY y el `lang` del
  // HTML tiene que decir es-PY. Un lector de pantalla leyendo español con
  // fonética inglesa es peor que no declarar nada.
  return (
    <html
      lang={idiomaActivo()}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <CartSheet />
        <WhatsAppFab />
        <Toaster />
        {/* Nada de terceros salvo que esta tienda configure medidores —
            src/lib/analytics.ts. Sin variables, esto no renderiza nada. */}
        <Analytics />
      </body>
    </html>
  );
}
