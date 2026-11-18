import Link from "next/link";

import { t } from "@/i18n";
import type { Guia } from "@/lib/guias";
import { fechaDeGuia } from "@/lib/guias";
import { formatDatePY } from "@/lib/py";

/**
 * Tarjetas de guías: el índice `/guias` y el bloque "Guías" de la home.
 * Piel: cada tienda la redibuja como quiera; el contrato es el `href`.
 */
export function GuiaLista({
  guias,
  encabezado = "h2",
}: {
  guias: readonly Guia[];
  /** El nivel del título de cada tarjeta (`h2` en el índice, `h3` en la home). */
  encabezado?: "h2" | "h3";
}) {
  const Titulo = encabezado;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guias.map((guia) => (
        <li key={guia.slug}>
          <Link
            href={`/guias/${guia.slug}`}
            data-guia={guia.slug}
            className="border-border hover:border-foreground/30 block h-full rounded-xl border p-4 transition-colors"
          >
            <Titulo className="font-medium">{guia.titulo}</Titulo>
            <p className="text-muted-foreground mt-2 text-sm">
              {guia.descripcion}
            </p>
            <p className="text-muted-foreground mt-3 text-xs">
              {t("guias.actualizada", {
                fecha: formatDatePY(fechaDeGuia(guia.actualizada)),
              })}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
