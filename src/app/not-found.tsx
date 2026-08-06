import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center">
      <p className="text-muted-foreground text-sm">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        Puede que el producto ya no esté publicado o que el link esté mal copiado.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pedido/buscar">Buscar mi pedido</Link>
        </Button>
      </div>
    </main>
  );
}
