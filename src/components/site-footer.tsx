import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { getCategories } from "@/db/queries";
import { getStoreSettings } from "@/domain/store-settings";
import { t } from "@/i18n/client";
import { contactoPublico } from "@/lib/comercio";
import { marcaEfectiva } from "@/lib/marca";
import { paginasActivas } from "@/lib/paginas";
import { formatPhonePY } from "@/lib/py";
import { temaActivo } from "@/themes";
import type { VarianteFooter } from "@/themes/tipos";

const NOMBRE_RED = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
} as const;

export async function SiteFooter() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    // idem SiteHeader: el pie no debería tirar la página abajo.
  }
  // Los tres de abajo no tiran: sin base, los ajustes son los de siempre.
  const [ajustes, contacto, paginas, marca] = await Promise.all([
    getStoreSettings(),
    contactoPublico(),
    paginasActivas(),
    marcaEfectiva(),
  ]);
  const tagline = ajustes.marca.tagline ?? TIENDA.tagline;

  return (
    <FooterVariante
      variante={temaActivo().footer}
      nombre={marca.nombre}
      tagline={tagline}
      categories={categories}
      contacto={contacto}
      paginas={paginas}
    />
  );
}

/**
 * La variante de pie que pide el tema (`src/themes/`). Las dos muestran lo
 * mismo —marca, redes, categorías, contacto, "seguir pedido" y las páginas—;
 * cambia sólo cómo se acomoda.
 */
export function FooterVariante({
  variante,
  ...datos
}: DatosFooter & { variante: VarianteFooter }) {
  return variante === "compacto" ? (
    <FooterCompacto {...datos} />
  ) : (
    <FooterColumnas {...datos} />
  );
}

/** El pie de siempre: cuatro columnas. */
function FooterColumnas({
  nombre,
  tagline,
  categories,
  contacto,
  paginas,
}: DatosFooter) {
  return (
    <footer
      data-site-footer=""
      className="s9-no-print border-border mt-16 border-t"
    >
      <div className="text-muted-foreground mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-foreground font-semibold">{nombre}</p>
          <p className="mt-2">{tagline}</p>
          {contacto.redes.length > 0 ? (
            <ul
              className="mt-3 flex flex-wrap gap-3"
              aria-label={t("footer.redes")}
            >
              {contacto.redes.map((red) => (
                <li key={red.red}>
                  <a
                    href={red.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {NOMBRE_RED[red.red]}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <p className="text-foreground font-medium">
            {t("footer.categorias")}
          </p>
          <ul className="mt-2 space-y-1">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categoria/${category.slug}`}
                  className="hover:text-foreground"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-foreground font-medium">{t("footer.contacto")}</p>
          <ul className="mt-2 space-y-1">
            {contacto.whatsapp ? (
              <li>
                {t("footer.whatsapp", {
                  telefono: formatPhonePY(contacto.whatsapp),
                })}
              </li>
            ) : null}
            {contacto.email ? (
              <li>
                <a
                  href={`mailto:${contacto.email}`}
                  className="hover:text-foreground"
                >
                  {contacto.email}
                </a>
              </li>
            ) : null}
            {contacto.direccion ? <li>{contacto.direccion}</li> : null}
            {contacto.horario ? <li>{contacto.horario}</li> : null}
            <li>
              <Link href="/pedido/buscar" className="hover:text-foreground">
                {t("footer.seguirPedido")}
              </Link>
            </li>
          </ul>
        </div>

        {paginas.length > 0 ? (
          <div>
            <p className="text-foreground font-medium">{t("footer.ayuda")}</p>
            <ul className="mt-2 space-y-1">
              {paginas.map((pagina) => (
                <li key={pagina.slug}>
                  <Link
                    href={`/${pagina.slug}`}
                    className="hover:text-foreground"
                  >
                    {pagina.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </footer>
  );
}

type DatosFooter = {
  nombre: string;
  tagline: string;
  categories: ReadonlyArray<{
    id: number | string;
    slug: string;
    name: string;
  }>;
  contacto: Awaited<ReturnType<typeof contactoPublico>>;
  paginas: ReadonlyArray<{ slug: string; titulo: string }>;
};

/**
 * El pie de `vitrina`: una franja centrada —marca y tagline arriba, los links
 * en una línea que se parte sola, el contacto abajo— en vez de cuatro
 * columnas. Mismo contenido que el de columnas.
 */
function FooterCompacto({
  nombre,
  tagline,
  categories,
  contacto,
  paginas,
}: DatosFooter) {
  const links = [
    ...categories.map((category) => ({
      href: `/categoria/${category.slug}`,
      label: category.name,
    })),
    ...paginas.map((pagina) => ({
      href: `/${pagina.slug}`,
      label: pagina.titulo,
    })),
    { href: "/pedido/buscar", label: t("footer.seguirPedido") },
  ];
  const datosDeContacto = [
    contacto.whatsapp
      ? t("footer.whatsapp", { telefono: formatPhonePY(contacto.whatsapp) })
      : null,
    contacto.direccion,
    contacto.horario,
  ].filter((dato): dato is string => Boolean(dato));

  return (
    <footer
      data-site-footer=""
      className="s9-no-print border-border mt-16 border-t"
    >
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-10 text-center text-sm">
        <div>
          <p className="text-foreground text-lg font-semibold tracking-[0.2em] uppercase">
            {nombre}
          </p>
          <p className="mt-1">{tagline}</p>
        </div>

        <nav aria-label={t("footer.categorias")}>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {contacto.redes.length > 0 ? (
          <ul
            className="flex flex-wrap justify-center gap-4"
            aria-label={t("footer.redes")}
          >
            {contacto.redes.map((red) => (
              <li key={red.red}>
                <a
                  href={red.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline-offset-2 hover:underline"
                >
                  {NOMBRE_RED[red.red]}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {datosDeContacto.length > 0 || contacto.email ? (
          <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
            {datosDeContacto.map((dato) => (
              <span key={dato}>{dato}</span>
            ))}
            {contacto.email ? (
              <a
                href={`mailto:${contacto.email}`}
                className="hover:text-foreground"
              >
                {contacto.email}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
