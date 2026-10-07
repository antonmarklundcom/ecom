import { z } from "zod";

const optionalText = (length: number) =>
  z.string().trim().min(1).max(length).optional();
export const VerificationDateSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Date.parse(value) <= Date.now(),
    "La verificación no puede tener una fecha futura."
  )
  .transform((value) => new Date(value).toISOString());
const key = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
export const AttributeValuesSchema = z
  .record(
    key,
    z.union([
      z.string().trim().min(1).max(160),
      z.number().finite(),
      z.boolean(),
    ])
  )
  .refine((value) => Object.keys(value).length <= 30, "Hasta 30 atributos.");

/** Store-defined facts, never inferred from a label, category or illustration. */
export const ProductSpecificationsSchema = z
  .object({
    verifiedAt: VerificationDateSchema.optional(),
    unit: optionalText(80),
    values: AttributeValuesSchema.optional(),
  })
  .strict();
/** Admin/import only; public queries never select this object. */
export const SupplierDetailsSchema = z
  .object({
    reference: optionalText(160),
    sourceUrl: z
      .url()
      .max(2000)
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Usá una URL HTTPS."
      )
      .optional(),
    verifiedAt: VerificationDateSchema.optional(),
    imageProvenance: z
      .enum(["supplier-authorized", "owned-photo", "illustrative"])
      .optional(),
  })
  .strict();
export const VariantAttributesSchema = z
  .object({
    verifiedAt: VerificationDateSchema.optional(),
    values: AttributeValuesSchema.optional(),
  })
  .strict();

export function validGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value))
    return false;
  let sum = 0;
  for (
    let index = value.length - 2, weight = 3;
    index >= 0;
    index--, weight = weight === 3 ? 1 : 3
  )
    sum += Number(value[index]) * weight;
  return (10 - (sum % 10)) % 10 === Number(value.at(-1));
}
export const VerifiedIdentifiersSchema = z
  .object({
    gtin: z
      .string()
      .trim()
      .refine(
        validGtin,
        "El GTIN debe tener longitud y dígito verificador válidos."
      )
      .optional(),
    mpn: optionalText(120),
    verifiedAt: VerificationDateSchema,
  })
  .strict()
  .refine(
    (value) => Boolean(value.gtin || value.mpn),
    "Completá un GTIN o MPN verificado."
  );

export type ProductSpecifications = z.infer<typeof ProductSpecificationsSchema>;
export type SupplierDetails = z.infer<typeof SupplierDetailsSchema>;
export type VariantAttributes = z.infer<typeof VariantAttributesSchema>;
export type VerifiedIdentifiers = z.infer<typeof VerifiedIdentifiersSchema>;

export function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
