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

export type DatosBancarios = {
  banco: string;
  titular: string;
  ruc: string;
  cuenta: string;
  tipoCuenta: string;
  /** URL pública del QR SPI — ver `BANCO_QR_URL` en `.env.example`. */
  qrUrl: string | null;
};

/**
 * Datos bancarios para la página SPI/QR (ARCH.md §5).
 *
 * `null` si falta cualquiera de los campos obligatorios — la página los
 * muestra con un aviso en vez de inventar un banco o un RUC de ejemplo,
 * mismo criterio que el 503 del webhook de Pagopar sin configurar.
 */
export function comercioDatosBancarios(): DatosBancarios | null {
  const banco = (process.env.BANCO_NOMBRE ?? "").trim();
  const titular = (process.env.BANCO_TITULAR ?? "").trim();
  const ruc = (process.env.BANCO_RUC ?? "").trim();
  const cuenta = (process.env.BANCO_CUENTA ?? "").trim();
  const tipoCuenta = (process.env.BANCO_TIPO_CUENTA ?? "").trim();

  if (!banco || !titular || !ruc || !cuenta || !tipoCuenta) return null;

  const qrUrl = (process.env.BANCO_QR_URL ?? "").trim();
  return { banco, titular, ruc, cuenta, tipoCuenta, qrUrl: qrUrl || null };
}
