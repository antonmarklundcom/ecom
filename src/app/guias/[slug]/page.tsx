import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OG_IMAGE_SIZE } from "@/lib/images";
import { GuiaCuerpo } from "@/components/guia-cuerpo";
import { ProductCard } from "@/components/product-card";
import { TIENDA } from "@/config/tienda";
import { getCategories, getProductsBySlugs, type CatalogProduct } from "@/db/queries";
import { t } from "@/i18n";
import { fechaDeGuia, guiaPorSlug, slugsDeGuias } from "@/lib/guias";
import { waLinkPublico } from "@/lib/comercio";
import { atributosConsulta } from "@/lib/consulta-click";
import { log } from "@/lib/log";
import { marcaEfectiva } from "@/lib/marca";
import { propsDeModoVenta } from "@/domain/modo-venta";
import { modoVentaEfectivo } from "@/lib/modo-venta";
import { formatDatePY } from "@/lib/py";
import { safeError } from "@/lib/safe-error";
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * `/guias/<slug>` — una guía (O34, docs/GUIAS.md).
 *
 * Estática: se construye una página por archivo de `src/content/guias/`
 * (`generateStaticParams`) y ningún otro slug existe (`dynamicParams =
 * false`). Un borrador sólo se construye fuera de producción. El ISR de cinco
 * minutos es por los links al catálogo: un producto despublicado sale de la
 * guía sin esperar al próximo deploy.
 */
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return slugsDeGuias().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const guia = guiaPorSlug((await params).slug);
  if (!guia) return {};
  const origin = siteOrigin();
  const marca = await marcaEfectiva();
  return {
    title: guia.titulo,
    description: guia.descripcion,
    ...(guia.borrador ? { robots: { index: false, follow: false } } : {}),
    ...(origin
      ? {
          alternates: {
            canonical: new URL(`/guias/${guia.slug}`, origin).toString(),
          },
        }
      : {}),
    // Reemplaza el `openGraph` del layout (no se fusiona): ver la ficha.
    openGraph: {
      title: guia.titulo,
      description: guia.descripcion,
      type: "article",
      publishedTime: guia.publicada,
      modifiedTime: guia.actualizada,
      siteName: marca.nombre,
      locale: TIENDA.ogLocale,
      images: [
        guia.imagen
          ? { url: guia.imagen, alt: guia.titulo }
          : {
              url: "/opengraph-image",
              width: OG_IMAGE_SIZE.width,
              height: OG_IMAGE_SIZE.height,
              alt: guia.titulo,
            },
      ],
    },
  };
}

export default async function GuiaPage({ params }: { params: Params }) {
  const guia = guiaPorSlug((await params).slug);
  if (!guia) notFound();

  // Los links al catálogo: lo que no existe (o no está publicado) se saltea.
  // Sin base, la guía sale igual, sin links: el texto no depende de ella.
  let categorias: { slug: string; name: string }[] = [];
  let productos: CatalogProduct[] = [];
  try {
    const [todas, encontrados] = await Promise.all([
      guia.categorias.length > 0 ? getCategories() : Promise.resolve([]),
      getProductsBySlugs(guia.productos),
    ]);
    const porSlug = new Map(todas.map((categoria) => [categoria.slug, categoria]));
    categorias = guia.categorias.flatMap((slug) => {
      const categoria = porSlug.get(slug);
      return categoria ? [{ slug, name: categoria.name }] : [];
    });
    productos = encontrados;
    const faltan = [
      ...guia.categorias.filter((slug) => !porSlug.has(slug)),
      ...guia.productos.filter(
        (slug) => !encontrados.some((producto) => producto.slug === slug)
      ),
    ];
    if (faltan.length > 0) {
      log.warn("guias: slugs que el catálogo no tiene, se saltean", {
        guia: guia.slug,
        slugs: faltan.join(", "),
      });
    }
  } catch (cause) {
    log.error("guias: catálogo no disponible", {
      guia: guia.slug,
      error: safeError(cause).message,
    });
  }

  const origin = siteOrigin();
  // El modo de venta (O32): en "consulta" las tarjetas no ofrecen carrito.
  // Un cambio en el panel tira toda la caché (`revalidarVidriera`).
  // La consulta por WhatsApp de la guía cuenta con origen "guia" (O33). Sin
  // WhatsApp público, no hay link.
  const [marca, modoVenta, waHref] = await Promise.all([
    marcaEfectiva(),
    modoVentaEfectivo(),
    waLinkPublico(t("guias.consultaWhatsApp", { titulo: guia.titulo })),
  ]);
  const jsonLd = [
    articleJsonLd({
      origin,
      guia,
      tienda: { nombre: marca.nombre, logoUrl: marca.logoUrl },
    }),
    breadcrumbJsonLd(origin, [
      { name: t("nav.inicio"), path: "/" },
      { name: t("guias.titulo"), path: "/guias" },
      { name: guia.titulo, path: `/guias/${guia.slug}` },
    ]),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="text-muted-foreground text-sm">
        <Link href="/" className="hover:text-foreground">
          {t("nav.inicio")}
        </Link>
        <span aria-hidden> / </span>
        <Link href="/guias" className="hover:text-foreground">
          {t("guias.titulo")}
        </Link>
      </nav>

      <article className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{guia.titulo}</h1>
        <p className="text-muted-foreground mt-2 text-xs">
          <time dateTime={guia.actualizada}>
            {t("guias.actualizada", {
              fecha: formatDatePY(fechaDeGuia(guia.actualizada)),
            })}
          </time>
        </p>
        {guia.borrador ? (
          <p className="border-border mt-3 rounded border p-2 text-sm">
            {t("guias.borrador")}
          </p>
        ) : null}

        <GuiaCuerpo markdown={guia.cuerpo} className="mt-6 text-base" />

        {guia.faq.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t("guias.preguntas")}</h2>
            {guia.faq.map((par) => (
              <details key={par.pregunta} className="border-border mt-2 rounded border p-3">
                <summary className="font-medium">{par.pregunta}</summary>
                <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
                  {par.respuesta}
                </p>
              </details>
            ))}
          </section>
        ) : null}
      </article>

      {categorias.length > 0 ? (
        <nav aria-label={t("guias.categorias")} className="mt-10">
          <h2 className="text-lg font-semibold">{t("guias.categorias")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categorias.map((categoria) => (
              <li key={categoria.slug}>
                <Link
                  href={`/categoria/${categoria.slug}`}
                  className="border-border hover:border-foreground/30 inline-block rounded-full border px-3 py-1 text-sm"
                >
                  {categoria.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {productos.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("guias.productos")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {productos.map((producto) => (
              <ProductCard key={producto.id} product={producto} {...propsDeModoVenta(modoVenta)} />
            ))}
          </div>
        </section>
      ) : null}

      {waHref ? (
        <p className="mt-10">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            data-guia-whatsapp=""
            {...atributosConsulta("guia")}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            {t("guias.dudaWhatsApp")}
          </a>
        </p>
      ) : null}

      {guia.fuentes.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("guias.fuentes")}</h2>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {guia.fuentes.map((fuente) => (
              <li key={fuente.url}>
                <a
                  href={fuente.url}
                  rel="nofollow noopener"
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  {fuente.titulo}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
