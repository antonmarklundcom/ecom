import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volviste de Pagopar",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "" ? single : undefined;
}

/**
 * Página de retorno del pago con tarjeta (PLAN.md 5.5).
 *
 * Es la URL fija que se registra a mano en el panel de Pagopar — no se manda
 * por la API (ver `.env.example`), así que es la misma para todos los
 * pedidos y Pagopar la completa con los parámetros que le agregue al volver.
 *
 * ⚠️ Bajo qué nombre exacto viaja la referencia del pedido en esa vuelta no
 * está confirmado contra la doc v2 vigente (mismo caso que el sobre del
 * webhook, ARCH.md §4). Por eso esta página no depende de ese dato para
 * mostrar nada: nunca expone datos del pedido sin el token, sólo usa un
 * candidato plausible para precargar el número en el buscador que ya existe
 * para este caso (`/pedido/buscar`).
 */
export default async function CheckoutRetornoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const orderNumber =
    firstParam(query.id_pedido_comercio) ?? firstParam(query.pedido) ?? firstParam(query.hash_pedido);

  const buscarHref = orderNumber
    ? `/pedido/buscar?pedido=${encodeURIComponent(orderNumber)}`
    : "/pedido/buscar";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Gracias por tu pago</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Estamos confirmando el pago con Pagopar. En cuanto se acredite, tu pedido pasa a
        &quot;Pagado&quot; solo — no hace falta que hagas nada más.
      </p>
      <Link
        href={buscarHref}
        className="border-border mt-6 inline-flex rounded-lg border px-4 py-2 text-sm"
      >
        Ver el estado de mi pedido
      </Link>
    </main>
  );
}
