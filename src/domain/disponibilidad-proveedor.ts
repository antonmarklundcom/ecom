import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { supplierOffers } from "@/db/schema";

import {
  disponibilidadPorVariante,
  type DisponibilidadDelProducto,
  type StockExterno,
} from "./disponibilidad";
import type { Executor } from "./executor";
import { saleModeEfectivo, type ModoVenta, type SaleMode } from "./modo-venta";

/**
 * La disponibilidad de un producto de la vidriera (`src/domain/disponibilidad.ts`),
 * con el dato de proveedor leído de la base cuando hace falta: `proveedores`
 * prendido y el producto en consulta. Sin eso, no toca la base.
 *
 * Sólo cuenta la oferta **preferida, activa y confirmada**: la que el dueño
 * eligió como "el proveedor de esta variante". De la fila se leen dos campos
 * (stock y cuándo se miró) y se devuelve **sólo la palabra**: ni el nombre del
 * proveedor, ni el costo, ni el número, ni la fecha salen de acá
 * (`tests/unit/proveedores-privados.test.ts`, `tests/unit/disponibilidad.test.ts`).
 */
export async function disponibilidadDelProducto(
  product: {
    saleMode?: SaleMode;
    variants: readonly { id: number; sku: string; available: number }[];
  },
  opciones: {
    modo: ModoVenta;
    proveedores: boolean;
    ahora?: Date;
    executor?: Executor;
  }
): Promise<DisponibilidadDelProducto> {
  const enConsulta =
    saleModeEfectivo(product.saleMode, opciones.modo) === "enquiry";
  const externos =
    opciones.proveedores && enConsulta
      ? await leerStockExterno(
          product.variants.map((variant) => variant.id),
          opciones.executor
        )
      : undefined;
  return disponibilidadPorVariante(product, {
    modo: opciones.modo,
    externos,
    ahora: opciones.ahora,
  });
}

async function leerStockExterno(
  variantIds: readonly number[],
  executor?: Executor
): Promise<Map<number, StockExterno>> {
  if (variantIds.length === 0) return new Map();
  const tx = executor ?? getDb();
  const filas = await tx
    .select({
      variantId: supplierOffers.variantId,
      stock: supplierOffers.supplierStock,
      miradoEl: supplierOffers.checkedAt,
    })
    .from(supplierOffers)
    .where(
      and(
        inArray(supplierOffers.variantId, [...variantIds]),
        eq(supplierOffers.isPreferred, true),
        eq(supplierOffers.isActive, true),
        eq(supplierOffers.isConfirmed, true)
      )
    );
  return new Map(
    filas.map((fila) => [
      fila.variantId,
      { stock: fila.stock, miradoEl: fila.miradoEl },
    ])
  );
}
