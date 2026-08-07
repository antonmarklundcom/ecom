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

/**
 * Datos bancarios para la transferencia / SPI (PLAN.md 3.4, ARCH.md §5).
 *
 * No son secretos —el comprador tiene que verlos para poder pagar— pero
 * tampoco llevan `NEXT_PUBLIC_`: se leen en un Server Component y llegan al
 * navegador ya renderizados. La regla del repo es que el cliente nunca lee
 * `process.env`.
 */
export type DatosBancarios = {
  banco: string;
  titular: string;
  ruc: string;
  cuenta: string;
  /** Alias SPI, si el comercio tiene uno. Opcional. */
  alias: string | null;
  /** URL de la imagen del QR (Cloudinary público). Opcional. */
  qrUrl: string | null;
};

/**
 * Devuelve `null` si falta cualquiera de los cuatro datos obligatorios.
 *
 * Es todo o nada a propósito: una pantalla de pago con el banco pero sin el
 * número de cuenta es peor que no mostrar nada — el comprador cree que puede
 * pagar, se traba, y el pedido se pierde en silencio. Con `null`, la página
 * cae al camino de WhatsApp, que sí funciona.
 */
export function datosBancarios(): DatosBancarios | null {
  const banco = process.env.COMERCIO_BANCO?.trim();
  const titular = process.env.COMERCIO_TITULAR?.trim();
  const ruc = process.env.COMERCIO_RUC?.trim();
  const cuenta = process.env.COMERCIO_CUENTA?.trim();

  if (!banco || !titular || !ruc || !cuenta) return null;

  return {
    banco,
    titular,
    ruc,
    cuenta,
    alias: process.env.COMERCIO_ALIAS?.trim() || null,
    qrUrl: process.env.COMERCIO_QR_URL?.trim() || null,
  };
}

/** Qué datos faltan, para avisarle al dueño en el panel. */
export function datosBancariosFaltantes(): string[] {
  return (
    [
      ["COMERCIO_BANCO", process.env.COMERCIO_BANCO],
      ["COMERCIO_TITULAR", process.env.COMERCIO_TITULAR],
      ["COMERCIO_RUC", process.env.COMERCIO_RUC],
      ["COMERCIO_CUENTA", process.env.COMERCIO_CUENTA],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
}
