import type { MetadataRoute } from "next";

import { getSitemapEntries } from "@/db/queries";
import { contactoPublico } from "@/lib/comercio";
import { productImageUrl } from "@/lib/images";
import { paginasActivas } from "@/lib/paginas";
import { buildSitemap, contactoTieneDatos } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * `/sitemap.xml` — la home, las categorías activas, los productos publicados
 * (con hasta cinco fotos cada uno), las páginas de políticas prendidas y
 * `/contacto` si existe.
 *
 * Mismo revalidate que el catálogo: el sitemap no tiene por qué ser más fresco
 * que las páginas que lista.
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  // Sin origen público no hay URL absoluta que publicar, y el sitemap las
  // exige. Vacío es honesto; un dominio adivinado le enseña al buscador
  // páginas que no existen.
  if (!origin) return [];

  // Las páginas de políticas prendidas desde `/admin/ajustes`. Sin base,
  // `getStoreSettings` devuelve los defaults (todas prendidas), que es lo que
  // la tienda sirve en ese momento.
  const pages = (await paginasActivas()).map((pagina) => pagina.slug);
  // O35: `/contacto` sólo si la tienda cargó algún dato (si no, es 404).
  const contacto = contactoTieneDatos(await contactoPublico());

  try {
    const { categories, products } = await getSitemapEntries();
    return buildSitemap(origin, {
      categories,
      products: products.map((product) => ({
        slug: product.slug,
        updatedAt: product.updatedAt,
        images: product.images
          .map((image) => productImageUrl(image.imageRef, "detail"))
          .filter((src): src is string => src !== null),
      })),
      pages,
      contacto,
    });
  } catch {
    // La base caída no puede tumbar el sitio: al menos la home se publica, y
    // el crawler vuelve en el próximo revalidate.
    return buildSitemap(origin, {
      categories: [],
      products: [],
      pages,
      contacto,
    });
  }
}
