/**
 * Contar los clics en "Consultar por WhatsApp" (O33, `fable/plan-trafico.md`
 * §2.2). Lo que va en el navegador: sin base, sin `process.env`.
 *
 * Cómo funciona, y por qué así:
 *
 * - El link sigue siendo un `<a href="https://wa.me/...">` común. Anda sin
 *   JavaScript y contar nunca demora ni frena el clic.
 * - El link lleva `data-consulta="<origen>"` (y, si es de un producto,
 *   `data-consulta-producto` / `data-consulta-variante`). Son datos fijos de
 *   la página —nada por request, ningún nonce—, así que el HTML cacheado de
 *   la home o de una categoría los trae igual.
 * - Un solo escuchador en el layout (`contador-consultas.tsx`) ve el clic y
 *   manda un `navigator.sendBeacon` a `POST /api/consulta`. Si el beacon falla
 *   o lo bloquea un adblocker, a la compradora no le cambia nada.
 */

/** De dónde salió la consulta. Lista cerrada: la ruta rechaza cualquier otra. */
export const ENQUIRY_ORIGINS = [
  "producto",
  "tarjeta",
  "flotante",
  "guia",
  "contacto",
] as const;
export type EnquiryOrigin = (typeof ENQUIRY_ORIGINS)[number];

export const CONSULTA_ENDPOINT = "/api/consulta";

export type AtributosConsulta = {
  "data-consulta": EnquiryOrigin;
  "data-consulta-producto"?: string;
  "data-consulta-variante"?: string;
  "data-consulta-sku"?: string;
};

/**
 * Los atributos que hay que ponerle a un link de WhatsApp para que cuente.
 * Se esparcen en el `<a>`: `<a href={wa} {...atributosConsulta("producto", { productId })}>`.
 */
export function atributosConsulta(
  origen: EnquiryOrigin,
  datos: { productId?: number | null; variantId?: number | null; sku?: string | null } = {}
): AtributosConsulta {
  const atributos: AtributosConsulta = { "data-consulta": origen };
  if (datos.productId && datos.productId > 0)
    atributos["data-consulta-producto"] = String(datos.productId);
  if (datos.variantId && datos.variantId > 0)
    atributos["data-consulta-variante"] = String(datos.variantId);
  if (datos.sku) atributos["data-consulta-sku"] = datos.sku;
  return atributos;
}

/** Lo que viaja en el beacon. Números y un origen: nada de la persona. */
export type CuerpoConsulta = { o: string; p?: number; v?: number };

/** Lee los atributos de un link y arma el cuerpo del beacon, o `null`. */
export function cuerpoDesdeLink(link: Element): CuerpoConsulta | null {
  const origen = link.getAttribute("data-consulta");
  if (!origen) return null;
  const cuerpo: CuerpoConsulta = { o: origen };
  const producto = Number(link.getAttribute("data-consulta-producto"));
  const variante = Number(link.getAttribute("data-consulta-variante"));
  if (Number.isSafeInteger(producto) && producto > 0) cuerpo.p = producto;
  if (Number.isSafeInteger(variante) && variante > 0) cuerpo.v = variante;
  return cuerpo;
}
