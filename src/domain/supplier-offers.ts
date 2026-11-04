import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  SUPPLIER_SOURCE_TYPES,
  products,
  supplierOffers,
  variants,
} from "@/db/schema";

import { t, type MessageKey, type Params } from "@/i18n";
import { parsePyDateInput } from "@/lib/py";

import { DomainError } from "./errors";
import type { Executor } from "./executor";

/**
 * Ofertas de proveedores por variante (dropshipping, mayoristas, importación).
 *
 * **Datos privados de compras.** Contestan "a quién se lo compro y a cuánto",
 * no "qué vendo": no tocan `on_hand`, ni reservas, ni pedidos, ni precios. Un
 * `supplier_stock` es lo que el proveedor dijo tener al mirarlo, nunca stock
 * vendible. Por eso este módulo no importa nada de `stock.ts`, `orders.ts` ni
 * `transitionOrder`, y nada de la vidriera lo importa a él
 * (`tests/unit/proveedores-privados.test.ts`).
 *
 * Sólo el panel llega acá, por `src/app/actions/admin-products.ts`, que mira
 * el guard de staff y el flag `proveedores` (`src/lib/proveedores.ts`) antes
 * de llamar. El dominio no lee el flag: con la tabla vacía no hay nada que
 * decidir.
 */

export type SupplierOffer = typeof supplierOffers.$inferSelect;

/**
 * Lo que el panel le muestra al dueño cuando una oferta no se puede guardar.
 * Clase propia y no `AdminInputError` para que `admin-products.ts` pueda usar
 * `enlaceProveedor` sin un import circular.
 */
export class SupplierOfferError extends DomainError {
  constructor(code: MessageKey, params?: Params) {
    super(code, params);
    this.name = "SupplierOfferError";
  }
}

/** El techo de `INT UNSIGNED`, la columna de `supplier_stock`. */
const INT_UNSIGNED_MAX = 4_294_967_295;

/**
 * Un enlace de proveedor: `https://` y sin usuario ni contraseña adentro.
 *
 * Sólo https porque se abre desde el panel con la sesión del dueño puesta, y
 * un `javascript:` o un `http://` pegado de una planilla no tiene por qué
 * llegar a un `href`. Las credenciales en la URL (`https://user:pass@…`) se
 * rechazan en vez de guardarse: serían un secreto en texto plano en la base y
 * en cada backup.
 */
export function enlaceProveedor(value: string | null | undefined): string | null {
  const texto = value?.trim() ?? "";
  if (texto === "") return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new SupplierOfferError("adminError.proveedores.enlaceInvalido");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new SupplierOfferError("adminError.proveedores.enlaceInvalido");
  const normalizado = url.toString();
  if (normalizado.length > 2048)
    throw new SupplierOfferError("adminError.proveedores.enlaceInvalido");
  return normalizado;
}

/** Lo mismo como schema de zod, para validar el input de una acción. */
export const SupplierLinkSchema = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .optional()
  .refine((value) => {
    try {
      enlaceProveedor(value);
      return true;
    } catch {
      return false;
    }
  }, t("adminError.proveedores.enlaceInvalido"));

/**
 * Lo que manda el editor de ofertas. `offerId` ausente = oferta nueva.
 *
 * El costo es entero en guaraníes (el guaraní no tiene céntimos) y puede ir
 * vacío: "todavía no sé cuánto sale" es un estado legítimo de una oferta que
 * se está comparando. Lo que no puede es ser la preferida —la que se usa para
 * el margen— sin costo, sin confirmar o inactiva.
 */
export const SupplierOfferInputSchema = z
  .object({
    productId: z.number().int().positive(),
    variantId: z.number().int().positive(),
    offerId: z.number().int().positive().optional(),
    unitCostPyg: z
      .number()
      .int(t("adminError.proveedores.costoEntero"))
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    source: z
      .string()
      .trim()
      .min(1, t("adminError.proveedores.sinNombre"))
      .max(200),
    sourceType: z.enum(SUPPLIER_SOURCE_TYPES),
    productUrl: SupplierLinkSchema,
    supplierUrl: SupplierLinkSchema,
    supplierStock: z
      .number()
      .int()
      .nonnegative()
      .max(INT_UNSIGNED_MAX)
      .nullable(),
    /**
     * El día en que se miraron costo y stock, `"2026-11-04"` (lo que manda un
     * `<input type="date">`), en hora paraguaya. Vacío = no se sabe.
     */
    checkedOn: z
      .string()
      .trim()
      .refine((value) => value === "" || parsePyDateInput(value) !== null)
      .nullable()
      .optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    isConfirmed: z.boolean(),
    isActive: z.boolean(),
    isPreferred: z.boolean(),
  })
  .refine(
    (offer) =>
      !offer.isPreferred ||
      (offer.isConfirmed && offer.isActive && offer.unitCostPyg !== null),
    {
      message: t("adminError.proveedores.preferidoIncompleto"),
      path: ["isPreferred"],
    }
  );

export type SupplierOfferInput = z.infer<typeof SupplierOfferInputSchema>;

/** Las ofertas de estas variantes, en el orden en que se cargaron. Sólo panel. */
export async function listSupplierOffers(
  variantIds: readonly number[],
  executor?: Executor
): Promise<SupplierOffer[]> {
  if (variantIds.length === 0) return [];
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(supplierOffers)
    .where(inArray(supplierOffers.variantId, [...variantIds]))
    .orderBy(asc(supplierOffers.variantId), asc(supplierOffers.id));
}

/**
 * La variante, bloqueada, y que sea de este producto. Primero el producto y
 * después la variante: el mismo orden de bloqueo que `saveVariant`, así dos
 * guardados del mismo producto no se cruzan en un deadlock.
 */
async function lockVariant(
  tx: Executor,
  productId: number,
  variantId: number
): Promise<void> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)
    .for("update");
  if (!product) throw new SupplierOfferError("adminError.producto.noExiste");
  const [variant] = await tx
    .select({ id: variants.id })
    .from(variants)
    .where(and(eq(variants.id, variantId), eq(variants.productId, productId)))
    .limit(1)
    .for("update");
  if (!variant) throw new SupplierOfferError("adminError.producto.varianteNoExiste");
}

async function assertOfferOfVariant(
  tx: Executor,
  variantId: number,
  offerId: number
): Promise<void> {
  const [existing] = await tx
    .select({ id: supplierOffers.id })
    .from(supplierOffers)
    .where(
      and(eq(supplierOffers.id, offerId), eq(supplierOffers.variantId, variantId))
    )
    .limit(1);
  if (!existing) throw new SupplierOfferError("adminError.proveedores.noExiste");
}

/**
 * Alta o edición de una oferta. Devuelve su id.
 *
 * Marcar una como preferida desmarca las otras de la misma variante en la
 * misma transacción: "el proveedor de esta variante" es uno solo, y dos
 * preferidas harían que el margen dependa del orden de las filas.
 */
export async function saveSupplierOffer(
  input: SupplierOfferInput,
  executor?: Executor
): Promise<number> {
  if (!executor)
    return getDb().transaction((tx) => saveSupplierOffer(input, tx));
  const tx = executor;
  const parsed = SupplierOfferInputSchema.safeParse(input);
  if (!parsed.success)
    throw new SupplierOfferError("adminError.proveedores.invalida");
  const offer = parsed.data;

  await lockVariant(tx, offer.productId, offer.variantId);
  if (offer.offerId !== undefined)
    await assertOfferOfVariant(tx, offer.variantId, offer.offerId);

  const values = {
    unitCostPyg: offer.unitCostPyg,
    source: offer.source,
    sourceType: offer.sourceType,
    productUrl: enlaceProveedor(offer.productUrl),
    supplierUrl: enlaceProveedor(offer.supplierUrl),
    supplierStock: offer.supplierStock,
    checkedAt: parsePyDateInput(offer.checkedOn),
    notes: offer.notes?.trim() || null,
    isConfirmed: offer.isConfirmed,
    isActive: offer.isActive,
    isPreferred: offer.isPreferred,
  };

  if (offer.isPreferred)
    await tx
      .update(supplierOffers)
      .set({ isPreferred: false })
      .where(eq(supplierOffers.variantId, offer.variantId));

  if (offer.offerId === undefined) {
    const [result] = await tx
      .insert(supplierOffers)
      .values({ ...values, variantId: offer.variantId });
    return Number(result.insertId);
  }

  await tx
    .update(supplierOffers)
    .set(values)
    .where(
      and(
        eq(supplierOffers.id, offer.offerId),
        eq(supplierOffers.variantId, offer.variantId)
      )
    );
  return offer.offerId;
}

/** Borrar una oferta (la cargada por error). Las demás de la variante quedan. */
export async function deleteSupplierOffer(
  input: { productId: number; variantId: number; offerId: number },
  executor?: Executor
): Promise<void> {
  if (!executor)
    return getDb().transaction((tx) => deleteSupplierOffer(input, tx));
  const tx = executor;
  await lockVariant(tx, input.productId, input.variantId);
  await assertOfferOfVariant(tx, input.variantId, input.offerId);
  await tx
    .delete(supplierOffers)
    .where(
      and(
        eq(supplierOffers.id, input.offerId),
        eq(supplierOffers.variantId, input.variantId)
      )
    );
}
