"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { searchProducts } from "@/db/queries";
import { SUGGEST_LIMIT, SUGGEST_WINDOW_MS, clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Sugerencias del buscador mientras se escribe (PLAN.md FASE 2, PR N).
 *
 * Es de sólo lectura y usa el mismo `searchProducts()` que `/buscar`: la
 * sugerencia y el resultado del Enter tienen que ser la misma búsqueda, o el
 * comprador ve un producto en la lista desplegable y después no lo encuentra.
 *
 * Devuelve lo mínimo para dibujar una línea —nombre, slug, marca— y no el
 * producto entero con variantes e imágenes: esto se dispara con cada tecla.
 */

const TermSchema = z.string().min(2).max(80);

export type Suggestion = { slug: string; name: string; brand: string | null };

export async function sugerirProductos(term: unknown): Promise<Suggestion[]> {
  const parsed = TermSchema.safeParse(term);
  if (!parsed.success) return [];

  const ip = clientIp(await headers());
  if (!rateLimit(`sugerir:${ip}`, { limit: SUGGEST_LIMIT, windowMs: SUGGEST_WINDOW_MS }).ok) {
    // Sin error en pantalla: el formulario clásico sigue andando y el Enter
    // lleva a `/buscar` igual. Una sugerencia que no aparece no rompe nada.
    return [];
  }

  const products = await searchProducts(parsed.data, { limit: 6 });

  return products.map((product) => ({
    slug: product.slug,
    name: product.name,
    brand: product.brand,
  }));
}
