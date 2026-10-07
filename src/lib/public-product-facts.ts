import {
  decoded,
  ProductSpecificationsSchema,
  VariantAttributesSchema,
  VerifiedIdentifiersSchema,
} from "./product-attributes";

/**
 * Lo verificado que se puede publicar. Nunca lleva `verifiedBy`: quién
 * verificó es un dato del panel, no de la vidriera (ni de JSON-LD, ni del
 * feed, ni del payload que viaja al navegador). docs/TEMPLATE-IMPROVEMENT-PLAN.md E1.
 */
export function publicSpecifications(value: unknown) {
  const parsed = ProductSpecificationsSchema.safeParse(decoded(value));
  if (!parsed.success || !parsed.data.verifiedAt) return undefined;
  const { verifiedBy, ...publico } = parsed.data;
  void verifiedBy;
  return publico;
}
export function publicVariantAttributes(value: unknown) {
  const parsed = VariantAttributesSchema.safeParse(decoded(value));
  if (!parsed.success || !parsed.data.verifiedAt) return undefined;
  const { verifiedBy, ...publico } = parsed.data;
  void verifiedBy;
  return publico;
}
export function publicIdentifiers(value: unknown) {
  const parsed = VerifiedIdentifiersSchema.safeParse(decoded(value));
  if (!parsed.success) return undefined;
  const { verifiedBy, ...publico } = parsed.data;
  void verifiedBy;
  return publico;
}
