import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { TIENDA } from "@/config/tienda";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Analytics } from "@/components/analytics";
import { CartSheet } from "@/components/cart-sheet";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontShell } from "@/components/storefront-shell";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { Toaster } from "@/components/ui/sonner";
import { getStoreSettings } from "@/domain/store-settings";
import { linkSeguro } from "@/domain/store-settings-schema";
import { idiomaActivo } from "@/i18n";
import { contactoPublico } from "@/lib/comercio";
import { jsonLdScript, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
import "./globals.css";
import { META_BASE_IMAGENES, basePublicaImagenes } from "@/lib/images";
import { cargarIntegraciones } from "@/lib/integraciones-store";
import { marcaEfectiva } from "@/lib/marca";
import { temaActivo } from "@/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * `generateMetadata` y no un `metadata` fijo: el título y la descripción de la
 * home se editan en `/admin/ajustes` ("Marca y portada"). Vacíos, mandan
 * `TIENDA.titulo` y `TIENDA.descripcion`, como siempre.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [{ marca }, identidad] = await Promise.all([
    getStoreSettings(),
    marcaEfectiva(),
  ]);

  return {
    // Sin esto, la URL de la imagen de Open Graph sale relativa y ningún
    // scraper la resuelve: el link compartido queda sin foto (ver lib/site-url).
    metadataBase: siteOrigin() ?? undefined,
    title: {
      default: marca.seoTitulo ?? TIENDA.titulo,
      template: `%s · ${identidad.nombre}`,
    },
    description: marca.seoDescripcion ?? TIENDA.descripcion,
    openGraph: {
      type: "website",
      locale: TIENDA.ogLocale,
      siteName: identidad.nombre,
    },
    // El favicon subido en /admin/ajustes → Identidad. Sin él, queda
    // `src/app/favicon.ico` (el de la tienda o el del template).
    ...(identidad.faviconUrl
      ? { icons: { icon: identidad.faviconUrl, apple: identidad.faviconUrl } }
      : {}),
    // La imagen sale de `opengraph-image.tsx` (o de la del producto, que la
    // pisa); acá sólo se pide que se muestre grande y no como miniatura.
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // La foto de integraciones (GA4/Pixel, WhatsApp, R2) fresca para este
  // render: src/lib/integraciones.ts. Nunca tira.
  const [{ anuncio }, marca, contacto] = await Promise.all([
    getStoreSettings(),
    marcaEfectiva(),
    contactoPublico(),
    cargarIntegraciones(),
  ]);

  const baseImagenes = basePublicaImagenes();

  // Quién es la tienda y dónde está su buscador, para Google, en todas las
  // páginas de la vidriera. Nombre y logo de `/admin/ajustes` → Identidad
  // (`marcaEfectiva`), contacto y redes de los ajustes. Sin dominio
  // configurado no sale ninguno de los dos (ver `src/lib/seo.ts`).
  const origin = siteOrigin();
  const datosDeLaTienda = [
    organizationJsonLd({
      origin,
      name: marca.nombre,
      logo: marca.logoUrl,
      telephone: contacto.whatsapp,
      email: contacto.email,
      sameAs: contacto.redes.map((red) => red.url),
    }),
    websiteJsonLd({ origin, name: marca.nombre }),
  ].filter((dato) => dato !== null);

  // El idioma **efectivo** y no el que dice el config: si `TIENDA.lang` apunta
  // a un catálogo que no existe, los textos salen en es-PY y el `lang` del
  // HTML tiene que decir es-PY. Un lector de pantalla leyendo español con
  // fonética inglesa es peor que no declarar nada.
  return (
    <html
      lang={idiomaActivo()}
      // El tema de `src/config/tienda.ts` (`src/themes/`): elige cuál de los
      // bloques de `src/themes/temas.css` vale. Sin este atributo se ve el
      // tema base, que es la tienda de antes del kit.
      data-tema={temaActivo().id}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // El color de marca de /admin/ajustes → Identidad pisa `--primary` del
      // tema (ya validado como #RRGGBB, con el texto encima por contraste).
      style={
        (marca.variablesColor ?? undefined) as React.CSSProperties | undefined
      }
    >
      <body className="flex min-h-full flex-col">
        {/* La base pública de las fotos (R2) para los componentes cliente:
            `basePublicaImagenes()` la lee de acá en el navegador, con el
            mismo valor que usó el servidor (React la sube al <head>). */}
        {baseImagenes ? (
          <meta name={META_BASE_IMAGENES} content={baseImagenes} />
        ) : null}
        <StorefrontShell
          storefrontBefore={
            <>
              {datosDeLaTienda.map((dato) => (
                <script
                  key={String(dato["@type"])}
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{ __html: jsonLdScript(dato) }}
                />
              ))}
              {anuncio.activo && anuncio.texto ? (
                <AnnouncementBar
                  texto={anuncio.texto}
                  href={linkSeguro(anuncio.href)}
                />
              ) : null}
              <SiteHeader />
            </>
          }
          storefrontAfter={
            <>
              <SiteFooter />
              <CartSheet />
              <WhatsAppFab />
              <Analytics />
            </>
          }
        >
          {children}
        </StorefrontShell>
        <Toaster />
      </body>
    </html>
  );
}
