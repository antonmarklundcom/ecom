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

/**
 * Prefijo opcional de todas las carpetas de esta tienda (PLAN.md FASE 2, PR U).
 *
 * Vacío por defecto, que es el comportamiento de siempre: `productos/`,
 * `comprobantes/`, `banco/`. Con `CLOUDINARY_FOLDER_PREFIX="lenceria"` pasan a
 * ser `lenceria/productos/` y compañía.
 *
 * Existe por una razón concreta y no por prolijidad: **el `public_id` de un
 * comprobante sale del número de pedido**, y los números de pedido se repiten
 * entre tiendas — todas acuñan `PY-000123`, a propósito (el prefijo participa
 * del hash de Pagopar, así que no es por tienda). Dos tiendas que comparten
 * una cuenta de Cloudinary sin prefijo terminan con los comprobantes de
 * `PY-000123` de las dos mezclados en la misma carpeta: quien administra esa
 * cuenta no puede distinguirlos, y el `-${Date.now()}` que los separa es un
 * desempate por milisegundo, no una separación por tienda. El prefijo es lo
 * que hace que sean dos carpetas distintas.
 *
 * **No se cambia con archivos ya subidos.** El `public_id` queda guardado
 * entero en la fila (`receipts.cloudinary_id`, `product_images.cloudinary_id`),
 * así que las imágenes viejas se siguen sirviendo desde donde están; lo que
 * cambia es a dónde van las nuevas. Mezclar dos prefijos en una tienda no
 * rompe nada, pero deja las fotos repartidas en dos árboles para siempre —
 * elegilo al crear la tienda y no lo toques más.
 */
function folderPrefix(): string {
  const raw = (process.env.CLOUDINARY_FOLDER_PREFIX ?? "").trim();
  // Se acepta lo que escriba una persona apurada —`/lenceria/`, `lenceria//`—
  // y se guarda una sola forma: sin barras en las puntas.
  const limpio = raw.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  return limpio === "" ? "" : `${limpio}/`;
}

/** Carpeta pública: imágenes de producto, servidas directamente por CDN. */
export const CLOUDINARY_PRODUCTS_FOLDER = `${folderPrefix()}productos`;

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
export const CLOUDINARY_BANK_FOLDER = `${folderPrefix()}banco`;

/** Carpeta privada: comprobantes de pago, sólo accesibles vía URL firmada. */
export const CLOUDINARY_RECEIPTS_FOLDER = `${folderPrefix()}comprobantes`;

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
