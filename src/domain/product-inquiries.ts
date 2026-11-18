import type { CatalogProductDetail } from "@/db/queries";
import { waLinkPublico } from "@/lib/comercio";
import {
  MODO_VENTA_POR_DEFECTO,
  saleModeEfectivo,
  type ModoVenta,
} from "./modo-venta";
import { siteOrigin } from "@/lib/site-url";
import { t } from "@/i18n";

/**
 * The caller supplies a published product read from the server catalog, and
 * the store's selling mode (`modoVentaEfectivo()`): in `"consulta"` a `stock`
 * product is an enquiry too (`saleModeEfectivo`).
 */
export async function productInquiryLinks(
  product: CatalogProductDetail,
  modo: ModoVenta = MODO_VENTA_POR_DEFECTO
): Promise<Record<number, string>> {
  if (saleModeEfectivo(product.saleMode, modo) !== "enquiry") return {};
  const origin = siteOrigin();
  const links: Record<number, string> = {};
  for (const variant of product.variants) {
    const text = t("producto.consultaVariante", {
      producto: product.name,
      variante: variant.label,
      sku: variant.sku,
    });
    const url = origin
      ? new URL(`/producto/${product.slug}`, origin).toString()
      : null;
    const href = await waLinkPublico(url ? `${text} — ${url}` : text);
    if (href) links[variant.id] = href;
  }
  return links;
}
