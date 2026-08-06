import { MessageCircle } from "lucide-react";

import { comercioWaLink } from "@/lib/comercio";

/**
 * Botón flotante de WhatsApp. En PY es el canal de venta real: si el
 * comprador duda, escribe antes de abandonar el carrito.
 */
export function WhatsAppFab({ message }: { message?: string }) {
  const href = comercioWaLink(message ?? "¡Hola! Tengo una consulta sobre un producto.");
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <MessageCircle className="size-7" />
    </a>
  );
}
