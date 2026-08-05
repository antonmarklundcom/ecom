import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error(
    "Faltan variables de Cloudinary (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET)"
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Carpeta pública: imágenes de producto, servidas directamente por CDN. */
export const CLOUDINARY_PRODUCTS_FOLDER = "productos";

/** Carpeta privada: comprobantes de pago, sólo accesibles vía URL firmada. */
export const CLOUDINARY_RECEIPTS_FOLDER = "comprobantes";

/**
 * Genera una URL firmada de corta duración para un recurso privado
 * (comprobante de pago) en la carpeta `comprobantes/`. No expone el
 * recurso públicamente.
 */
export function signedReceiptUrl(
  publicId: string,
  { expiresInSeconds = 300 }: { expiresInSeconds?: number } = {}
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "image",
    type: "authenticated",
    expires_at: expiresAt,
  });
}

export { cloudinary };
