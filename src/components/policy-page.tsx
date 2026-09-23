import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDescription } from "@/components/product-description";
import { getStoreSettings } from "@/domain/store-settings";
import type { PaginaSlug } from "@/domain/store-settings-schema";
import { markdownToText } from "@/lib/markdown";
import { paginaEfectiva, valoresDePlaceholders } from "@/lib/paginas";
import { reemplazarPlaceholders } from "@/lib/placeholders";
import { siteOrigin } from "@/lib/site-url";

/**
 * Una página de políticas (`/envios`, `/devoluciones`,
 * `/preguntas-frecuentes`, `/terminos`, `/privacidad`).
 *
 * El texto lo edita el dueño en `/admin/ajustes`; sin editar, sale el de
 * `src/config/paginas-default.ts`. Apagada desde el panel, es un 404 de
 * verdad (y sale del pie y del sitemap).
 *
 * El markdown pasa por `ProductDescription` → `renderMarkdown`, el mismo
 * camino seguro de las descripciones de producto: el dueño escribe texto,
 * nunca HTML.
 *
 * Es piel: cada tienda puede rediseñar esta página sin tocar nada más.
 */
export async function PolicyPage({ slug }: { slug: PaginaSlug }) {
  const pagina = paginaEfectiva(await getStoreSettings(), slug);
  if (!pagina.activo) notFound();

  const valores = await valoresDePlaceholders();
  const cuerpo = reemplazarPlaceholders(pagina.cuerpo, valores);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{pagina.titulo}</h1>
      <ProductDescription markdown={cuerpo} className="mt-6 text-sm leading-relaxed" />
    </main>
  );
}

/** El `<title>`, la descripción y el canonical de una página de políticas. */
export async function policyMetadata(slug: PaginaSlug): Promise<Metadata> {
  const pagina = paginaEfectiva(await getStoreSettings(), slug);
  if (!pagina.activo) return {};

  const valores = await valoresDePlaceholders();
  const description = markdownToText(reemplazarPlaceholders(pagina.cuerpo, valores)).slice(0, 160);
  const origin = siteOrigin();

  return {
    title: pagina.titulo,
    description,
    ...(origin ? { alternates: { canonical: new URL(`/${slug}`, origin).toString() } } : {}),
  };
}
