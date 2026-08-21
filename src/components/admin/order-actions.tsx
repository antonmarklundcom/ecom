"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { advanceOrder } from "@/app/actions/admin-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderStatus } from "@/db/schema";

import { DESTRUCTIVE_TRANSITIONS, ORDER_STATUS_LABEL, TRANSITION_LABEL } from "@/lib/order-labels";
import { t } from "@/i18n";

/**
 * Botones de cambio de estado.
 *
 * Sólo se muestran las transiciones que la máquina de estados permite desde
 * el estado actual — pero eso es UX: `transitionOrder` valida la arista otra
 * vez del lado del servidor, así que un botón fabricado a mano no mueve nada.
 */
export function OrderActions({
  orderId,
  nextStatuses,
}: {
  orderId: number;
  nextStatuses: OrderStatus[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (to: OrderStatus, why: string): void => {
    setError(null);
    startTransition(async () => {
      const result = await advanceOrder({ orderId, to, reason: why || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPendingStatus(null);
      setReason("");
      toast.success(t("panel.acciones.marcado", { estado: ORDER_STATUS_LABEL[to] }));
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {/* Un paso intermedio para lo que no se puede deshacer: cancelar un
          pedido con el pulgar en el celular es demasiado fácil. */}
      {pendingStatus ? (
        <div className="border-border grid gap-2 rounded-xl border p-3">
          <p className="text-sm font-medium">{TRANSITION_LABEL[pendingStatus]}</p>
          <label className="text-muted-foreground text-xs" htmlFor="reason">
            {t("panel.acciones.motivo")}
          </label>
          <Input
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("panel.acciones.motivo.placeholder")}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => run(pendingStatus, reason)}
            >
              {isPending ? t("panel.acciones.guardando") : t("panel.acciones.confirmar")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setPendingStatus(null);
                setReason("");
              }}
            >
              {t("panel.acciones.volver")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => {
            const destructive = DESTRUCTIVE_TRANSITIONS.includes(status);
            return (
              <Button
                key={status}
                type="button"
                variant={destructive ? "outline" : "default"}
                disabled={isPending}
                onClick={() => (destructive ? setPendingStatus(status) : run(status, ""))}
              >
                {TRANSITION_LABEL[status] ?? ORDER_STATUS_LABEL[status]}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
