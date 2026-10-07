"use server";

import { safeError } from "@/lib/safe-error";

import { requireOrderAccess } from "@/domain/order-access";
import {
  ACCEPTS_RECEIPT,
  ReceiptError,
  assertCanUpload,
  finalizeUploadedReceipt,
  validateReceipt,
} from "@/domain/receipts";
import {
  carpetaComprobantes,
  cloudinary,
  cloudinaryConfigured,
} from "@/lib/cloudinary";
import { t } from "@/i18n";
import { cargarIntegraciones } from "@/lib/integraciones-store";

/**
 * Subida del comprobante de transferencia (PLAN.md 3.5).
 *
 * El archivo va a una carpeta **privada** de Cloudinary (`type: authenticated`):
 * un comprobante bancario tiene el nombre y la cuenta del comprador, y una URL
 * pública adivinable sería una filtración. El admin lo mira con URL firmada.
 */

export type UploadReceiptResult = { ok: true } | { ok: false; error: string };

export async function uploadReceipt(
  formData: FormData
): Promise<UploadReceiptResult> {
  // Cloudinary puede estar configurado desde /admin/integraciones.
  await cargarIntegraciones();
  const orderNumber = String(formData.get("orderNumber") ?? "");
  const token = String(formData.get("token") ?? "");
  const file = formData.get("file");

  // Guard primero: sin token válido no se sube nada a nombre de otro pedido.
  const order = await requireOrderAccess(orderNumber, token);
  if (!order) {
    return { ok: false, error: t("error.comprobante.pedidoNoEncontrado") };
  }

  if (!(file instanceof File)) {
    return { ok: false, error: t("error.comprobante.elegiArchivo") };
  }

  // Sin almacenamiento de comprobantes la página no muestra el formulario
  // (docs/TEMPLATE-IMPROVEMENT-PLAN.md D3); esto es para una pestaña vieja o
  // un POST armado a mano: se corta antes de leer el archivo, con un mensaje
  // que dice qué hacer en vez de un error genérico después de esperar.
  if (!cloudinaryConfigured()) {
    return { ok: false, error: t("error.comprobante.sinAlmacenamiento") };
  }

  let subido: string | null = null;
  try {
    // Vistazo barato antes de subir (D4): evita subir un archivo que se va a
    // rechazar. La decisión que vale se toma de nuevo bajo lock en
    // `finalizeUploadedReceipt`.
    if (order.paymentMethod !== "transferencia") {
      throw new ReceiptError("error.comprobante.noEsTransferencia");
    }
    if (!ACCEPTS_RECEIPT.includes(order.status)) {
      throw new ReceiptError("error.comprobante.noEsperaComprobante");
    }

    await assertCanUpload(order.id);

    const content = Buffer.from(await file.arrayBuffer());
    const { mime } = validateReceipt({
      declaredMime: file.type,
      bytes: content.byteLength,
      content,
    });

    const uploaded = await cloudinary.uploader.upload(
      `data:${mime};base64,${content.toString("base64")}`,
      {
        folder: carpetaComprobantes(),
        // `authenticated` = sin URL pública: sólo se ve con firma y TTL.
        type: "authenticated",
        resource_type: mime === "application/pdf" ? "image" : "image",
        public_id: `${order.orderNumber}-${Date.now()}`,
        overwrite: false,
      }
    );
    subido = uploaded.public_id;

    // Estado, cupo, registro, transición y reserva: todo bajo el lock del
    // pedido, en una transacción.
    await finalizeUploadedReceipt({
      orderId: order.id,
      cloudinaryId: uploaded.public_id,
      mime,
      bytes: content.byteLength,
    });
    subido = null;

    return { ok: true };
  } catch (error) {
    // Subido pero no registrado (el pedido cambió, se llenó el cupo, falló la
    // base): el archivo privado no puede quedar huérfano en la cuenta.
    if (subido) {
      await cloudinary.uploader
        .destroy(subido, { type: "authenticated", resource_type: "image" })
        .catch((cleanup: unknown) => {
          console.error(
            "uploadReceipt: no pude borrar el comprobante sin registrar",
            safeError(cleanup).message
          );
        });
    }
    if (error instanceof ReceiptError) {
      return { ok: false, error: error.message };
    }
    console.error("uploadReceipt falló", safeError(error).message);
    return { ok: false, error: t("error.comprobante.generico") };
  }
}
