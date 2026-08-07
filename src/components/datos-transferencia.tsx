"use client";

import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Datos para transferir + QR (PLAN.md 3.4, ARCH.md §5).
 *
 * Botón de copiar en **cada** campo, y sobre todo en el monto: tipear un
 * número de cuenta de 12 dígitos y un total en guaraníes desde el teclado del
 * celular, cambiando de app, es exactamente donde se caen los pedidos.
 *
 * El monto se copia en plano (`1234567`), sin el `₲` ni los puntos: es lo que
 * la app del banco acepta pegado. Lo que se **muestra** sí va formateado.
 */

export type CampoCopiable = {
  label: string;
  /** Lo que ve el comprador. */
  display: string;
  /** Lo que va al portapapeles, si difiere de lo que se muestra. */
  copy?: string;
  /** Resalta el campo — se usa para el total exacto. */
  destacado?: boolean;
};

export function DatosTransferencia({
  campos,
  qrUrl,
}: {
  campos: CampoCopiable[];
  qrUrl: string | null;
}) {
  return (
    <div className="grid gap-3">
      <ul className="divide-border border-border divide-y rounded-xl border">
        {campos.map((campo) => (
          <CampoRow key={campo.label} campo={campo} />
        ))}
      </ul>

      {qrUrl ? (
        <div className="border-border grid justify-items-center gap-2 rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">O escaneá el QR desde tu app del banco</p>
          <Image
            src={qrUrl}
            alt="Código QR para pagar por SPI"
            width={220}
            height={220}
            unoptimized
            className="rounded-lg"
          />
        </div>
      ) : null}
    </div>
  );
}

function CampoRow({ campo }: { campo: CampoCopiable }) {
  const [copiado, setCopiado] = useState(false);
  const valor = campo.copy ?? campo.display;

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Safari en http:// y algunos WebView no dan permiso al portapapeles.
      // El dato igual está en pantalla y se puede seleccionar a mano: no
      // mostramos un error que no ayuda a nadie.
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{campo.label}</p>
        <p
          className={`truncate tabular-nums ${campo.destacado ? "text-lg font-semibold" : "text-sm"}`}
        >
          {campo.display}
        </p>
      </div>
      <Button
        type="button"
        variant={campo.destacado ? "default" : "outline"}
        size="sm"
        className="shrink-0"
        onClick={copiar}
        aria-label={`Copiar ${campo.label}`}
      >
        {copiado ? "¡Copiado!" : "Copiar"}
      </Button>
    </li>
  );
}
