import { z } from 'zod';

import { DOC_TYPES, IVA_RATES, PAYMENT_METHODS } from '@/db/schema';
import { normalizePhonePY, validateCi, validateRuc } from './py';

/** Guaraníes: entero, no negativo, sin decimales. */
export const GsSchema = z
  .number()
  .int('Los montos en guaraníes son enteros')
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const CartItemSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.array(CartItemSchema).min(1).max(50);

export const PhonePYSchema = z
  .string()
  .transform((value) => normalizePhonePY(value))
  .refine((value): value is string => value !== null, {
    message: 'Número de teléfono paraguayo inválido',
  });

/**
 * Datos del checkout. El carrito que viene acá es una **lista de deseos**: el
 * servidor vuelve a leer precios y stock de la DB antes de crear el pedido.
 */
export const CheckoutInputSchema = z
  .object({
    customerName: z.string().trim().min(3).max(160),
    customerPhone: PhonePYSchema,
    customerEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
    docType: z.enum(DOC_TYPES),
    docNumber: z.string().trim().max(32).optional(),
    isConsumidorFinal: z.boolean().default(true),
    shipCity: z.string().trim().min(2).max(120),
    shipBarrio: z.string().trim().max(120).optional(),
    shipAddress: z.string().trim().min(5).max(255),
    shipReference: z.string().trim().max(255).optional(),
    shipMapsUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
    paymentMethod: z.enum(PAYMENT_METHODS),
    items: CartSchema,
  })
  .superRefine((value, ctx) => {
    if (value.docType === 'NINGUNO') return;

    const result = value.docType === 'RUC' ? validateRuc(value.docNumber ?? '') : validateCi(value.docNumber ?? '');
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docNumber'],
        message: value.docType === 'RUC' ? `RUC inválido: ${result.reason}` : `CI inválida: ${result.reason}`,
      });
    }
  });
export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

export const AdminProductInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido (usá minúsculas y guiones)'),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  categoryId: z.number().int().positive(),
  brand: z.string().trim().max(120).optional(),
  ivaRate: z.union([z.literal(IVA_RATES[0]), z.literal(IVA_RATES[1]), z.literal(IVA_RATES[2])]),
  isActive: z.boolean().default(true),
  variants: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(120),
        pricePyg: GsSchema.refine((v) => v > 0, 'El precio tiene que ser mayor a cero'),
        compareAtPyg: GsSchema.optional(),
        onHand: z.number().int().min(0).max(1_000_000),
        isActive: z.boolean().default(true),
      }),
    )
    .min(1),
});
export type AdminProductInput = z.infer<typeof AdminProductInputSchema>;
