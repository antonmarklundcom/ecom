import { z } from "zod";

import { IMAGE_PROVENANCES } from "@/db/enums";

const optionalText = (length: number) =>
  z.string().trim().min(1).max(length).optional();
export const VerificationDateSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Date.parse(value) <= Date.now(),
    "La verificación no puede tener una fecha futura."
  )
  .transform((value) => new Date(value).toISOString());
/**
 * Quién verificó (lo sella el servidor, ver `src/lib/verification-stamps.ts`).
 * Privado: las proyecciones públicas lo sacan siempre.
 */
export const VerifiedBySchema = z
  .object({
    userId: z.number().int().positive().nullable(),
    label: z.string().trim().min(1).max(120),
  })
  .strict();
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
    verifiedBy: VerifiedBySchema.optional(),
    unit: optionalText(80),
    values: AttributeValuesSchema.optional(),
  })
  .strict();
/** Admin/import only; public queries never select this object. */
export const SupplierDetailsSchema = z
  .object({
    reference: optionalText(160),
    // `z.url` con el protocolo adentro: un `.refine(new URL(...))` después de
    // `z.url()` corría igual con un valor inválido y tiraba `TypeError` en vez
    // de devolver el error de validación (docs/TEMPLATE-IMPROVEMENT-PLAN.md E4).
    sourceUrl: z
      .url({ protocol: /^https$/, error: "Usá una URL HTTPS." })
      .max(2000)
      .optional(),
    verifiedAt: VerificationDateSchema.optional(),
    verifiedBy: VerifiedBySchema.optional(),
    /**
     * La procedencia de **todas** las fotos del producto. Cada foto puede
     * tener la suya (`product_images.provenance`), que manda sobre esta.
     */
    imageProvenance: z.enum(IMAGE_PROVENANCES).optional(),
  })
  .strict();
export const VariantAttributesSchema = z
  .object({
    verifiedAt: VerificationDateSchema.optional(),
    verifiedBy: VerifiedBySchema.optional(),
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
const IdentifiersShape = {
  gtin: z
    .string()
    .trim()
    .refine(
      validGtin,
      "El GTIN debe tener longitud y dígito verificador válidos."
    )
    .optional(),
  mpn: optionalText(120),
};
const conAlgunIdentificador = (value: { gtin?: string; mpn?: string }) =>
  Boolean(value.gtin || value.mpn);
/**
 * Lo que se carga en el panel: GTIN o MPN, sin sellos. El sello lo pone el
 * servidor al confirmar (`src/lib/verification-stamps.ts`).
 */
export const IdentifiersInputSchema = z
  .object(IdentifiersShape)
  .strict()
  .refine(conAlgunIdentificador, "Completá un GTIN o MPN verificado.");
export const VerifiedIdentifiersSchema = z
  .object({
    ...IdentifiersShape,
    verifiedAt: VerificationDateSchema,
    verifiedBy: VerifiedBySchema.optional(),
  })
  .strict()
  .refine(conAlgunIdentificador, "Completá un GTIN o MPN verificado.");

export type IdentifiersInput = z.infer<typeof IdentifiersInputSchema>;
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
