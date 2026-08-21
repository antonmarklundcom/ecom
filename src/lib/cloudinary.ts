import "dotenv/config";
import { v2 as sdk } from "cloudinary";

/**
 * Cliente de Cloudinary, configurado **perezosamente**.
 *
 * Antes esto validaba las credenciales y llamaba a `config()` al importarse,
 * y un `import` que explota se lleva puesto a todo el que lo toca de rebote:
 * `domain/receipt-review.ts` importa `signedReceiptUrl` para la preview del
 * comprobante, así que aprobar un pedido —que es puro MySQL y no manda un solo
 * byte a Cloudinary— quedaba atado a tener credenciales cargadas. En CI, sin
 * las variables, el módulo entero de tests ni siquiera levantaba.
 *
 * Ahora se configura en el primer uso real. Importar nunca falla; si faltan
 * credenciales, falla la subida o la firma, que es lo único que de verdad las
 * necesita. Mismo patrón que el pool de `src/db/index.ts`, y la misma razón
 * por la que `src/lib/images.ts` arma las URLs públicas sin tocar este módulo.
 */

let configured = false;

function configure(): typeof sdk {
  if (configured) return sdk;

  const missing = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de Cloudinary (${missing.join(" / ")}). ` +
        "Completalas en .env.local — ver .env.example.",
    );
  }

  sdk.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
  return sdk;
}

/** Carpeta pública: imágenes de producto, servidas directamente por CDN. */
export const CLOUDINARY_PRODUCTS_FOLDER = "productos";

/**
 * Carpeta **pública** del QR SPI del comercio (PLAN.md FASE 2, PR T).
 *
 * Pública y separada de `comprobantes/` a propósito: ese folder es
 * `authenticated` y sólo se sirve con URL firmada, que es exactamente lo
 * contrario de lo que necesita una imagen que la compradora tiene que ver en
 * la página del pedido sin estar logueada en ningún lado. Meter el QR ahí
 * sería, además, poner un archivo del comercio adentro del folder donde viven
 * los comprobantes de pago de sus clientas.
 */
export const CLOUDINARY_BANK_FOLDER = "banco";

/** Carpeta privada: comprobantes de pago, sólo accesibles vía URL firmada. */
export const CLOUDINARY_RECEIPTS_FOLDER = "comprobantes";

/**
 * Genera una URL firmada de corta duración para un recurso privado
 * (comprobante de pago) en la carpeta `comprobantes/`. No expone el
 * recurso públicamente.
 */
export function signedReceiptUrl(
  publicId: string,
  { expiresInSeconds = 300 }: { expiresInSeconds?: number } = {},
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return configure().utils.private_download_url(publicId, "", {
    resource_type: "image",
    type: "authenticated",
    expires_at: expiresAt,
  });
}

/**
 * El SDK. Se configura solo en el primer acceso a cualquier propiedad, así que
 * quien lo usa no cambia nada: `cloudinary.uploader.upload(...)` sigue igual.
 */
export const cloudinary: typeof sdk = new Proxy(sdk, {
  get(target, prop, receiver) {
    configure();
    return Reflect.get(target, prop, receiver);
  },
});

/** Sólo para tests: obliga a reconfigurar en el próximo uso. */
export function resetCloudinaryConfigForTests(): void {
  configured = false;
}
