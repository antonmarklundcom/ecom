import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getFeedProducts, getProductBySlug } from "@/db/queries";
import { productImages } from "@/db/schema";
import {
  addProductImage,
  createProduct,
  saveVariant,
  setProductImageProvenance,
} from "@/domain/admin-products";
import { outsideImages } from "@/lib/image-provenance";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createCategory } from "../helpers/factories";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md E2 contra la base: la procedencia es de
 * cada foto, la del producto queda como respaldo, y lo que sale afuera (OG,
 * JSON-LD, feed) se decide con la efectiva.
 */
describe.skipIf(!hasTestDb)("procedencia por foto", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  async function producto() {
    const categoryId = await createCategory("hogar");
    const productId = await createProduct({
      slug: "botella",
      name: "Botella",
      description: null,
      categoryId,
      brand: null,
      ivaRate: 10,
      isActive: true,
      published: true,
      supplierDetails: { imageProvenance: "illustrative" },
    });
    await saveVariant(productId, {
      sku: "BOT-1",
      label: "Única",
      pricePyg: 50_000,
      compareAtPyg: null,
      isActive: true,
    });
    for (const [index, cloudinaryId] of ["frente", "dorso"].entries())
      await addProductImage({ productId, cloudinaryId, alt: `Foto ${index}` });
    const ids = (
      await getTestDb()
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, productId))
        .orderBy(productImages.position)
    ).map((row) => row.id);
    return { productId, ids };
  }

  it("la de la foto manda; sin marcar vale la del producto", async () => {
    const { productId, ids } = await producto();
    const antes = Date.now();
    await setProductImageProvenance({
      productId,
      imageId: ids[1]!,
      provenance: "owned-photo",
    });

    const ficha = await getProductBySlug("botella");
    expect(ficha?.images.map((i) => i.provenance)).toEqual([
      "illustrative",
      "owned-photo",
    ]);
    // Afuera sale sólo la propia: antes, con la marca a nivel producto,
    // salían las dos o ninguna.
    expect(outsideImages(ficha!.images).map((i) => i.cloudinaryId)).toEqual([
      "dorso",
    ]);
    const feed = await getFeedProducts();
    expect(feed[0]?.images.map((i) => i.provenance)).toEqual([
      "illustrative",
      "owned-photo",
    ]);

    const [row] = await getTestDb()
      .select()
      .from(productImages)
      .where(eq(productImages.id, ids[1]!));
    // La fecha la pone el servidor (MariaDB guarda los ms, MySQL también:
    // timestamp(3)).
    expect(row?.verifiedAt?.getTime()).toBeGreaterThanOrEqual(antes - 1_000);

    await setProductImageProvenance({
      productId,
      imageId: ids[1]!,
      provenance: null,
    });
    const [limpia] = await getTestDb()
      .select()
      .from(productImages)
      .where(eq(productImages.id, ids[1]!));
    expect(limpia).toMatchObject({ provenance: null, verifiedAt: null });
  });

  it("no marca una foto de otro producto", async () => {
    const { ids } = await producto();
    const otraCategoria = await createCategory("otra");
    const otro = await createProduct({
      slug: "otro",
      name: "Otro",
      description: null,
      categoryId: otraCategoria,
      brand: null,
      ivaRate: 10,
      isActive: false,
      published: false,
    });
    await expect(
      setProductImageProvenance({
        productId: otro,
        imageId: ids[0]!,
        provenance: "owned-photo",
      })
    ).rejects.toMatchObject({ code: "adminError.imagenInvalida" });
  });
});
