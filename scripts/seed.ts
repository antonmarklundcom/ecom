import "@/lib/load-env";

import { eq, sql } from "drizzle-orm";

import { closePool, getDb } from "@/db";
import {
  categories,
  priceAdjustments,
  products,
  shippingZones,
  stockAdjustments,
  variants,
} from "@/db/schema";
import { assertGs } from "@/lib/money";
import { safeError } from "@/lib/safe-error";
import {
  ProductSpecificationsSchema,
  SupplierDetailsSchema,
  VariantAttributesSchema,
  VerifiedIdentifiersSchema,
  decoded,
  type IdentifiersInput,
  type ProductSpecifications,
  type SupplierDetails,
  type VariantAttributes,
  type VerifiedIdentifiers,
} from "@/lib/product-attributes";
import {
  assertActiveVariantsPriced,
  identificadoresSinVerificarError,
  preciosSoloDuenioError,
  skuAjenoError,
} from "@/domain/admin-products";
import { stampVerification } from "@/lib/verification-stamps";
import type { Executor } from "@/domain/executor";
import {
  assertProductSlugAvailable,
  claimProductSlug,
} from "@/domain/product-slugs";

import {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_SHIPPING_ZONES,
} from "./seed-data";

/**
 * Seed idempotente: se puede correr N veces.
 *
 * Las claves naturales son `slug` (categorías, productos, zonas) y `sku`
 * (variantes); todo entra con `ON DUPLICATE KEY UPDATE`, así que re-sembrar
 * actualiza precios y textos **sin** duplicar filas ni pisar `on_hand` de
 * variantes ya existentes… salvo que se pida con `--reset-stock`.
 */
const RESET_STOCK = process.argv.includes("--reset-stock");

/** Una zona tal como la escribe el seed o el cuerpo de `/api/setup/init`. */
export type SeedShippingZone = {
  slug: string;
  name: string;
  cities: readonly string[];
  pricePyg: number;
  freeThresholdPyg: number | null;
  position: number;
};

/**
 * Alta o actualización de zonas de envío, por `slug`.
 *
 * Exportada aparte del seed porque la usan dos caminos: `pnpm db:seed`, con
 * las zonas de ejemplo de Gran Asunción, y `POST /api/setup/init`, con las
 * zonas reales de la tienda en el cuerpo (PLAN.md FASE 2, PR U). Un segundo
 * upsert escrito a mano en la ruta sería un segundo lugar donde olvidarse del
 * `assertGs`, que es lo único que separa un flete en guaraníes enteros de un
 * `35000.5` guardado en una columna de plata.
 *
 * Idempotente por `slug`: re-correrlo actualiza precios, ciudades y orden sin
 * duplicar filas. **No borra las zonas que no vengan en la lista** — borrar
 * una zona que la tienda usa es exactamente el tipo de daño que un curl
 * repetido no tiene que poder hacer.
 */
export async function upsertShippingZones(
  zonas: readonly SeedShippingZone[],
  executor?: ReturnType<typeof getDb>
): Promise<number> {
  const db = executor ?? getDb();

  for (const zone of zonas) {
    assertGs(zone.pricePyg, `shipping_zones.${zone.slug}.price_pyg`);
    if (zone.freeThresholdPyg !== null) {
      assertGs(
        zone.freeThresholdPyg,
        `shipping_zones.${zone.slug}.free_threshold_pyg`
      );
    }

    await db
      .insert(shippingZones)
      .values({
        slug: zone.slug,
        name: zone.name,
        cities: [...zone.cities],
        pricePyg: zone.pricePyg,
        freeThresholdPyg: zone.freeThresholdPyg,
        position: zone.position,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: zone.name,
          cities: [...zone.cities],
          pricePyg: zone.pricePyg,
          freeThresholdPyg: zone.freeThresholdPyg,
          position: zone.position,
          isActive: true,
        },
      });
  }

  return zonas.length;
}

/**
 * Un producto listo para escribir: categoría ya resuelta a id, montos en
 * guaraníes enteros. Es lo que comparten los dos caminos que escriben
 * catálogo — `pnpm db:seed` (datos de ejemplo) y la importación de la
 * planilla del comercio (panel y `pnpm importar:productos`). Un segundo
 * upsert a mano sería un segundo lugar donde olvidarse del `assertGs` o del
 * "no pisar `on_hand`".
 *
 * Los campos opcionales en `undefined` son "la planilla no lo dice": en lo
 * que ya existe no se tocan, y en un alta toman el valor por defecto
 * (descripción y marca vacías, IVA 10, variante "Único", stock 0, sin precio
 * antes). `null` sí es "borralo" (docs/TEMPLATE-IMPROVEMENT-PLAN.md C2).
 */
export type CatalogProductUpsert = {
  specifications?: ProductSpecifications | null;
  supplierDetails?: SupplierDetails | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  saleMode?: "stock" | "enquiry" | "showcase";
  showPrice?: boolean;
  slug: string;
  name: string;
  description?: string | null;
  categoryId: number;
  brand?: string | null;
  ivaRate?: number;
  variants: Array<{
    attributes?: VariantAttributes | null;
    /** En `import`, sin sello: sólo pasa si es el mismo que ya está (E1). */
    identifiers?: VerifiedIdentifiers | IdentifiersInput | null;
    sku: string;
    label?: string;
    pricePyg: number;
    compareAtPyg?: number | null;
    onHand?: number;
  }>;
};

export type CatalogUpsertOptions = {
  /** Pisar `on_hand` de las variantes existentes con el stock de la planilla. */
  resetStock?: boolean;
  /**
   * Publicación de un producto **nuevo**: una fecha lo publica, `null` lo deja
   * como borrador. Nunca cambia la de un producto que ya existe.
   */
  publishedAt?: Date | null;
  /**
   * `seed`: el catálogo de ejemplo — lo sembrado vuelve a estar activo y en
   * el orden del seed. `import`: la planilla del comercio — nunca prende ni
   * reordena lo que ya existe (C5).
   */
  mode?: "seed" | "import";
  /**
   * `false` = quien importa no tiene `precios.masivo`: si la planilla cambia
   * un precio o pisa un stock, no se escribe nada (C6).
   */
  allowPriceChanges?: boolean;
  /** Quién, para `price_adjustments` y `stock_adjustments` (C7). */
  audit?: { actor: string; actorUserId: number | null; reason: string };
  executor?: Executor;
};

/**
 * Alta o actualización de productos y variantes, por `slug` y `sku`, en
 * **una** transacción: o entra la planilla entera, o nada (C1).
 *
 * Cada SKU se busca con `FOR UPDATE` por la colación de la base — la misma
 * igualdad del índice único, que no distingue mayúsculas ni acentos — y una
 * variante que es de otro producto frena todo: una planilla no muda una
 * variante (con su historia de pedidos) a otro producto (C4). El `product_id`
 * de una variante existente nunca se escribe.
 *
 * Idempotente. `on_hand` de una variante existente no se toca salvo
 * `resetStock` **y** que la planilla traiga el número. Cada precio o stock
 * que cambia deja su fila de auditoría cuando hay `audit`.
 *
 * Devuelve cuántas variantes escribió.
 */
export async function upsertCatalogProducts(
  items: readonly CatalogProductUpsert[],
  options: CatalogUpsertOptions = {}
): Promise<number> {
  if (!options.executor) {
    return getDb().transaction((tx) =>
      upsertCatalogProducts(items, { ...options, executor: tx })
    );
  }
  const db = options.executor;
  const mode = options.mode ?? "seed";
  const resetStock = options.resetStock ?? false;
  const publishedAt =
    options.publishedAt === undefined ? new Date() : options.publishedAt;
  let variantCount = 0;

  for (const product of items) {
    const [current] = await db
      .select({
        id: products.id,
        slug: products.slug,
        isActive: products.isActive,
        publishedAt: products.publishedAt,
        saleMode: products.saleMode,
        specifications: products.specifications,
        supplierDetails: products.supplierDetails,
      })
      .from(products)
      .where(eq(products.slug, product.slug))
      .limit(1)
      .for("update");
    // Una planilla no verifica (docs/TEMPLATE-IMPROVEMENT-PLAN.md E1): sus
    // sellos se ignoran, lo igual conserva el de la base y lo distinto queda
    // sin verificar. El seed de ejemplo sí trae sus sellos: es código, no
    // un archivo del proveedor.
    const sellar = <T extends Record<string, unknown>>(
      previous: unknown,
      submitted: T | null | undefined
    ) =>
      mode === "import"
        ? stampVerification({
            previous: decoded(previous) as Record<string, unknown> | null,
            submitted,
            confirm: false,
            actor: null,
            now: new Date(),
          })
        : submitted;
    await assertProductSlugAvailable(db, product.slug, current?.id ?? null);
    const details = {
      ...(product.specifications === undefined
        ? {}
        : {
            specifications: ProductSpecificationsSchema.nullable().parse(
              sellar(current?.specifications, product.specifications)
            ),
          }),
      ...(product.supplierDetails === undefined
        ? {}
        : {
            supplierDetails: SupplierDetailsSchema.nullable().parse(
              sellar(current?.supplierDetails, product.supplierDetails)
            ),
          }),
      ...(product.seoTitle === undefined ? {} : { seoTitle: product.seoTitle }),
      ...(product.seoDescription === undefined
        ? {}
        : { seoDescription: product.seoDescription }),
    };

    let productId: number;
    if (current) {
      productId = current.id;
      await db
        .update(products)
        .set({
          ...details,
          ...(product.saleMode === undefined
            ? {}
            : { saleMode: product.saleMode }),
          ...(product.showPrice === undefined
            ? {}
            : { showPrice: product.showPrice }),
          name: product.name,
          categoryId: product.categoryId,
          ...(product.description === undefined
            ? {}
            : { description: product.description }),
          ...(product.brand === undefined ? {} : { brand: product.brand }),
          ...(product.ivaRate === undefined
            ? {}
            : { ivaRate: product.ivaRate }),
          ...(mode === "seed" ? { isActive: true } : {}),
        })
        .where(eq(products.id, current.id));
    } else {
      await db.insert(products).values({
        ...details,
        saleMode: product.saleMode,
        showPrice: product.showPrice,
        slug: product.slug,
        name: product.name,
        description: product.description ?? null,
        categoryId: product.categoryId,
        brand: product.brand ?? null,
        ivaRate: product.ivaRate ?? 10,
        isActive: true,
        publishedAt,
      });
      const inserted = (
        await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, product.slug))
          .limit(1)
      )[0];
      if (!inserted)
        throw new Error(`No pude releer el producto ${product.slug}`);
      productId = inserted.id;
    }
    await claimProductSlug(db, product.slug, productId);

    let nextPosition: number | null = null;
    for (const [index, variant] of product.variants.entries()) {
      assertGs(variant.pricePyg, `${variant.sku}.price_pyg`);
      if (variant.compareAtPyg !== undefined && variant.compareAtPyg !== null) {
        assertGs(variant.compareAtPyg, `${variant.sku}.compare_at_pyg`);
      }

      // La misma igualdad que el índice único (colación de la base), y
      // bloqueada hasta el commit: nadie la muda entre la lectura y la
      // escritura.
      const [existing] = await db
        .select({
          id: variants.id,
          productId: variants.productId,
          pricePyg: variants.pricePyg,
          onHand: variants.onHand,
          attributes: variants.attributes,
          identifiers: variants.identifiers,
        })
        .from(variants)
        .where(eq(variants.sku, variant.sku))
        .limit(1)
        .for("update");

      const identifiers = sellar(
        existing?.identifiers,
        variant.identifiers as Record<string, unknown> | null | undefined
      );
      // El plan ya lo frena; esto es la misma regla bajo lock, para quien
      // llame sin plan.
      if (identifiers && !identifiers.verifiedAt) {
        throw identificadoresSinVerificarError(variant.sku);
      }
      const variantDetails = {
        ...(variant.attributes === undefined
          ? {}
          : {
              attributes: VariantAttributesSchema.nullable().parse(
                sellar(existing?.attributes, variant.attributes)
              ),
            }),
        ...(identifiers === undefined
          ? {}
          : {
              identifiers:
                VerifiedIdentifiersSchema.nullable().parse(identifiers),
            }),
      };

      if (existing && existing.productId !== productId) {
        const owner = (
          await db
            .select({ slug: products.slug })
            .from(products)
            .where(eq(products.id, existing.productId))
            .limit(1)
        )[0];
        throw skuAjenoError({
          sku: variant.sku,
          dueno: owner?.slug ?? String(existing.productId),
          producto: product.slug,
        });
      }

      if (existing) {
        const newOnHand =
          resetStock && variant.onHand !== undefined
            ? variant.onHand
            : existing.onHand;
        const priceChanges = existing.pricePyg !== variant.pricePyg;
        const stockChanges = newOnHand !== existing.onHand;
        if (
          (priceChanges || stockChanges) &&
          options.allowPriceChanges === false
        ) {
          throw preciosSoloDuenioError();
        }
        await db
          .update(variants)
          .set({
            ...variantDetails,
            ...(variant.label === undefined ? {} : { label: variant.label }),
            pricePyg: variant.pricePyg,
            ...(variant.compareAtPyg === undefined
              ? {}
              : { compareAtPyg: variant.compareAtPyg }),
            ...(mode === "seed" ? { position: index, isActive: true } : {}),
            ...(stockChanges ? { onHand: newOnHand } : {}),
          })
          .where(eq(variants.id, existing.id));

        if (options.audit && priceChanges) {
          await db.insert(priceAdjustments).values({
            variantId: existing.id,
            fromPyg: existing.pricePyg,
            toPyg: variant.pricePyg,
            reason: options.audit.reason.slice(0, 500),
            actor: options.audit.actor,
            actorUserId: options.audit.actorUserId,
          });
        }
        if (options.audit && stockChanges) {
          await db.insert(stockAdjustments).values({
            variantId: existing.id,
            delta: newOnHand - existing.onHand,
            previousOnHand: existing.onHand,
            newOnHand,
            reason: options.audit.reason.slice(0, 300),
            actor: options.audit.actor,
            actorUserId: options.audit.actorUserId,
          });
        }
      } else {
        // Una variante nueva de un producto que ya existe va al final, sin
        // reordenar las que el comercio ya acomodó (C5). En el seed, el
        // orden es el de la lista.
        if (mode === "import" && nextPosition === null) {
          nextPosition =
            Number(
              (
                await db
                  .select({
                    max: sql<number>`COALESCE(MAX(${variants.position}), -1)`,
                  })
                  .from(variants)
                  .where(eq(variants.productId, productId))
              )[0]?.max ?? -1
            ) + 1;
        }
        await db.insert(variants).values({
          ...variantDetails,
          productId,
          sku: variant.sku,
          label: variant.label ?? "Único",
          pricePyg: variant.pricePyg,
          compareAtPyg: variant.compareAtPyg ?? null,
          onHand: variant.onHand ?? 0,
          position: mode === "import" ? nextPosition! : index,
          isActive: true,
        });
        if (mode === "import") nextPosition! += 1;
      }
      variantCount += 1;
    }

    // Lo que queda a la venta con stock no puede tener una variante activa
    // sin precio cobrable (A1), venga del panel o de la planilla.
    const final = (
      await db
        .select({
          isActive: products.isActive,
          publishedAt: products.publishedAt,
          saleMode: products.saleMode,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1)
    )[0];
    if (final?.isActive && final.publishedAt && final.saleMode === "stock") {
      await assertActiveVariantsPriced(db, productId);
    }
  }

  return variantCount;
}

/**
 * Siembra el catálogo (categorías, zonas de envío, productos y variantes).
 *
 * Exportada aparte de `main()` para que `scripts/demo.ts` pueda encadenarla
 * con la creación de pedidos de ejemplo sin levantar un segundo proceso ni
 * una segunda conexión a la base.
 */
export async function seedCatalog(
  resetStock: boolean = RESET_STOCK
): Promise<void> {
  const db = getDb();

  // --- Categorías ---------------------------------------------------------
  for (const category of SEED_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        slug: category.slug,
        name: category.name,
        position: category.position,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: category.name,
          position: category.position,
          isActive: true,
        },
      });
  }
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categoryIdBySlug = new Map(
    categoryRows.map((row) => [row.slug, row.id])
  );
  console.log(`✓ ${SEED_CATEGORIES.length} categorías`);

  // --- Zonas de envío -----------------------------------------------------
  await upsertShippingZones(SEED_SHIPPING_ZONES);
  console.log(`✓ ${SEED_SHIPPING_ZONES.length} zonas de envío`);

  // --- Productos + variantes ---------------------------------------------
  const items: CatalogProductUpsert[] = SEED_PRODUCTS.map((product) => {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Categoría inexistente: ${product.categorySlug} (producto ${product.slug})`
      );
    }
    return {
      slug: product.slug,
      name: product.name,
      description: product.description,
      categoryId,
      brand: product.brand,
      ivaRate: product.ivaRate,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        label: variant.label,
        pricePyg: variant.pricePyg,
        compareAtPyg: variant.compareAtPyg ?? null,
        onHand: variant.onHand,
      })),
    };
  });

  const variantCount = await upsertCatalogProducts(items, {
    resetStock,
    // Fija, para que re-sembrar sea reproducible y no "recién publicado".
    publishedAt: new Date("2026-01-15T12:00:00Z"),
  });

  console.log(
    `✓ ${SEED_PRODUCTS.length} productos · ${variantCount} variantes`
  );
  console.log(
    resetStock
      ? "↺ stock reseteado a los valores del seed"
      : "· stock existente respetado (--reset-stock para pisarlo)"
  );
}

async function main(): Promise<void> {
  await seedCatalog();
  await closePool();
}

// `scripts/demo.ts` importa `seedCatalog` sin querer correr esto de nuevo —
// sólo se ejecuta cuando `seed.ts` es el script invocado directamente.
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main().catch(async (error) => {
    console.error(safeError(error).message);
    await closePool();
    process.exit(1);
  });
}
