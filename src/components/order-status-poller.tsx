"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { OrderStatus } from "@/db/schema";

/**
 * ARCH.md §4: "/pedido/[n] hace polling → el estado cambia a 'pagado' solo".
 *
 * No hay ruta nueva: `router.refresh()` vuelve a correr el Server Component
 * de la página con los datos frescos de la DB. Este componente sólo decide
 * cuándo llamarlo y cuándo parar.
 */

const WAITING_STATUSES: readonly OrderStatus[] = ["pendiente_pago", "esperando_verificacion"];

const POLL_INTERVAL_MS = 10_000;
// ~5 minutos de polling automático; después de eso, actualizar es cosa del
// comprador (recargar), no de dejar un intervalo corriendo indefinidamente en
// una pestaña que quedó abierta.
const MAX_POLLS = 30;

export function OrderStatusPoller({ status }: { status: OrderStatus }) {
  const router = useRouter();
  const pollCount = useRef(0);

  const waiting = WAITING_STATUSES.includes(status);

  useEffect(() => {
    if (!waiting) {
      pollCount.current = 0;
      return;
    }

    const id = window.setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        window.clearInterval(id);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
    // `waiting` sale de `status`: cuando el refresh trae un estado nuevo que
    // ya no espera nada, `waiting` pasa a `false` y este efecto limpia el
    // intervalo solo, sin que nadie tenga que desmontar el componente.
  }, [waiting, router]);

  return null;
}
