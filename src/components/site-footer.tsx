import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { getCategories } from "@/db/queries";
import { getStoreSettings } from "@/domain/store-settings";
import { t } from "@/i18n";
import { contactoPublico } from "@/lib/comercio";
import { paginasActivas } from "@/lib/paginas";
import { formatPhonePY } from "@/lib/py";

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
  const [ajustes, contacto, paginas] = await Promise.all([
    getStoreSettings(),
    contactoPublico(),
    paginasActivas(),
  ]);
  const tagline = ajustes.marca.tagline ?? TIENDA.tagline;

  return (
    <footer className="border-border mt-16 border-t">
      <div className="text-muted-foreground mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-foreground font-semibold">{TIENDA.nombre}</p>
          <p className="mt-2">{tagline}</p>
          {contacto.redes.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-3" aria-label={t("footer.redes")}>
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
          <p className="text-foreground font-medium">{t("footer.categorias")}</p>
          <ul className="mt-2 space-y-1">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/categoria/${category.slug}`} className="hover:text-foreground">
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
              <li>{t("footer.whatsapp", { telefono: formatPhonePY(contacto.whatsapp) })}</li>
            ) : null}
            {contacto.email ? (
              <li>
                <a href={`mailto:${contacto.email}`} className="hover:text-foreground">
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
                  <Link href={`/${pagina.slug}`} className="hover:text-foreground">
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
