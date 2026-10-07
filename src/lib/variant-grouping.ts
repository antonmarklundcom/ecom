import { CATALOGUE, type AttributeDefinition } from "@/config/catalogue";

import { publicVariantAttributes } from "./public-product-facts";

export type VariantGrouping = {
  /** Las dimensiones declaradas que distinguen a las variantes. */
  dimensions: (AttributeDefinition & {
    schemaProperty: NonNullable<AttributeDefinition["schemaProperty"]>;
  })[];
  /** Los valores verificados de cada variante, en el mismo orden. */
  facts: (Record<string, unknown> | undefined)[];
};

/**
 * Cuándo las variantes de un producto son un **grupo** (talle, color…) y no
 * varias ofertas del mismo producto. La misma regla para el JSON-LD
 * (`ProductGroup`) y el feed (`item_group_id`), así Google lee lo mismo en
 * los dos (docs/TEMPLATE-IMPROVEMENT-PLAN.md E6).
 *
 * Hace falta una dimensión de `CATALOGUE.attributes` con `schemaProperty`,
 * verificada en **todas** las variantes y con más de un valor. La etiqueta
 * sola ("Chico", "Grande") no alcanza: no dice qué dimensión es.
 * `null` = no es un grupo.
 */
export function variantGrouping(
  variants: readonly { attributes?: unknown }[]
): VariantGrouping | null {
  if (variants.length < 2) return null;
  const dimensions = CATALOGUE.attributes.filter(
    (d): d is VariantGrouping["dimensions"][number] =>
      d.scope === "variant" && d.schemaProperty !== undefined
  );
  const facts = variants.map(
    (v) =>
      publicVariantAttributes(v.attributes)?.values as
        Record<string, unknown> | undefined
  );
  const usable = dimensions.filter(
    (d) =>
      facts.every((f) => f && f[d.key] !== undefined) &&
      new Set(facts.map((f) => String(f?.[d.key]))).size > 1
  );
  return usable.length > 0 ? { dimensions: usable, facts } : null;
}
