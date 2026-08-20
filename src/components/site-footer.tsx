import Link from "next/link";

import { TIENDA } from "@/config/tienda";
import { getCategories } from "@/db/queries";
import { t } from "@/i18n";
import { comercioWhatsApp } from "@/lib/comercio";
import { formatPhonePY } from "@/lib/py";

export async function SiteFooter() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    // idem SiteHeader: el pie no debería tirar la página abajo.
  }
  const phone = comercioWhatsApp();

  return (
    <footer className="border-border mt-16 border-t">
      <div className="text-muted-foreground mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="text-foreground font-semibold">{TIENDA.nombre}</p>
          <p className="mt-2">{TIENDA.tagline}</p>
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
            {phone ? <li>{t("footer.whatsapp", { telefono: formatPhonePY(phone) })}</li> : null}
            <li>
              <Link href="/pedido/buscar" className="hover:text-foreground">
                {t("footer.seguirPedido")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
