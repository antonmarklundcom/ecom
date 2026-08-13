"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { markPaymentRefunded, retryPaymentRevival } from "@/app/actions/admin-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGs } from "@/lib/money";

/**
 * "Pagos sin pedido vivo" con sus dos acciones (ARCH.md §4.1).
 *
 * La lista sola dejaba al dueño mirando plata que no podía tocar: para revivir
 * un pedido o anotar una devolución había que entrar a MySQL. Los dos botones
 * son eso, y nada más que eso — el servidor vuelve a leer el estado con el
 * candado tomado, así que un click sobre una pantalla vieja no decide nada.
 *
 * "Devolver" pide un motivo y confirma: es la única de las dos que no se
 * deshace. "Reintentar" es seguro de tocar tantas veces como haga falta.
 */

export type UnmatchedPaymentCard = {
  paymentId: number;
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  provider: string;
  amountPyg: number;
  paidAt: string;
};

export function UnmatchedPayments({ payments }: { payments: UnmatchedPaymentCard[] }) {
  return (
    <ul className="divide-border mt-3 divide-y text-sm">
      {payments.map((payment) => (
        <UnmatchedPaymentRow key={payment.paymentId} payment={payment} />
      ))}
    </ul>
  );
}

function UnmatchedPaymentRow({ payment }: { payment: UnmatchedPaymentCard }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const retry = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await retryPaymentRevival({ paymentId: payment.paymentId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        result.changed
          ? `${result.orderNumber} volvió a estar cobrado.`
          : `${result.orderNumber} ya estaba cobrado.`,
      );
      router.refresh();
    });
  };

  const refund = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await markPaymentRefunded({ paymentId: payment.paymentId, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRefunding(false);
      setReason("");
      toast.success(`Devolución anotada en ${result.orderNumber}.`);
      router.refresh();
    });
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/admin/pedidos/${payment.orderId}`} className="font-medium underline">
          {payment.orderNumber}
        </Link>
        <span className="font-semibold tabular-nums">{formatGs(payment.amountPyg)}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {payment.provider} · pedido en &quot;{payment.orderStatus}&quot; · {payment.paidAt}
      </p>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-2 rounded-lg border p-2 text-xs"
        >
          {error}
        </p>
      ) : null}

      {refunding ? (
        <div className="border-border mt-2 grid gap-2 rounded-lg border p-3">
          <label className="text-muted-foreground text-xs" htmlFor={`motivo-${payment.paymentId}`}>
            Motivo de la devolución (queda en el historial del pedido)
          </label>
          <Input
            id={`motivo-${payment.paymentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: transferí de vuelta por SPI el 12/8"
            maxLength={500}
          />
          <p className="text-muted-foreground text-xs">
            Esto no le transfiere la plata a nadie: anota que vos ya la devolviste, y cancela el
            pedido.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={isPending} onClick={refund}>
              {isPending ? "Guardando…" : "Confirmar devolución"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setRefunding(false);
                setReason("");
              }}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={isPending} onClick={retry}>
            Reintentar el pedido
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setRefunding(true)}
          >
            Marcar como devuelto
          </Button>
        </div>
      )}
    </li>
  );
}
