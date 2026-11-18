import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GuiaLista } from "@/components/guia-lista";
import { t } from "@/i18n";
import { guiasPublicadas } from "@/lib/guias";
import { nombreTienda } from "@/lib/marca";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * `/guias` — el índice de las guías publicadas (O34, docs/GUIAS.md).
 *
 * Estática: las guías son archivos del repo y sólo cambian con un deploy. Sin
 * ninguna publicada es un 404 de verdad (el template no trae guías).
 */
export const dynamic = "force-static";
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  if (guiasPublicadas().length === 0) return {};
  const origin = siteOrigin();
  return {
    title: t("guias.titulo"),
    description: t("guias.metaDescripcion", { tienda: await nombreTienda() }),
    ...(origin
      ? { alternates: { canonical: new URL("/guias", origin).toString() } }
      : {}),
  };
}

export default function GuiasPage() {
  const guias = guiasPublicadas();
  if (guias.length === 0) notFound();

  const breadcrumb = breadcrumbJsonLd(siteOrigin(), [
    { name: t("nav.inicio"), path: "/" },
    { name: t("guias.titulo"), path: "/guias" },
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          {t("nav.inicio")}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">{t("guias.titulo")}</span>
      </nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {t("guias.titulo")}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t("guias.intro")}</p>
      <div className="mt-6">
        <GuiaLista guias={guias} />
      </div>
    </main>
  );
}
