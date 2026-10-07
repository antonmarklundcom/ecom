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
/**
 * Todos los filtros puestos en una categoría: con esto se condiciona cada
 * conteo de las opciones (docs/TEMPLATE-IMPROVEMENT-PLAN.md F4). Un conteo
 * dice cuántos productos quedarían si se elige esa opción **además** de las
 * otras; la opción misma no se condiciona a sí misma.
 */
export type CatalogueFilterContext = CatalogueAttributeFilters & {
  brand?: string;
  minPricePyg?: number;
  maxPricePyg?: number;
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

/**
 * El precio "desde" de un producto, como el de `getCategoryProducts`
 * (`minPriceSql`), pero por fila de producto: sirve en un WHERE o adentro de
 * un conteo, sin agrupar la consulta de afuera.
 */
export function productMinPriceSql(): SQL<number | null> {
  return sql<number | null>`(SELECT MIN(CASE WHEN ${products.showPrice} AND fv.price_pyg > 0 THEN fv.price_pyg ELSE NULL END)
    FROM ${variants} AS fv WHERE fv.product_id = ${products.id} AND fv.is_active = TRUE)`;
}

/** El rango de precio de la URL, con la misma regla que el listado. */
export function priceRangePredicate(
  minPricePyg: number | undefined,
  maxPricePyg: number | undefined
): SQL | undefined {
  return and(
    minPricePyg !== undefined
      ? sql`${productMinPriceSql()} >= ${minPricePyg}`
      : undefined,
    maxPricePyg !== undefined
      ? sql`${productMinPriceSql()} <= ${maxPricePyg}`
      : undefined
  );
}

/**
 * Lo que un producto tiene que cumplir para entrar con estos filtros, sin
 * los que se nombran en `omit` (el conteo de una opción no se condiciona a
 * sí mismo).
 */
export function catalogueContextPredicate(
  context: CatalogueFilterContext,
  omit: { brand?: boolean; attribute?: string } = {}
): SQL | undefined {
  if (context.invalid) return sql`FALSE`;
  const attributes = { ...context.attributes };
  if (omit.attribute) delete attributes[omit.attribute];
  return and(
    !omit.brand && context.brand
      ? eq(products.brand, context.brand)
      : undefined,
    priceRangePredicate(context.minPricePyg, context.maxPricePyg),
    catalogueAttributePredicate({ attributes, inStock: context.inStock })
  );
}

/**
 * Las opciones de cada atributo filtrable de la categoría, con su conteo
 * condicionado a los demás filtros puestos (F4). Las opciones salen de toda
 * la categoría —una con 0 sigue en la lista, para que se vea qué hay y qué
 * no con esta combinación—; el conteo, de los filtros.
 *
 * Para un atributo de **variante** (talle), la misma variante tiene que
 * cumplir los otros atributos de variante y el stock: un producto con S sin
 * stock y M con stock no cuenta para "S" con "con stock" puesto, porque
 * elegirlo no devolvería nada.
 */
export async function getCatalogueFacets(
  categorySlug: string,
  context: CatalogueFilterContext = {},
  executor?: Executor
): Promise<CatalogueFacet[]> {
  const tx = executor ?? getDb();
  const definitions = filterDefinitions();
  return Promise.all(
    definitions.map(async (definition) => {
      const value = attribute(definition);
      let condition: SQL | undefined;
      if (context.invalid) {
        condition = sql`FALSE`;
      } else if (definition.scope === "product") {
        condition = catalogueContextPredicate(context, {
          attribute: definition.key,
        });
      } else {
        // Los atributos de producto, la marca y el precio, sobre el producto;
        // los de variante y el stock, sobre **esta** variante.
        const productScope: Record<string, string> = {};
        const variantScope: SQL[] = [];
        for (const [key, selected] of Object.entries(
          context.attributes ?? {}
        )) {
          if (key === definition.key) continue;
          const other = definitions.find((d) => d.key === key);
          if (!other) {
            variantScope.push(sql`FALSE`);
          } else if (other.scope === "product") {
            productScope[key] = selected;
          } else {
            variantScope.push(
              and(verified(source(other)), eq(attribute(other), selected))!
            );
          }
        }
        condition = and(
          context.brand ? eq(products.brand, context.brand) : undefined,
          priceRangePredicate(context.minPricePyg, context.maxPricePyg),
          catalogueAttributePredicate({ attributes: productScope }),
          ...variantScope,
          context.inStock
            ? sql`${products.saleMode} = 'stock' AND ${products.showPrice} = TRUE AND ${liveStock()}`
            : undefined
        );
      }
      const total = condition
        ? sql<number>`COUNT(DISTINCT CASE WHEN ${condition} THEN ${products.id} END)`
        : countDistinct(products.id);
      const rows = await tx
        .select({ value, total })
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
