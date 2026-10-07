import { PUBLIC_FACTS } from "@/config/public-facts";
import { IMAGE_PROVENANCES, type ImageProvenance } from "@/db/enums";

/**
 * Qué foto puede salir **afuera** de la ficha: la imagen para compartir
 * (WhatsApp, redes), el JSON-LD y el feed de Google/Meta
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md E2).
 *
 * Una foto ilustrativa nunca: afuera no hay leyenda que diga "no es este
 * producto". Una sin marcar, según `PUBLIC_FACTS.publishUnknownImages` (el
 * template la publica, como siempre). Adentro de la ficha se muestran todas;
 * la ilustrativa, con su leyenda.
 */
export function publishableOutside(
  provenance: ImageProvenance | null,
  policy: { publishUnknownImages: boolean } = PUBLIC_FACTS
): boolean {
  if (provenance === "illustrative") return false;
  if (provenance === null) return policy.publishUnknownImages;
  return true;
}

/** La de la foto si la tiene; si no, la del producto; si no, `null`. */
export function effectiveProvenance(
  own: unknown,
  productLevel: unknown
): ImageProvenance | null {
  return asProvenance(own) ?? asProvenance(productLevel);
}

function asProvenance(value: unknown): ImageProvenance | null {
  return (IMAGE_PROVENANCES as readonly unknown[]).includes(value)
    ? (value as ImageProvenance)
    : null;
}

/** Las fotos que pueden salir afuera, en su orden. Sin dato = no se sabe. */
export function outsideImages<
  T extends { provenance?: ImageProvenance | null },
>(images: readonly T[]): T[] {
  return images.filter((image) => publishableOutside(image.provenance ?? null));
}
