import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { categories, productImages, products, variants } from "@/db/schema";

import type { Executor } from "@/domain/executor";
import { heldQtyMap } from "@/domain/stock";

export type CatalogVariant = {
  id: number;
  sku: string;
  label: string;
  pricePyg: number;
  compareAtPyg: number | null;
  available: number;
};

export type CatalogImage = {
  cloudinaryId: string;
  blurDataUrl: string | null;
  alt: string | null;
};

export type CatalogProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string | null;
  ivaRate: number;
  categoryName: string;
  categorySlug: string;
  image: CatalogImage | null;
  variants: CatalogVariant[];
};

export type CatalogProductDetail = CatalogProduct & {
  description: string | null;
  images: CatalogImage[];
};

const PUBLISHED = () => and(eq(products.isActive, true), isNotNull(products.publishedAt));

export type CatalogSort = "relevancia" | "precio-asc" | "precio-desc" | "nuevos";

export const CATALOG_SORTS: CatalogSort[] = ["relevancia", "precio-asc", "precio-desc", "nuevos"];

export function isCatalogSort(value: string | undefined): value is CatalogSort {
  return value !== undefined && (CATALOG_SORTS as string[]).includes(value);
}

/** Precio mínimo por producto — es el número por el que la gente ordena y filtra. */
const minPriceSql = sql<number>`MIN(${variants.pricePyg})`;

type ProductRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  ivaRate: number;
  categoryName: string;
  categorySlug: string;
};

/**
 * Completa cada producto con su imagen principal, sus variantes y la
 * disponibilidad en vivo. Tres queries acotadas por ids, no N+1.
 */
async function hydrate(tx: Executor, rows: ProductRow[]): Promise<CatalogProduct[]> {
  if (rows.length === 0) return [];
  const productIds = rows.map((row) => row.id);

  const variantRows = await tx
    .select({
      id: variants.id,
      productId: variants.productId,
      sku: variants.sku,
      label: variants.label,
      pricePyg: variants.pricePyg,
      compareAtPyg: variants.compareAtPyg,
      onHand: variants.onHand,
    })
    .from(variants)
    .where(and(eq(variants.isActive, true), inArray(variants.productId, productIds)))
    .orderBy(asc(variants.productId), asc(variants.position));

  const imageRows = await tx
    .select({
      productId: productImages.productId,
      cloudinaryId: productImages.cloudinaryId,
      blurDataUrl: productImages.blurDataUrl,
      alt: productImages.alt,
      position: productImages.position,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.productId), asc(productImages.position));

  const held = await heldQtyMap(
    variantRows.map((row) => row.id),
    tx
  );

  const variantsByProduct = new Map<number, CatalogVariant[]>();
  for (const row of variantRows) {
    const list = variantsByProduct.get(row.productId) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      label: row.label,
      pricePyg: row.pricePyg,
      compareAtPyg: row.compareAtPyg,
      available: Math.max(0, row.onHand - (held.get(row.id) ?? 0)),
    });
    variantsByProduct.set(row.productId, list);
  }

  const imagesByProduct = new Map<number, CatalogImage[]>();
  for (const row of imageRows) {
    const list = imagesByProduct.get(row.productId) ?? [];
    list.push({ cloudinaryId: row.cloudinaryId, blurDataUrl: row.blurDataUrl, alt: row.alt });
    imagesByProduct.set(row.productId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    ivaRate: row.ivaRate,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    image: imagesByProduct.get(row.id)?.[0] ?? null,
    variants: variantsByProduct.get(row.id) ?? [],
  }));
}

const PRODUCT_COLUMNS = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  description: products.description,
  brand: products.brand,
  ivaRate: products.ivaRate,
  categoryName: categories.name,
  categorySlug: categories.slug,
} as const;

/** Catálogo completo (home / demo). */
export async function getCatalog(
  options: { categorySlug?: string; limit?: number } = {},
  executor?: Executor
): Promise<CatalogProduct[]> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select(PRODUCT_COLUMNS)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(PUBLISHED(), options.categorySlug ? eq(categories.slug, options.categorySlug) : undefined))
    .orderBy(asc(categories.position), asc(products.name))
    .limit(options.limit ?? 100);

  return hydrate(tx, rows);
}

export type CategoryQuery = {
  categorySlug: string;
  brand?: string;
  minPricePyg?: number;
  maxPricePyg?: number;
  sort?: CatalogSort;
  page?: number;
  perPage?: number;
};

export type PagedProducts = {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

/**
 * Listado de categoría con filtros, orden y paginación — todo server-side.
 * Se agrupa por producto para poder filtrar y ordenar por el precio mínimo
 * de sus variantes sin traer el catálogo entero a memoria.
 */
export async function getCategoryProducts(
  query: CategoryQuery,
  executor?: Executor
): Promise<PagedProducts> {
  const tx = executor ?? getDb();
  const page = Math.max(1, query.page ?? 1);
  const perPage = Math.min(60, Math.max(1, query.perPage ?? 12));

  const filters = and(
    PUBLISHED(),
    eq(categories.slug, query.categorySlug),
    query.brand ? eq(products.brand, query.brand) : undefined
  );

  const havingParts = [
    query.minPricePyg !== undefined ? gte(minPriceSql, query.minPricePyg) : undefined,
    query.maxPricePyg !== undefined ? lte(minPriceSql, query.maxPricePyg) : undefined,
  ].filter(Boolean);
  const having = havingParts.length > 0 ? and(...havingParts) : undefined;

  const orderBy = (() => {
    switch (query.sort) {
      case "precio-asc":
        return asc(minPriceSql);
      case "precio-desc":
        return desc(minPriceSql);
      case "nuevos":
        return desc(products.publishedAt);
      default:
        return asc(products.name);
    }
  })();

  const grouped = tx
    .select({ ...PRODUCT_COLUMNS, minPrice: minPriceSql })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(variants, and(eq(variants.productId, products.id), eq(variants.isActive, true)))
    .where(filters)
    .groupBy(products.id, categories.name, categories.slug);

  const rows = await (having ? grouped.having(having) : grouped)
    .orderBy(orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const counted = tx
    .select({ id: products.id })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(variants, and(eq(variants.productId, products.id), eq(variants.isActive, true)))
    .where(filters)
    .groupBy(products.id);
  const total = (await (having ? counted.having(having) : counted)).length;

  return {
    products: await hydrate(tx, rows),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getProductBySlug(
  slug: string,
  executor?: Executor
): Promise<CatalogProductDetail | null> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select(PRODUCT_COLUMNS)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(PUBLISHED(), eq(products.slug, slug)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [hydrated] = await hydrate(tx, [row]);
  if (!hydrated) return null;

  const images = await tx
    .select({
      cloudinaryId: productImages.cloudinaryId,
      blurDataUrl: productImages.blurDataUrl,
      alt: productImages.alt,
    })
    .from(productImages)
    .where(eq(productImages.productId, row.id))
    .orderBy(asc(productImages.position));

  return { ...hydrated, description: row.description, images };
}

/**
 * Búsqueda con el índice FULLTEXT de `products`.
 *
 * En modo booleano con `*` para que "auricu" encuentre "auriculares", con
 * fallback a LIKE: los términos de menos de 4 caracteres caen bajo
 * `ft_min_word_len` y FULLTEXT los ignora, cosa que en un catálogo con
 * "gorra" o "jean" se nota enseguida.
 */
export async function searchProducts(
  term: string,
  options: { limit?: number } = {},
  executor?: Executor
): Promise<CatalogProduct[]> {
  const tx = executor ?? getDb();
  const cleaned = term.trim().replace(/[+\-><()~*"@]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) return [];

  const limit = options.limit ?? 40;
  const booleanTerm = cleaned
    .split(" ")
    .map((word) => `${word}*`)
    .join(" ");

  const matched = await tx
    .select(PRODUCT_COLUMNS)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        PUBLISHED(),
        sql`MATCH(${products.name}, ${products.description}) AGAINST (${booleanTerm} IN BOOLEAN MODE)`
      )
    )
    .limit(limit);

  if (matched.length > 0) return hydrate(tx, matched);

  const like = `%${cleaned}%`;
  const fallback = await tx
    .select(PRODUCT_COLUMNS)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(PUBLISHED(), sql`(${products.name} LIKE ${like} OR ${products.brand} LIKE ${like})`)
    )
    .limit(limit);

  return hydrate(tx, fallback);
}

export async function getCategories(executor?: Executor) {
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position));
}

export async function getCategoryBySlug(slug: string, executor?: Executor) {
  const tx = executor ?? getDb();
  const rows = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.isActive, true), eq(categories.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

/** Marcas presentes en una categoría, para el filtro. */
export async function getBrands(categorySlug: string, executor?: Executor): Promise<string[]> {
  const tx = executor ?? getDb();
  const rows = await tx
    .selectDistinct({ brand: products.brand })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(PUBLISHED(), eq(categories.slug, categorySlug), isNotNull(products.brand)))
    .orderBy(asc(products.brand));

  return rows.map((row) => row.brand).filter((brand): brand is string => Boolean(brand));
}
