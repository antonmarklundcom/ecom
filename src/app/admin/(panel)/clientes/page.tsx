import type { Metadata } from "next";
import Link from "next/link";

import { listCustomers } from "@/domain/admin-customers";
import { formatGs } from "@/lib/money";
import { formatDatePY, formatPhonePY } from "@/lib/py";

export const metadata: Metadata = { title: "Clientes" };

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
  const query = await searchParams;
  const search = first(query.q);
  const rawPage = Number(first(query.pagina) ?? 1);

  const result = await listCustomers({
    search,
    page: Number.isFinite(rawPage) ? rawPage : 1,
  });

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
        <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {result.total} {result.total === 1 ? "cliente" : "clientes"}
        </p>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        Sale de los pedidos, agrupados por WhatsApp. Lo gastado cuenta sólo los pedidos ya
        cobrados (pagado en adelante).
      </p>

      <form className="mt-4 flex gap-2" action="/admin/clientes">
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Nombre, WhatsApp o RUC"
          aria-label="Buscar cliente"
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="border-border rounded-lg border px-4 text-sm">
          Buscar
        </button>
      </form>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground border-border mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
          {search ? "Ningún cliente coincide con esa búsqueda." : "Todavía no hay pedidos."}
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

                <p className="text-muted-foreground mt-1 text-xs">
                  {customer.orders} {customer.orders === 1 ? "pedido" : "pedidos"}
                  {customer.paidOrders < customer.orders
                    ? ` (${customer.paidOrders} cobrado${customer.paidOrders === 1 ? "" : "s"})`
                    : ""}{" "}
                  · último el {formatDatePY(customer.lastOrderAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between gap-3 text-sm" aria-label="Paginación">
          {result.page > 1 ? (
            <Link href={href(result.page - 1)} className="border-border rounded-lg border px-3 py-2">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">
            Página {result.page} de {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Link href={href(result.page + 1)} className="border-border rounded-lg border px-3 py-2">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
