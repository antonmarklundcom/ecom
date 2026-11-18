import type { Metadata } from "next";
import Link from "next/link";

import { resumenConsultas, type ResumenConsultas } from "@/domain/consultas";
import { requireCapabilityPage } from "@/lib/admin-guard";
import type { EnquiryOrigin } from "@/lib/consulta-click";
import { t, type MessageKey } from "@/i18n";

export const metadata: Metadata = { title: t("panel.consultas.meta") };

// Conteos del día: no se cachea.
export const dynamic = "force-dynamic";

const ORIGEN: Record<EnquiryOrigin, MessageKey> = {
  producto: "panel.consultas.origen.producto",
  tarjeta: "panel.consultas.origen.tarjeta",
  flotante: "panel.consultas.origen.flotante",
  guia: "panel.consultas.origen.guia",
  contacto: "panel.consultas.origen.contacto",
};

/**
 * `/admin/consultas` (O33, `fable/plan-trafico.md` §2.2): qué productos
 * generan consultas por WhatsApp y qué busca la gente en la tienda.
 *
 * **Sólo lee.** Detrás del mismo permiso que el resumen (`dashboard`). No hay
 * vistas de producto: eso lo tiene GA4. Y no hay nada de nadie: son
 * cantidades por día (`src/domain/consultas.ts`).
 */
export default async function AdminConsultasPage() {
  await requireCapabilityPage("dashboard");
  const resumen = await resumenConsultas();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("panel.consultas.titulo")}</h1>
        {/* Un GET con sesión, no un link público: la ruta relee el permiso. */}
        <a
          href="/admin/consultas/csv"
          className="text-sm underline"
          download
        >
          {t("panel.consultas.csv")}
        </a>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{t("panel.consultas.bajada")}</p>

      <section className="mt-6">
        <h2 className="text-base font-medium">{t("panel.consultas.productos")}</h2>
        <TablaProductos resumen={resumen} />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium">{t("panel.consultas.origenes")}</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {resumen.porOrigen.map((fila) => (
            <li
              key={fila.origin}
              className="border-border flex justify-between rounded-lg border px-3 py-2"
            >
              <span>{t(ORIGEN[fila.origin])}</span>
              <span className="tabular-nums">{fila.total}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-base font-medium">{t("panel.consultas.terminos")}</h2>
          <ListaTerminos filas={resumen.terminos} vacio={t("panel.consultas.terminos.vacio")} />
        </section>
        <section>
          <h2 className="text-base font-medium">{t("panel.consultas.sinResultado")}</h2>
          <p className="text-muted-foreground text-xs">{t("panel.consultas.sinResultado.ayuda")}</p>
          <ListaTerminos
            filas={resumen.sinResultado}
            vacio={t("panel.consultas.sinResultado.vacio")}
          />
        </section>
      </div>
    </div>
  );
}

function TablaProductos({ resumen }: { resumen: ResumenConsultas }) {
  const sin = resumen.sinProducto;
  if (resumen.productos.length === 0 && sin.d90 === 0) {
    return (
      <p className="text-muted-foreground border-border mt-2 rounded-xl border border-dashed p-6 text-center text-sm">
        {t("panel.consultas.vacio")}
      </p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-2 pr-4 font-normal">{t("panel.consultas.col.producto")}</th>
            <th className="py-2 pr-4 text-right font-normal">{t("panel.consultas.col.d7")}</th>
            <th className="py-2 pr-4 text-right font-normal">{t("panel.consultas.col.d30")}</th>
            <th className="py-2 text-right font-normal">{t("panel.consultas.col.d90")}</th>
          </tr>
        </thead>
        <tbody>
          {resumen.productos.map((fila) => (
            <tr
              key={fila.productId}
              className="border-border border-t"
              data-consultas-producto={fila.slug ?? ""}
            >
              <td className="py-2 pr-4">
                {fila.nombre ? (
                  <Link href={`/admin/productos/${fila.productId}`} className="underline">
                    {fila.nombre}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t("panel.consultas.borrado")}</span>
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{fila.d7}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{fila.d30}</td>
              <td className="py-2 text-right tabular-nums" data-consultas-total="">
                {fila.d90}
              </td>
            </tr>
          ))}
          {sin.d90 > 0 ? (
            <tr className="border-border border-t">
              <td className="text-muted-foreground py-2 pr-4">{t("panel.consultas.sinProducto")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{sin.d7}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{sin.d30}</td>
              <td className="py-2 text-right tabular-nums">{sin.d90}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ListaTerminos({
  filas,
  vacio,
}: {
  filas: { term: string; total: number }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="text-muted-foreground mt-2 text-sm">{vacio}</p>;
  return (
    <ol className="mt-2 grid gap-1 text-sm">
      {filas.map((fila) => (
        <li key={fila.term} className="flex justify-between gap-4">
          <span className="truncate">{fila.term}</span>
          <span className="tabular-nums">{fila.total}</span>
        </li>
      ))}
    </ol>
  );
}
