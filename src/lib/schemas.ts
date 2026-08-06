import { z } from "zod";

/**
 * Un ítem del carrito, tal como lo envía el navegador. El servidor
 * ignora el precio del cliente y vuelve a calcular todo desde la DB
 * (ver README.md, "El navegador nunca decide precios ni stock").
 */
export const CartItemSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().positive(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const DocTypeSchema = z.enum(["RUC", "CI", "NINGUNO"]);

// Los valores tienen que coincidir con el ENUM payment_method de
// src/db/schema.ts o el insert falla: "contra_entrega", no "efectivo".
export const PaymentMethodSchema = z.enum([
  "transferencia",
  "contra_entrega",
  "tarjeta",
]);

/**
 * Input de POST /api/orders. Los montos (subtotal, envío, total) NO
 * viajan acá — se recalculan en el servidor a partir de `items`.
 */
export const CheckoutInputSchema = z
  .object({
    items: z.array(CartItemSchema).min(1),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: z.string().regex(/^\+5959\d{8}$/, "Formato +5959XXXXXXXX"),
    customerEmail: z.email().nullable().optional(),
    docType: DocTypeSchema,
    docNumber: z.string().trim().min(1).max(20),
    isConsumidorFinal: z.boolean(),
    shipCity: z.string().trim().min(1).max(120),
    shipBarrio: z.string().trim().min(1).max(120),
    shipAddress: z.string().trim().min(1).max(255),
    shipReference: z.string().trim().max(255).nullable().optional(),
    shipMapsUrl: z.url().nullable().optional(),
    paymentMethod: PaymentMethodSchema,
  })
  .refine(
    (data) => data.docType === "NINGUNO" || data.docNumber.length > 0,
    { message: "doc_number es requerido salvo doc_type=NINGUNO", path: ["docNumber"] }
  );

export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

/**
 * Input del panel admin para crear/editar un producto. Los precios son
 * enteros en guaraníes, IVA incluido — nunca float, nunca string con
 * decimales.
 */
export const AdminProductInput = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug debe ser kebab-case"),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  categoryId: z.number().int().positive(),
  ivaRate: z.union([z.literal(10), z.literal(5), z.literal(0)]),
  publishedAt: z.date().nullable().optional(),
  images: z
    .array(
      z.object({
        cloudinaryId: z.string().trim().min(1),
        sortOrder: z.number().int().nonnegative(),
      })
    )
    .default([]),
  variants: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        pricePyg: z.number().int().nonnegative(),
        onHand: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

export type AdminProductInput = z.infer<typeof AdminProductInput>;
