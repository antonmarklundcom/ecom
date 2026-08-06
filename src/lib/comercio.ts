import { normalizePhonePY, waLink } from "@/lib/py";

/**
 * Datos del comercio, leídos del entorno **del servidor**.
 *
 * El número de WhatsApp no lleva `NEXT_PUBLIC_`: los links se arman en
 * Server Components y llegan al navegador ya hechos. Que el dato termine
 * siendo visible en un `href` no es excusa para exponer la variable al
 * bundle — la regla es que el cliente no lee `process.env`.
 */
export function comercioWhatsApp(): string | null {
  return normalizePhonePY(process.env.WHATSAPP_NUMBER ?? "");
}

export function comercioWaLink(text: string): string | null {
  const phone = comercioWhatsApp();
  if (!phone) return null;
  return waLink(phone, text);
}
