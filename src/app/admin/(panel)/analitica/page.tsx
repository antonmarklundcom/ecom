import type { Metadata } from "next";
import Link from "next/link";

import {
  LIMITES_CONOCIDOS,
  RANGOS_DIAS,
  conversionPorPaginaDeEntrada,
  diasDelRango,
  embudo,
  paginasMasVistas,
  productosMasAgregados,
  tasa,
  type ConversionEntrada,
  type RangoAnalytics,
} from "@/domain/admin-analytics";
import { topProducts } from "@/domain/admin-dashboard";
import { requireCapabilityPage } from "@/lib/admin-guard";
import { formatGs } from "@/lib/money";
import { formatDatePY, startOfDayPY, startOfNextDayPY } from "@/lib/py";
import { t, type MessageKey } from "@/i18n";

export const metadata: Metadata = { title: t("panel.analitica.meta") };

// Números de hoy: nunca se cachea.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/admin/analitica` — owner-only.
 *
 * La analítica propia de la tienda: el embudo de la vidriera y qué páginas
 * traen gente que compra. Sin Google Analytics, sin píxel de Meta y sin un
 * solo dato saliendo de este servidor — el porqué, y qué se guarda y qué no,
 * están en `src/domain/analytics.ts`.
 *
 * ### Lo que esta pantalla intenta no hacer
 *
 * Mostrar números sin decir de dónde salen. Media analítica de e-commerce es
 * gente tomando decisiones con una tasa que no significa lo que parece, así
 * que acá:
 *
 * - el embudo dice que cuenta navegadores y no clics;
 * - la conversión se presenta como **un piso** y no como un promedio, porque
 *   el numerador (compras) lo escribe el servidor y el denominador (visitas)
 *   lo reporta el navegador;
 * - hay un número de control —los pedidos cobrados leídos directo de
 *   `orders`— justamente para que se vea cuánto se está perdiendo por cookies;
 * - los límites conocidos están en la pantalla, no en un README que nadie va
 *   a abrir.
 *
 * ### Por qué "lo más vendido" no sale de acá
 *
 * Porque ya se podía calcular sin una sola fila nueva: `topProducts()` lo
 * arma desde `order_items` y `orders`, es el mismo número del resumen, y no
 * depende de ninguna cookie. Se reusa tal cual. Lo que la analítica agrega al
 * lado es lo que **no** existía: qué se agrega al carrito y no se compra.
 */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapabilityPage("analitica");
  const query = await searchParams;

  const dias = diasDelRango(first(query.dias));
  const rango = rangoDeDias(dias);

  const [funnel, entradas, paginas, agregados, vendidos] = await Promise.all([
    embudo(rango),
    conversionPorPaginaDeEntrada(rango),
    paginasMasVistas(rango),
    productosMasAgregados(rango),
    topProducts(),
  ]);

  const conversionGeneral = tasa(funnel.compradores, funnel.visitantes);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t("panel.analitica.titulo")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("panel.analitica.bajada")}</p>

      <RangoSelector actual={dias} desde={rango.desde} />

      {/* --------------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="font-medium">{t("panel.analitica.embudo")}</h2>
        <p className="text-muted-foreground mt-1 text-xs">{t("panel.analitica.embudo.ayuda")}</p>

        <ol className="mt-3 grid gap-2">
          <Escalon
            label={t("panel.analitica.embudo.visitantes")}
            valor={funnel.visitantes}
            maximo={funnel.visitantes}
            anterior={null}
          />
          <Escalon
            label={t("panel.analitica.embudo.conCarrito")}
            valor={funnel.conCarrito}
            maximo={funnel.visitantes}
            anterior={funnel.visitantes}
          />
          <Escalon
            label={t("panel.analitica.embudo.conCheckout")}
            valor={funnel.conCheckout}
            maximo={funnel.visitantes}
            anterior={funnel.conCarrito}
          />
          <Escalon
            label={t("panel.analitica.embudo.compradores")}
            valor={funnel.compradores}
            maximo={funnel.visitantes}
            anterior={funnel.conCheckout}
          />
        </ol>

        <p className="text-muted-foreground mt-2 text-xs tabular-nums">
          {t("panel.analitica.visitas", { n: funnel.visitas })}
        </p>
      </section>

      {/* --------------------------------------------------------------- */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">{t("panel.analitica.conversion")}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {conversionGeneral === null
              ? t("panel.analitica.sinDato")
              : `${conversionGeneral} %`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("panel.analitica.conversion.ayuda")}
          </p>
        </div>

        {/*
          El número de control. Sale de `orders` sin pasar por la analítica, y
          está al lado de la conversión a propósito: es lo único que le permite
          al dueño calibrar cuánto creerle al resto de la pantalla.
        */}
        <div className="border-border rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">{t("panel.analitica.control")}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {t("panel.analitica.control.pedidos", { n: funnel.pedidosCobrados })}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{t("panel.analitica.control.ayuda")}</p>
        </div>
      </div>

      {/* --------------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="font-medium">{t("panel.analitica.entrada")}</h2>
        <p className="text-muted-foreground mt-1 text-xs">{t("panel.analitica.entrada.ayuda")}</p>

        {entradas.length === 0 ? (
          <Vacio />
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-border border-b">
                  <th className="py-2 font-normal">{t("panel.analitica.entrada.col.pagina")}</th>
                  <th className="py-2 text-right font-normal">
                    {t("panel.analitica.entrada.col.visitantes")}
                  </th>
                  <th className="py-2 text-right font-normal">
                    {t("panel.analitica.entrada.col.compradores")}
                  </th>
                  <th className="py-2 text-right font-normal">
                    {t("panel.analitica.entrada.col.tasa")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {entradas.map((fila) => (
                  <FilaEntrada key={fila.path ?? "sin-pagina"} fila={fila} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entradas.some((fila) => fila.path === null) ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("panel.analitica.entrada.sinPagina.ayuda")}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="font-medium">{t("panel.analitica.paginas")}</h2>
        {paginas.length === 0 ? (
          <Vacio />
        ) : (
          <ul className="divide-border mt-2 divide-y text-sm">
            {paginas.map((pagina) => (
              <li key={pagina.path} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{pagina.path}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {t("panel.analitica.paginas.visitas", {
                    visitas: pagina.visitas,
                    visitantes: pagina.visitantes,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------------- */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-medium">{t("panel.analitica.agregados")}</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("panel.analitica.agregados.ayuda")}
          </p>
          {agregados.length === 0 ? (
            <Vacio />
          ) : (
            <ol className="divide-border mt-2 divide-y text-sm">
              {agregados.map((producto) => (
                <li key={producto.productId} className="flex items-baseline gap-3 py-2">
                  <Link
                    href={`/admin/productos/${producto.productId}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {producto.name}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {t("panel.analitica.agregados.veces", { n: producto.agregados })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="font-medium">{t("panel.analitica.vendido")}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{t("panel.analitica.vendido.ayuda")}</p>
          {vendidos.length === 0 ? (
            <Vacio />
          ) : (
            <ol className="divide-border mt-2 divide-y text-sm">
              {vendidos.map((producto) => (
                <li key={producto.productId} className="flex items-baseline gap-3 py-2">
                  <Link
                    href={`/admin/productos/${producto.productId}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {producto.name}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {t("panel.analitica.vendido.unidades", { n: producto.qty })}
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums">
                    {formatGs(producto.totalPyg)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* --------------------------------------------------------------- */}
      <section className="border-border bg-muted/40 mt-10 rounded-xl border p-4">
        <h2 className="font-medium">{t("panel.analitica.limites")}</h2>
        <ul className="text-muted-foreground mt-2 grid gap-1.5 text-xs">
          {LIMITES_CONOCIDOS.map((clave) => (
            <li key={clave}>{t(clave as MessageKey)}</li>
          ))}
        </ul>

        <h2 className="mt-4 font-medium">{t("panel.analitica.privacidad")}</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("panel.analitica.privacidad.ayuda")}
        </p>
      </section>
    </div>
  );
}

/**
 * El rango, en instantes UTC, a partir de un número de días.
 *
 * Los cortes son medianoche **de Asunción** (`startOfDayPY`), igual que el
 * resumen y `/admin/actividad`: con cortes UTC "los últimos 7 días" empezaría
 * a las 20:00 y ningún número coincidiría con lo que el dueño ve en su lista
 * de pedidos.
 *
 * Se camina hacia atrás restando 12 h y volviendo a `startOfDayPY`, el mismo
 * truco que `salesTrend()`, que es a prueba de un eventual cambio de offset.
 */
function rangoDeDias(dias: number, ahora: Date = new Date()): RangoAnalytics {
  let desde = startOfDayPY(ahora);
  for (let i = 1; i < dias; i += 1) {
    desde = startOfDayPY(new Date(desde.getTime() - 12 * 3600_000));
  }
  return { desde, hasta: startOfNextDayPY(ahora) };
}

function RangoSelector({ actual, desde }: { actual: number; desde: Date }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground text-xs">{t("panel.analitica.rango")}</span>
      {RANGOS_DIAS.map((dias) => (
        <Link
          key={dias}
          href={`/admin/analitica?dias=${dias}`}
          aria-current={dias === actual ? "page" : undefined}
          className={`border-border rounded-lg border px-3 py-1.5 ${
            dias === actual ? "bg-muted font-medium" : "hover:bg-muted/50"
          }`}
        >
          {t("panel.analitica.rango.dias", { n: dias })}
        </Link>
      ))}
      <span className="text-muted-foreground text-xs">
        {t("panel.analitica.rango.desde", { fecha: formatDatePY(desde) })}
      </span>
    </div>
  );
}

/**
 * Un escalón del embudo.
 *
 * La barra se dibuja siempre contra el **primer** escalón y no contra el
 * anterior: así el ancho es comparable entre filas y se ve de un vistazo dónde
 * está la caída grande. El porcentaje al lado sí es contra el anterior, que es
 * la pregunta operativa ("¿cuántos de los que llegaron acá siguieron?").
 *
 * Barras de CSS y no una librería de gráficos, por lo mismo que
 * `SalesTrend` en el resumen: son cuatro números.
 */
function Escalon({
  label,
  valor,
  maximo,
  anterior,
}: {
  label: string;
  valor: number;
  maximo: number;
  anterior: number | null;
}) {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  const pct = anterior === null ? null : tasa(valor, anterior);

  return (
    <li className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm">{label}</span>
        <span className="font-semibold tabular-nums">{valor}</span>
      </div>
      <span className="bg-muted mt-2 block h-2 overflow-hidden rounded-full">
        <span
          className="bg-primary block h-full rounded-full"
          // El único estilo que no puede vivir en una clase de Tailwind: sale
          // de una consulta, no de la hoja de estilos.
          style={{ width: `${Math.min(100, ancho)}%` }}
        />
      </span>
      {pct !== null ? (
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          {t("panel.analitica.delAnterior", { pct })}
        </p>
      ) : null}
    </li>
  );
}

function FilaEntrada({ fila }: { fila: ConversionEntrada }) {
  return (
    <tr>
      <td className="py-2">
        {fila.path === null ? (
          <span className="text-muted-foreground italic">
            {t("panel.analitica.entrada.sinPagina")}
          </span>
        ) : (
          <span className="font-mono text-xs">{fila.path}</span>
        )}
      </td>
      <td className="py-2 text-right tabular-nums">
        {fila.visitantes === 0 ? t("panel.analitica.sinDato") : fila.visitantes}
      </td>
      <td className="py-2 text-right tabular-nums">{fila.compradores}</td>
      <td className="py-2 text-right font-medium tabular-nums">
        {fila.tasaPct === null ? t("panel.analitica.sinDato") : `${fila.tasaPct} %`}
      </td>
    </tr>
  );
}

function Vacio() {
  return (
    <p className="text-muted-foreground border-border mt-2 rounded-xl border border-dashed p-6 text-center text-sm">
      {t("panel.analitica.sinDatos")}
    </p>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}
