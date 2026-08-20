import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TEXTOS } from "@/i18n";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center">
      <p className="text-muted-foreground text-sm">{TEXTOS.errores.error404}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {TEXTOS.errores.noEncontramosPagina}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        {TEXTOS.errores.noEncontramosPaginaAyuda}
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/">{TEXTOS.errores.irAlInicio}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pedido/buscar">{TEXTOS.errores.buscarMiPedido}</Link>
        </Button>
      </div>
    </main>
  );
}
