import type { Metadata } from "next";

import { OrderLookupForm } from "@/components/order-lookup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar mi pedido",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OrderLookupPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const pedido = Array.isArray(query.pedido) ? query.pedido[0] : query.pedido;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Buscá tu pedido</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Si perdiste el link que te mandamos por WhatsApp, entrá con el número de pedido y el
        teléfono que usaste al comprar.
      </p>

      <div className="mt-6">
        <OrderLookupForm defaultOrderNumber={pedido} />
      </div>
    </main>
  );
}
