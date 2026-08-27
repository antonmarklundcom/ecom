import { eq, inArray, sql } from "drizzle-orm";

import { categories, products, variants } from "@/db/schema";
import { getDb } from "@/db";
import { slugify } from "@/lib/slug";

import { parseCatalogo, type CatalogoProducto } from "./catalog-import";
import type { Executor } from "./executor";

/**
 * El mismo camino de `scripts/importar-productos.ts` (categoría por resolver,
 * SKU de quién es, plan de qué se va a escribir), pero como función que
 * también puede llamar `/admin/productos` y no sólo la CLI.
 *
 * El parseo (`parseCatalogo`) y la escritura (`upsertCatalogProducts`, en
 * `scripts/seed.ts`) siguen siendo los mismos de siempre — esto es sólo el
 * pegamento que mira la base para armar el plan y, si corresponde, aplicarlo.
 */

export type CatalogImportPlan = {
  productos: CatalogoProducto[];
  /** Parseo + conflictos de SKU. Si hay al menos uno, no se puede aplicar. */
  errores: string[];
  productosNuevos: number;
  productosActualizar: number;
  variantesNuevas: number;
  variantesActualizar: number;
  /** Nombre tal como vino en la planilla, para mostrarlo en la vista previa. */
  categoriasNuevas: string[];
  categoriaIdPorSlug: Map<string, number>;
};

/**
 * Arma el plan sin escribir nada: ensayo, igual que `importar-productos.ts`
 * sin `--aplicar`. `buildCatalogImportPlan` + `applyCatalogImportPlan` son dos
 * pasos separados a propósito, así el panel puede mostrar la vista previa y
 * recién escribir cuando alguien la confirma.
 */
export async function buildCatalogImportPlan(
  csvText: string,
  executor?: Executor,
): Promise<CatalogImportPlan> {
  const tx = executor ?? getDb();
  const { productos, errores: erroresParseo } = parseCatalogo(csvText);

  if (erroresParseo.length > 0) {
    return {
      productos: [],
      errores: erroresParseo,
      productosNuevos: 0,
      productosActualizar: 0,
      variantesNuevas: 0,
      variantesActualizar: 0,
      categoriasNuevas: [],
      categoriaIdPorSlug: new Map(),
    };
  }

  const categoryRows = await tx
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories);
  const categoriaPorSlug = new Map<string, number>();
  for (const row of categoryRows) {
    categoriaPorSlug.set(row.slug, row.id);
    categoriaPorSlug.set(slugify(row.name), row.id);
  }

  const categoriasNuevas = new Map<string, string>();
  for (const producto of productos) {
    const slug = slugify(producto.categoryName);
    if (!categoriaPorSlug.has(slug) && !categoriasNuevas.has(slug)) {
      categoriasNuevas.set(slug, producto.categoryName);
    }
  }

  // Un SKU que ya es de OTRO producto es un conflicto, no un update: ver el
  // comentario homólogo en `scripts/importar-productos.ts`.
  const skus = productos.flatMap((p) => p.variants.map((v) => v.sku));
  const skuRows = skus.length
    ? await tx
        .select({ sku: variants.sku, productSlug: products.slug })
        .from(variants)
        .innerJoin(products, eq(variants.productId, products.id))
        .where(inArray(variants.sku, skus))
    : [];
  const duenoDeSku = new Map(skuRows.map((row) => [row.sku, row.productSlug]));

  const errores: string[] = [];
  for (const producto of productos) {
    for (const variante of producto.variants) {
      const dueno = duenoDeSku.get(variante.sku);
      if (dueno !== undefined && dueno !== producto.slug) {
        errores.push(
          `El SKU "${variante.sku}" ya existe en la base y es del producto "${dueno}", no de "${producto.slug}". Cambiá el SKU o el slug en la planilla.`,
        );
      }
    }
  }
  if (errores.length > 0) {
    return {
      productos: [],
      errores,
      productosNuevos: 0,
      productosActualizar: 0,
      variantesNuevas: 0,
      variantesActualizar: 0,
      categoriasNuevas: [],
      categoriaIdPorSlug: new Map(),
    };
  }

  const slugsProductos = productos.map((p) => p.slug);
  const productosExistentes = new Set(
    (
      await tx
        .select({ slug: products.slug })
        .from(products)
        .where(inArray(products.slug, slugsProductos))
    ).map((row) => row.slug),
  );
  const productosNuevos = productos.filter((p) => !productosExistentes.has(p.slug)).length;
  const variantesTotal = skus.length;
  const variantesExistentes = duenoDeSku.size;

  return {
    productos,
    errores: [],
    productosNuevos,
    productosActualizar: productos.length - productosNuevos,
    variantesNuevas: variantesTotal - variantesExistentes,
    variantesActualizar: variantesExistentes,
    categoriasNuevas: [...categoriasNuevas.values()],
    categoriaIdPorSlug: categoriaPorSlug,
  };
}

/**
 * Crea las categorías que falten y devuelve el mapa de slug de categoría → id
 * actualizado, listo para armar los `CatalogProductUpsert` que espera
 * `upsertCatalogProducts`.
 */
export async function ensureCatalogCategories(
  plan: Pick<CatalogImportPlan, "productos" | "categoriaIdPorSlug">,
  executor?: Executor,
): Promise<Map<string, number>> {
  const tx = executor ?? getDb();
  const categoriaPorSlug = new Map(plan.categoriaIdPorSlug);

  const faltantes = new Map<string, string>();
  for (const producto of plan.productos) {
    const slug = slugify(producto.categoryName);
    if (!categoriaPorSlug.has(slug) && !faltantes.has(slug)) {
      faltantes.set(slug, producto.categoryName);
    }
  }
  if (faltantes.size === 0) return categoriaPorSlug;

  const maxPosition =
    (await tx.select({ max: sql<number>`COALESCE(MAX(${categories.position}), 0)` }).from(categories))[0]
      ?.max ?? 0;
  let position = maxPosition;
  for (const [slug, nombre] of faltantes) {
    position += 1;
    await tx
      .insert(categories)
      .values({ slug, name: nombre, position })
      .onDuplicateKeyUpdate({ set: { name: nombre, isActive: true } });
    const fila = (
      await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1)
    )[0];
    if (!fila) throw new Error(`No pude releer la categoría ${slug}`);
    categoriaPorSlug.set(slug, fila.id);
  }
  return categoriaPorSlug;
}
