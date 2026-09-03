/**
 * Ayudantes chicos que comparten los avisos del sistema por WhatsApp: el aviso
 * al comercio (`order-notifications.ts`) y los avisos a la compradora
 * (`order-customer-notifications.ts`). Separados acá para no repetir el mismo
 * timeout y el mismo recorte de motivo en cada archivo.
 */

/** Más que esto y no vale la pena seguir esperando: lo que dispara el aviso ya está guardado. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`el envío pasó de ${ms} ms`)), ms).unref?.(),
    ),
  ]);
}

/** Motivo corto para `order_events.reason`: sin stack, sin número de nadie. */
export function motivoDeAviso(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}
