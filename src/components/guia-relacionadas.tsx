import Link from "next/link";

import { t } from "@/i18n";
import type { Guia } from "@/lib/guias";

/**
 * "Guías relacionadas" en una categoría o un producto: las guías publicadas
 * que los nombran (`guiasDeCategoria` / `guiasDeProducto`). Sin ninguna, no
 * se dibuja nada. Piel.
 */
export function GuiaRelacionadas({ guias }: { guias: readonly Guia[] }) {
  if (guias.length === 0) return null;
  return (
    <nav aria-label={t("guias.relacionadas")} className="mt-8" data-guias-relacionadas="">
      <h2 className="font-semibold">{t("guias.relacionadas")}</h2>
      <ul className="mt-2 space-y-1">
        {guias.map((guia) => (
          <li key={guia.slug}>
            <Link className="underline underline-offset-2" href={`/guias/${guia.slug}`}>
              {guia.titulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
