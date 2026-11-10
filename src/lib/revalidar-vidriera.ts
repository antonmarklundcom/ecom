import { revalidatePath } from "next/cache";

import { log } from "./log";
import { safeError } from "./safe-error";

/**
 * Tira la caché de la vidriera entera: home, categorías, fichas, sitemap.
 *
 * Las páginas del catálogo son ISR (ARCH.md §6, "Caché de la vidriera"): se
 * arman una vez y se sirven armadas hasta 5 minutos. Eso está bien para lo
 * que cambia solo; para lo que cambia **porque alguien lo cambió** no: el
 * dueño que corrige un precio en el panel y recarga la ficha tiene que verlo
 * ya, no "en un rato". Cada escritura que cambia algo que se ve en la vidriera
 * llama a esto, una vez, después de guardar:
 *
 * - el catálogo del panel: producto, variante, stock, fotos, categorías,
 *   planilla, acciones masivas (`src/app/actions/admin-products.ts`,
 *   `admin-categories.ts`);
 * - los ajustes y la identidad (marca, portada, anuncio, contacto, páginas) y
 *   las integraciones (WhatsApp, R2, medidores): están en el layout de
 *   todas las páginas;
 * - las reseñas moderadas, las devoluciones que reponen stock;
 * - el stock que mueven los pedidos: el checkout que reserva, el panel que
 *   cancela o edita, el cron que vence (`/api/cron/vencer-pedidos`).
 *
 * Una sola llamada y la más gruesa a propósito: `revalidatePath("/",
 * "layout")` marca vencido todo lo que cuelga del layout raíz. No regenera
 * nada en el momento —cada página se rearma la próxima vez que alguien la
 * pide—, así que en una tienda de cientos de productos cuesta lo mismo que
 * invalidar una. Elegir a mano qué rutas tirar es el bug de "cambié el nombre
 * de la categoría y la ficha sigue mostrando el viejo".
 *
 * Nunca tira: si invalidar falla, lo guardado ya está guardado, y que el
 * panel diga "error" después de un guardado exitoso es peor que una vidriera
 * vieja por unos minutos. Fuera de Next (scripts, tests sin mock) no hay caché
 * que invalidar y no hace nada.
 */
export function revalidarVidriera(): void {
  try {
    revalidatePath("/", "layout");
  } catch (cause) {
    const message = safeError(cause).message;
    // Fuera de un request de Next (un script, un test) no hay caché: no es un
    // problema, es que no hay nada que tirar.
    if (message.includes("static generation store missing")) return;
    log.warn("vidriera: no se pudo invalidar la caché", { error: message });
  }
}
