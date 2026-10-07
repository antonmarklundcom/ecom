import {
  and,
  asc,
  countDistinct,
  eq,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { CATALOGUE, type AttributeDefinition } from "@/config/catalogue";
import { getDb } from "@/db";
import { categories, products, variants, stockReservations } from "@/db/schema";
import type { Executor } from "./executor";

export type CatalogueAttributeFilters = {
  attributes?: Record<string, string>;
  inStock?: boolean;
  invalid?: boolean;
};
export type CatalogueFacet = {
  key: string;
  label: string;
  values: { value: string; total: number }[];
};
export function filterDefinitions(
  definitions = CATALOGUE.attributes
): AttributeDefinition[] {
  const seen = new Set<string>();
  return definitions
    .filter((definition) => {
      if (
        !definition.filter ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(definition.key) ||
        seen.has(definition.key)
      )
        return false;
      seen.add(definition.key);
      return true;
    })
    .slice(0, 8);
}
export function parseCatalogueFilters(
  query: Record<string, string | string[] | undefined>,
  definitions = CATALOGUE.attributes
): CatalogueAttributeFilters {
  const allowed = new Set(
    filterDefinitions(definitions).map((definition) => definition.key)
  );
  const attributes: Record<string, string> = {};
  let invalid = false;
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("atributo.")) continue;
    const field = key.slice(9);
    if (
      !allowed.has(field) ||
      typeof value !== "string" ||
      value.length > 160 ||
      !value ||
      value !== value.trim()
    )
      invalid = true;
    else attributes[field] = value;
  }
  if (query.stock !== undefined && query.stock !== "" && query.stock !== "1")
    invalid = true;
  return { attributes, inStock: query.stock === "1", invalid };
}

/** Writes normalize timestamps to ISO UTC. Guard parsing before invoking engine date functions. */
function verified(source: SQL): SQL {
  const stamp = sql`JSON_UNQUOTE(JSON_EXTRACT(${source}, '$.verifiedAt'))`;
  const timestamp = sql`CASE WHEN ${stamp} REGEXP ${"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?Z$"}
    THEN CASE WHEN CAST(SUBSTRING(${stamp}, 9, 2) AS UNSIGNED) <= DAY(LAST_DAY(CONCAT(SUBSTRING(${stamp}, 1, 7), '-01')))
    THEN CASE WHEN LOCATE('.', ${stamp}) > 0
      THEN STR_TO_DATE(SUBSTRING(${stamp}, 1, CHAR_LENGTH(${stamp}) - 1), '%Y-%m-%dT%H:%i:%s.%f')
      ELSE STR_TO_DATE(SUBSTRING(${stamp}, 1, 19), '%Y-%m-%dT%H:%i:%s') END
    ELSE NULL END ELSE NULL END`;
  return sql`JSON_TYPE(JSON_EXTRACT(${source}, '$.verifiedAt')) = 'STRING' AND ${timestamp} <= UTC_TIMESTAMP(3)`;
}
function source(definition: AttributeDefinition): SQL {
  return definition.scope === "product"
    ? sql`${products.specifications}`
    : sql`${variants.attributes}`;
}
function attribute(definition: AttributeDefinition): SQL<string> {
  return sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${source(definition)}, ${`$.values.${definition.key}`}))`;
}
const liveStock =
  () => sql`${variants.isActive} = TRUE AND CAST(${variants.onHand} AS SIGNED) - CAST(COALESCE((
  SELECT SUM(${stockReservations.qty}) FROM ${stockReservations} WHERE ${stockReservations.variantId} = ${variants.id}
  AND ${stockReservations.state} = 'held' AND ${stockReservations.expiresAt} > UTC_TIMESTAMP()), 0) AS SIGNED) > 0`;

export function catalogueAttributePredicate(
  filters: CatalogueAttributeFilters
): SQL | undefined {
  if (filters.invalid) return sql`FALSE`;
  const predicates: SQL[] = [];
  const variantPredicates: SQL[] = [];
  for (const definition of filterDefinitions()) {
    const value = filters.attributes?.[definition.key];
    if (value === undefined) continue;
    const predicate = and(
      verified(source(definition)),
      eq(attribute(definition), value)
    )!;
    (definition.scope === "variant" ? variantPredicates : predicates).push(
      predicate
    );
  }
  // Direct callers cannot bypass the allowlist used by URL parsing.
  if (
    Object.keys(filters.attributes ?? {}).some(
      (key) => !filterDefinitions().some((definition) => definition.key === key)
    )
  )
    return sql`FALSE`;
  if (filters.inStock)
    predicates.push(
      sql`${products.saleMode} = 'stock' AND ${products.showPrice} = TRUE`
    );
  if (filters.inStock || variantPredicates.length)
    predicates.push(sql`EXISTS (SELECT 1 FROM ${variants}
    WHERE ${variants.productId} = ${products.id} AND ${variants.isActive} = TRUE
    ${variantPredicates.length ? sql`AND ${and(...variantPredicates)}` : sql``}
    ${filters.inStock ? sql`AND ${liveStock()}` : sql``})`);
  return predicates.length ? and(...predicates) : undefined;
}

export async function getCatalogueFacets(
  categorySlug: string,
  executor?: Executor
): Promise<CatalogueFacet[]> {
  const tx = executor ?? getDb();
  return Promise.all(
    filterDefinitions().map(async (definition) => {
      const value = attribute(definition);
      const rows = await tx
        .select({ value, total: countDistinct(products.id) })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .innerJoin(variants, eq(variants.productId, products.id))
        .where(
          and(
            eq(categories.slug, categorySlug),
            eq(categories.isActive, true),
            eq(products.isActive, true),
            isNotNull(products.publishedAt),
            eq(variants.isActive, true),
            verified(source(definition)),
            sql`JSON_TYPE(JSON_EXTRACT(${source(definition)}, ${`$.values.${definition.key}`})) IN ('STRING','INTEGER','DOUBLE','BOOLEAN')`,
            sql`CHAR_LENGTH(${value}) BETWEEN 1 AND 160`
          )
        )
        .groupBy(value)
        .orderBy(asc(value))
        .limit(100);
      return {
        key: definition.key,
        label: definition.label,
        values: rows.map((row) => ({
          value: row.value,
          total: Number(row.total),
        })),
      };
    })
  );
}
