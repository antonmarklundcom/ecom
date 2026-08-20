"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { TEXTOS } from "@/i18n";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle queda en el log del servidor: al comprador no le decimos
    // qué falló, sólo el digest para poder rastrearlo si escribe.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{TEXTOS.errores.algoSalioMal}</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        {TEXTOS.errores.algoSalioMalAyuda}
      </p>
      {error.digest ? (
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          {TEXTOS.errores.referencia(error.digest)}
        </p>
      ) : null}
      <Button className="mt-6" onClick={reset}>
        {TEXTOS.comunes.reintentar}
      </Button>
    </main>
  );
}
