import Image from "next/image";

import { CopyField } from "@/components/copy-field";
import type { DatosPagoSpi } from "@/lib/comercio";
import { formatGs } from "@/lib/money";

/**
 * Datos bancarios + QR para pagar por transferencia (PLAN.md 3.4, ARCH.md §5).
 *
 * Botón de copiar sólo en los datos que un comprador realmente teclea en su
 * banco: cuenta, alias y monto. Banco/titular/RUC se muestran para verificar
 * a quién le está transfiriendo.
 */
export function PagoSpi({ datos, totalPyg }: { datos: DatosPagoSpi; totalPyg: number }) {
  return (
    <div className="mt-3">
      <div className="flex justify-center">
        <Image
          src={datos.qrImageUrl}
          alt="Código QR para pagar por SPI"
          width={220}
          height={220}
          unoptimized
          className="rounded-lg border object-contain"
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Banco</dt>
        <dd className="text-right">{datos.banco}</dd>
        <dt className="text-muted-foreground">Titular</dt>
        <dd className="text-right">{datos.titular}</dd>
        <dt className="text-muted-foreground">RUC</dt>
        <dd className="text-right tabular-nums">{datos.ruc}</dd>
      </dl>

      <div className="divide-border mt-2 divide-y">
        <CopyField label="Nro. de cuenta" value={datos.numeroCuenta} />
        <CopyField label="Alias" value={datos.alias} />
        <CopyField label="Monto exacto" value={String(totalPyg)} displayValue={formatGs(totalPyg)} />
      </div>
    </div>
  );
}
