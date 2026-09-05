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
    // `.max()` a la medida de la columna (`customer_email varchar(200)`): sin él un
    // email largo pasa Zod y revienta en el INSERT — 500 en vez de error de validación.
    customerEmail: z.email().max(200).nullable().optional(),
    docType: DocTypeSchema,
    docNumber: z.string().trim().min(1).max(20),
    isConsumidorFinal: z.boolean(),
    shipCity: z.string().trim().min(1).max(120),
    shipBarrio: z.string().trim().min(1).max(120),
    shipAddress: z.string().trim().min(1).max(255),
    shipReference: z.string().trim().max(255).nullable().optional(),
    shipMapsUrl: z.url().max(500).nullable().optional(),
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
        cloudinaryId: z.string().trim().min(1).max(255),
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

/**
 * El seguimiento del envío que carga el panel al despachar (O5).
 *
 * Los tres campos son opcionales entre sí: una tienda que reparte en moto
 * propia despacha sin número de guía, y un courier chico no da link. Los
 * `.max()` son exactamente el largo de las columnas (`varchar(80)`, `(120)`,
 * `(500)`): sin ellos, un texto largo pasa Zod y revienta en el UPDATE, que
 * es un 500 en vez de un error de validación.
 *
 * `https://` obligatorio en la URL y no `z.url()` a secas: ese link se le
 * manda a la compradora por WhatsApp, y un `javascript:` o un `http://`
 * llegando desde el formulario del panel es exactamente lo que no queremos
 * pegar en un mensaje saliente.
 */
export const OrderTrackingSchema = z.object({
  carrier: z.string().trim().max(80).nullish(),
  code: z.string().trim().max(120).nullish(),
  url: z
    .url()
    .max(500)
    .refine((value) => value.startsWith("https://"), {
      message: "El link de seguimiento tiene que empezar con https://",
    })
    .nullish(),
});

export type OrderTrackingInput = z.infer<typeof OrderTrackingSchema>;

/**
 * Una nota interna del pedido (O5).
 *
 * 1..1000 y trimmed: el `.min(1)` corre **después** del trim, así que una
 * nota de puros espacios se rechaza en vez de guardar una fila vacía que
 * nadie puede borrar (la tabla es append-only).
 */
export const OrderNoteSchema = z.object({
  orderId: z.number().int().positive(),
  body: z.string().trim().min(1).max(1000),
});

export type OrderNoteInput = z.infer<typeof OrderNoteSchema>;
