import {
  decoded,
  ProductSpecificationsSchema,
  VariantAttributesSchema,
  VerifiedIdentifiersSchema,
} from "./product-attributes";

export function publicSpecifications(value: unknown) {
  const parsed = ProductSpecificationsSchema.safeParse(decoded(value));
  return parsed.success && parsed.data.verifiedAt ? parsed.data : undefined;
}
export function publicVariantAttributes(value: unknown) {
  const parsed = VariantAttributesSchema.safeParse(decoded(value));
  return parsed.success && parsed.data.verifiedAt ? parsed.data : undefined;
}
export function publicIdentifiers(value: unknown) {
  const parsed = VerifiedIdentifiersSchema.safeParse(decoded(value));
  return parsed.success ? parsed.data : undefined;
}
