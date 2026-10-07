import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import { getDb, getPool, closePool } from "@/db";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  migrationVersions,
  tablesForMigration,
  rowDigest,
} from "@/domain/backup-format";
import {
  products,
  variants,
  stockReservations,
  productSlugRedirects,
} from "@/db/schema";
import {
  getProductBySlug,
  getCategoryProducts,
  searchProducts,
} from "@/db/queries";
import {
  createProduct,
  updateProduct,
  type ProductWrite,
} from "@/domain/admin-products";
import { getProductSlugRedirect } from "@/domain/product-slugs";
import { buildCatalogImportPlan } from "@/domain/catalog-import-plan";
import { upsertCatalogProducts } from "../../scripts/seed";
import { dumpDatabase } from "@/domain/backup";
import { restoreBackup } from "@/domain/restore-backup";
import { applySchemaExtras, FULLTEXT_INDEX_NAME } from "@/db/extras";
import { hasTestDb, resetTables, closeTestDb } from "../helpers/db";
import {
  createCategory,
  createVariant,
  createOrder,
} from "../helpers/factories";

const verifiedAt = "2026-01-01T12:00:00.000Z";
describe.skipIf(!hasTestDb)("template catalogue mechanisms", () => {
  beforeEach(resetTables);
  afterEach(() => {
    CATALOGUE.attributes = [];
  });
  afterAll(closeTestDb);
  async function fixture() {
    const categoryId = await createCategory("bottles");
    const input: ProductWrite = {
      slug: "bottle",
      name: "Botella",
      description: "Producto real",
      categoryId,
      brand: null,
      ivaRate: 10,
      isActive: true,
      published: true,
      specifications: { verifiedAt, unit: "unidad", values: { capacity: 500 } },
      supplierDetails: {
        reference: "PRIVATE-REF",
        verifiedAt,
        imageProvenance: "owned-photo",
      },
    };
    const productId = await createProduct(input);
    const variantId = await createVariant({ productId, onHand: 5 });
    return { input, productId, variantId };
  }
  it("redirects every historical slug directly, rejects cycles/collisions and hides inactive/deleted targets", async () => {
    const { input, productId } = await fixture();
    await updateProduct(productId, { ...input, slug: "bottle-new" });
    await updateProduct(productId, { ...input, slug: "bottle-current" });
    expect(await getProductSlugRedirect("bottle")).toBe("bottle-current");
    expect(await getProductSlugRedirect("bottle-new")).toBe("bottle-current");
    await expect(
      updateProduct(productId, { ...input, slug: "bottle" })
    ).rejects.toThrow();
    await expect(
      createProduct({ ...input, slug: "bottle-new" })
    ).rejects.toThrow();
    await getDb()
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, productId));
    expect(await getProductSlugRedirect("bottle")).toBeNull();
    await getDb().delete(products).where(eq(products.id, productId));
    expect(await getProductSlugRedirect("bottle-new")).toBeNull();
    expect(await getDb().select().from(productSlugRedirects)).toHaveLength(0);
  });
  it("allows only one racing product to claim a new namespace entry", async () => {
    const categoryId = await createCategory();
    const input: ProductWrite = {
      slug: "racing",
      name: "A",
      description: null,
      categoryId,
      brand: null,
      ivaRate: 10,
      isActive: true,
      published: true,
    };
    const results = await Promise.allSettled([
      createProduct(input),
      createProduct({ ...input, name: "B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getDb().select().from(products)).toHaveLength(1);
    expect(await getDb().select().from(productSlugRedirects)).toHaveLength(1);
  });
  it("preserves real stock and optional metadata on legacy reimports; preview rejects historical slugs", async () => {
    const { input, productId, variantId } = await fixture();
    const [v] = await getDb()
      .select()
      .from(variants)
      .where(eq(variants.id, variantId));
    await upsertCatalogProducts([
      {
        ...input,
        variants: [
          {
            sku: v!.sku,
            label: "Único",
            pricePyg: 120000,
            compareAtPyg: null,
            onHand: 999,
          },
        ],
      },
    ]);
    const [after] = await getDb()
      .select()
      .from(variants)
      .where(eq(variants.id, variantId));
    expect(after!.onHand).toBe(5);
    expect(
      (await getProductBySlug("bottle"))?.verifiedSpecifications?.values
        ?.capacity
    ).toBe(500);
    expect(JSON.stringify(await getProductBySlug("bottle"))).not.toContain(
      "PRIVATE-REF"
    );
    await updateProduct(productId, { ...input, slug: "bottle-current" });
    const preview = await buildCatalogImportPlan(
      "SKU,Producto,Categoría,Precio,Stock,Slug\nNEW,Botella,Bottles,120000,9,bottle"
    );
    expect(preview.errores.join(" ")).toContain("histórico");
  });
  it("matches attributes on one active variant and computes signed stock from live UTC reservations", async () => {
    const { productId, variantId } = await fixture();
    CATALOGUE.attributes = [
      { key: "color", label: "Color", scope: "variant", filter: true },
      { key: "size", label: "Tamaño", scope: "variant", filter: true },
    ];
    await getDb()
      .update(variants)
      .set({
        attributes: { verifiedAt, values: { color: "blue", size: "small" } },
      })
      .where(eq(variants.id, variantId));
    const other = await createVariant({ productId, onHand: 10 });
    await getDb()
      .update(variants)
      .set({
        attributes: { verifiedAt, values: { color: "green", size: "large" } },
      })
      .where(eq(variants.id, other));
    expect(
      (
        await getCategoryProducts({
          categorySlug: "bottles",
          attributes: { color: "blue", size: "large" },
        })
      ).total
    ).toBe(0);
    expect(
      (
        await getCategoryProducts({
          categorySlug: "bottles",
          attributes: { color: "blue", size: "small" },
          inStock: true,
        })
      ).total
    ).toBe(1);
    const orderId = await createOrder();
    await getDb()
      .insert(stockReservations)
      .values({
        orderId,
        variantId,
        qty: 9,
        state: "held",
        expiresAt: new Date(Date.now() + 60000),
      });
    expect(
      (
        await getCategoryProducts({
          categorySlug: "bottles",
          attributes: { color: "blue" },
          inStock: true,
        })
      ).total
    ).toBe(0);
    await getDb()
      .update(stockReservations)
      .set({ expiresAt: new Date(Date.now() - 60000) })
      .where(eq(stockReservations.variantId, variantId));
    expect(
      (
        await getCategoryProducts({
          categorySlug: "bottles",
          attributes: { color: "blue" },
          inStock: true,
        })
      ).total
    ).toBe(1);
    await getPool().query("UPDATE variants SET attributes=? WHERE id=?", [
      JSON.stringify({
        verifiedAt: "2026-02-30T00:00:00Z",
        values: { color: "blue" },
      }),
      variantId,
    ]);
    expect(
      (
        await getCategoryProducts({
          categorySlug: "bottles",
          attributes: { color: "blue" },
        })
      ).total
    ).toBe(0);
  });
  it("falls back only for a missing fulltext index, and health detects catalogue schema failure", async () => {
    await fixture();
    await getPool().query(
      `ALTER TABLE products DROP INDEX ${FULLTEXT_INDEX_NAME}`
    );
    try {
      expect(await searchProducts("Botella")).toHaveLength(1);
    } finally {
      await applySchemaExtras(getPool());
    }
    const { GET } = await import("@/app/api/health/route");
    expect((await GET()).status).toBe(200);
    await getPool().query(
      "ALTER TABLE variants RENAME COLUMN identifiers TO unavailable_identifiers"
    );
    try {
      expect(await (await GET()).json()).toMatchObject({
        db: true,
        catalog: false,
      });
      await expect(searchProducts("Botella")).rejects.toThrow();
    } finally {
      await getPool().query(
        "ALTER TABLE variants RENAME COLUMN unavailable_identifiers TO identifiers"
      );
    }
  });
  it("backs up, resets and restores metadata, private provenance and URL history in the isolated database", async () => {
    const { input, productId } = await fixture();
    await updateProduct(productId, { ...input, slug: "restored-bottle" });
    const folder = await mkdtemp(
      path.join(tmpdir(), "ecom-inheritance-backup-test-")
    );
    try {
      const file = path.join(folder, "backup.gz");
      const { stream, stats } = dumpDatabase();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      await stats;
      await writeFile(file, Buffer.concat(chunks));
      await resetTables();
      await restoreBackup({ archivo: file });
      expect(await getProductSlugRedirect("bottle")).toBe("restored-bottle");
      const [restored] = await getDb()
        .select()
        .from(products)
        .where(eq(products.id, productId));
      expect(restored!.supplierDetails?.reference).toBe("PRIVATE-REF");
      expect(restored!.specifications?.values?.capacity).toBe(500);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it("restores a supported pre-upgrade format-2 backup before applying the new schema and slug backfill", async () => {
    const { productId } = await fixture();
    const folder = await mkdtemp(path.join(tmpdir(), "ecom-old-backup-test-"));
    const originalUrl = process.env.DATABASE_URL!;
    const recoveryName = `ecom_legacy_restore_test_${Date.now()}`;
    const recoveryUrl = new URL(originalUrl);
    recoveryUrl.pathname = `/${recoveryName}`;
    try {
      const { stream, stats } = dumpDatabase();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      await stats;
      const records = gunzipSync(Buffer.concat(chunks))
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const migration = migrationVersions().find((v) =>
        v.tag.startsWith("0022_")
      )!;
      const tables = tablesForMigration(migration.tag);
      const manifest = { ...records[0], migration, tables };
      const rows = records.filter(
        (r) => r.table && r.table !== "product_slug_redirects"
      );
      for (const record of rows) {
        const omitted =
          record.table === "products"
            ? [
                "specifications",
                "supplier_details",
                "seo_title",
                "seo_description",
              ]
            : record.table === "variants"
              ? ["attributes", "identifiers"]
              : record.table === "categories"
                ? ["seo_title", "seo_description"]
                : [];
        for (const column of omitted) delete record.row[column];
      }
      const counts = Object.fromEntries(tables.map((table) => [table, 0]));
      const digest = rowDigest();
      for (const row of rows) {
        counts[row.table]++;
        digest.update(`${JSON.stringify(row)}\n`);
      }
      const end = {
        type: "end",
        counts,
        rows: rows.length,
        sha256: digest.digest("hex"),
      };
      const file = path.join(folder, "older.gz");
      await writeFile(
        file,
        gzipSync(
          [manifest, ...rows, end].map((r) => JSON.stringify(r)).join("\n") +
            "\n"
        )
      );
      await getPool().query(
        `CREATE DATABASE \`${recoveryName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
      );
      await closePool();
      process.env.DATABASE_URL = recoveryUrl.toString();
      await restoreBackup({ archivo: file });
      const [restored] = await getDb()
        .select()
        .from(products)
        .where(eq(products.id, productId));
      expect(restored!.specifications).toBeNull();
      expect(await getDb().select().from(productSlugRedirects)).toMatchObject([
        { slug: "bottle", productId },
      ]);
    } finally {
      await closePool();
      process.env.DATABASE_URL = originalUrl;
      await getPool().query(`DROP DATABASE IF EXISTS \`${recoveryName}\``);
      await rm(folder, { recursive: true, force: true });
    }
  });
});
