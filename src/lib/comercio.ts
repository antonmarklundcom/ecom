import { formatGs } from "@/lib/money";
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

export type DatosPagoSpi = {
  banco: string;
  titular: string;
  ruc: string;
  numeroCuenta: string;
  alias: string;
  qrImageUrl: string;
};

/**
 * Datos bancarios para la página de pago por transferencia/SPI (PLAN.md 3.4).
 *
 * Si falta cualquiera de estas variables devuelve `null`: la página de pago
 * degrada a "coordinar por WhatsApp" en vez de mostrar campos vacíos.
 */
export function datosPagoSpi(): DatosPagoSpi | null {
  const banco = process.env.SPI_BANCO?.trim();
  const titular = process.env.SPI_TITULAR?.trim();
  const ruc = process.env.SPI_RUC?.trim();
  const numeroCuenta = process.env.SPI_NUMERO_CUENTA?.trim();
  const alias = process.env.SPI_ALIAS?.trim();
  const qrImageUrl = process.env.SPI_QR_IMAGE_URL?.trim();

  if (!banco || !titular || !ruc || !numeroCuenta || !alias || !qrImageUrl) {
    return null;
  }
  return { banco, titular, ruc, numeroCuenta, alias, qrImageUrl };
}

/**
 * Mensaje pre-armado para "Enviar comprobante por WhatsApp" (PLAN.md 3.6).
 *
 * Nunca lleva el `access_token` ni la URL tokenizada del pedido: ese link es
 * la credencial del comprador y el mensaje se reenvía tal cual por WhatsApp.
 */
export function receiptWaMessage(orderNumber: string, totalPyg: number, customerName: string): string {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName.trim();
  return (
    `¡Hola! Ya transferí mi pedido ${orderNumber} por ${formatGs(totalPyg)}. ` +
    `Soy ${firstName}, te mando el comprobante.`
  );
}

/**
 * Mensaje del deeplink de notificación al dueño (PLAN.md 3.10).
 *
 * `panelUrl` es la URL interna de `/admin/pedidos/[id]` — requiere sesión de
 * admin, a diferencia del link tokenizado que recibe el comprador.
 */
export function ownerNewOrderWaMessage(orderNumber: string, totalPyg: number, panelUrl: string): string {
  return `Pedido nuevo ${orderNumber} — ${formatGs(totalPyg)}. Vela en el panel: ${panelUrl}`;
}
