import type { Metadata } from "next";
import Link from "next/link";

import { CsvDownloadButton } from "@/components/admin/csv-download";
import { cuentasClientesHabilitadas } from "@/config/tienda";
import { listCustomers } from "@/domain/admin-customers";
import { customersByPhone } from "@/domain/customers";
import { TEXTOS } from "@/i18n";
import { can } from "@/lib/permissions";
import { formatGs } from "@/lib/money";
import { formatDatePY, formatPhonePY } from "@/lib/py";
import { requireCapabilityPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: TEXTOS.panel.clientes.titulo };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

/**
 * Clientes (`/admin/clientes`) — sólo lectura.
 *
 * No hay cuentas de cliente: esto es la lista que sale de agrupar los pedidos
 * por WhatsApp (ver `domain/admin-customers.ts`). Cada fila lleva al listado
 * de pedidos ya filtrado por ese número, que es lo que el dueño quiere
 * después de mirar el total: "mostrame qué me compró".
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireCapabilityPage("clientes");

  const query = await searchParams;
  const search = first(query.q);
  const rawPage = Number(first(query.pagina) ?? 1);

  const result = await listCustomers({
    search,
    page: Number.isFinite(rawPage) ? rawPage : 1,
  });

  // Con las cuentas apagadas esto ni se consulta y la pantalla queda igual que
  // antes de la feature: "cliente" sigue siendo lo que siempre fue, una vista
  // sobre los pedidos agrupados por WhatsApp.
  const conCuenta = cuentasClientesHabilitadas()
    ? await customersByPhone(result.rows.map((row) => row.phone))
    : new Map();

  const href = (page: number): string => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (page > 1) params.set("pagina", String(page));
    const qs = params.toString();
    return qs === "" ? "/admin/clientes" : `/admin/clientes?${qs}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{TEXTOS.panel.clientes.titulo}</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {TEXTOS.panel.clientes.cuenta(result.total)}
        </p>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {TEXTOS.panel.clientes.ayuda}
      </p>

      {/* La lista de marketing que hasta ahora no existía: sólo las cuentas
          activas que dijeron que sí, y sólo para el dueño — es la base de
          clientes en un archivo que sale del edificio (ARCH.md §1). */}
      {cuentasClientesHabilitadas() && can(actor.role, "exports") ? (
        <div className="mt-4">
          <CsvDownloadButton
            kind="clientes-opt-in"
            params={{}}
            label={TEXTOS.panel.clientes.descargarNovedades}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {TEXTOS.panel.clientes.descargarNovedadesAyuda}
          </p>
        </div>
      ) : null}

      <form className="mt-4 flex gap-2" action="/admin/clientes">
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder={TEXTOS.panel.clientes.buscarPlaceholder}
          aria-label={TEXTOS.panel.clientes.buscarLabel}
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="border-border rounded-lg border px-4 text-sm">
          {TEXTOS.panel.clientes.buscar}
        </button>
      </form>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          {search ? TEXTOS.panel.clientes.sinCoincidencias : TEXTOS.panel.clientes.sinPedidos}
        </p>
      ) : (
        // Tarjetas y no tabla, igual que el listado de pedidos: el dueño abre
        // esto en el celular.
        <ul className="mt-4 grid gap-3">
          {result.rows.map((customer) => (
            <li key={customer.phone}>
              <Link
                href={`/admin/pedidos?q=${encodeURIComponent(customer.phone)}`}
                className="border-border hover:bg-muted/50 block rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium">{customer.name}</span>
                  <span className="font-semibold tabular-nums">
                    {formatGs(customer.lifetimePyg)}
                  </span>
                </div>

                <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                  {formatPhonePY(customer.phone)}
                  {customer.docNumber ? ` · ${customer.docNumber}` : ""}
                </p>

                {/* Quién tiene cuenta y quién aceptó novedades. Sin cuentas
                    prendidas, este bloque no existe. */}
                {conCuenta.has(customer.phone) ? (
                  <p className="mt-1 text-xs">
                    <span className="border-border rounded border px-1.5 py-0.5">{TEXTOS.panel.clientes.conCuenta}</span>
                    {conCuenta.get(customer.phone)?.marketingOptIn === true ? (
                      <span className="text-muted-foreground">{TEXTOS.panel.clientes.aceptaNovedades}</span>
                    ) : null}
                  </p>
                ) : null}

                <p className="text-muted-foreground mt-1 text-xs">
                  {TEXTOS.panel.clientes.pedidos(customer.orders, customer.paidOrders)} ·{" "}
                  {TEXTOS.panel.clientes.ultimoEl(formatDatePY(customer.lastOrderAt))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between gap-3 text-sm" aria-label={TEXTOS.panel.comunes.paginacion}>
          {result.page > 1 ? (
            <Link href={href(result.page - 1)} className="border-border rounded-lg border px-3 py-2">
              {TEXTOS.panel.pedidos.anteriores}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">
            {TEXTOS.panel.comunes.paginaDeTotal(result.page, result.totalPages)}
          </span>
          {result.page < result.totalPages ? (
            <Link href={href(result.page + 1)} className="border-border rounded-lg border px-3 py-2">
              {TEXTOS.panel.pedidos.siguientes}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
