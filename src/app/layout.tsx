import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { CartSheet } from "@/components/cart-sheet";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { Toaster } from "@/components/ui/sonner";
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
  title: {
    default: "TiendaPY — Comprá online en Paraguay",
    template: "%s · TiendaPY",
  },
  description:
    "Tienda online paraguaya. Precios en guaraníes, IVA incluido, envíos a todo el país y atención por WhatsApp.",
  openGraph: {
    type: "website",
    locale: "es_PY",
    siteName: "TiendaPY",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-PY"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <CartSheet />
        <WhatsAppFab />
        <Toaster />
      </body>
    </html>
  );
}
