import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { productImages, products } from "@/db/schema";
import {
  applyCatalogFotos,
  buildCatalogImportPlan,
  ensureCatalogCategories,
} from "@/domain/catalog-import-plan";
import { crearClienteR2 } from "@/lib/r2";

import {
  upsertCatalogProducts,
  type CatalogProductUpsert,
} from "../../scripts/seed";
import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { CONFIG_FALSA, crearR2Falso, type R2Falso } from "../helpers/r2-falso";

/**
 * La columna Fotos de la planilla (`pnpm importar:productos`) → R2.
 *
 * `parseCatalogo` y `buildCatalogImportPlan` ya están cubiertos sin base
 * (tests/unit/catalog-import.test.ts) y contra base (importar-productos.test.ts
 * en su forma CLI). Acá se prueba lo que necesita las dos cosas a la vez: la
 * cuenta de `fotosNuevas`, y `applyCatalogFotos` — sin R2 configurado, y con
 * un R2 de mentira y un CDN de mentira (nada sale a la red) — sobre
 * productos de verdad en la base de test.
 */

const ENCABEZADO = "SKU;Producto;Categoría;Variante;Precio (₲);Stock;Fotos";

function csvConFotos(fotos: string): string {
  return `${ENCABEZADO}\nFOT-1;Producto con fotos;Hogar;Único;100000;5;${fotos}\n`;
}

/** El DNS de los tests: todo nombre resuelve a una IP pública de documentación. */
const dnsPublico = async () => ["203.0.113.10"];

let jpeg: Uint8Array;
beforeAll(async () => {
  jpeg = new Uint8Array(
    await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: "#c03030" },
    })
      .jpeg()
      .toBuffer()
  );
});

/** El CDN de la planilla: `rota` da 404, `html` devuelve una página, el resto la foto. */
function conCdn(r2: R2Falso): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://cdn.test/")) {
      if (url.includes("rota")) return new Response("no", { status: 404 });
      if (url.includes("html")) return new Response("<html>hola</html>", { status: 200 });
      // El contenido varía por URL: si no, todas comparten clave.
      const color = url.includes("dos") ? "#3030c0" : "#c03030";
      const bytes = url.includes("dos")
        ? new Uint8Array(
            await sharp({ create: { width: 800, height: 800, channels: 3, background: color } })
              .jpeg()
              .toBuffer()
          )
        : jpeg;
      return new Response(bytes as BodyInit, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    return r2.fetch(input, init);
  }) as typeof fetch;
}

async function cargarCatalogo(csv: string) {
  const plan = await buildCatalogImportPlan(csv);
  expect(plan.errores).toEqual([]);
  const categoriaPorSlug = await ensureCatalogCategories(plan);
  const items: CatalogProductUpsert[] = plan.productos.map((producto) => ({
    slug: producto.slug,
    name: producto.name,
    description: producto.description,
    categoryId: [...categoriaPorSlug.values()][0]!,
    brand: producto.brand,
    ivaRate: producto.ivaRate,
    variants: producto.variants,
  }));
  await upsertCatalogProducts(items);
  return plan;
}

describe.skipIf(!hasTestDb)("applyCatalogFotos", () => {
  beforeEach(async () => {
    await resetTables();
    vi.unstubAllEnvs();
  }, 60_000);
  afterAll(closeTestDb);

  it("cuenta fotosNuevas en el plan y las omite (con un aviso claro) sin R2 configurado", async () => {
    for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]) {
      vi.stubEnv(name, "");
    }

    const plan = await cargarCatalogo(csvConFotos("https://cdn.test/a1.jpg|https://cdn.test/a2.jpg"));
    expect(plan.fotosNuevas).toBe(2);

    const db = getTestDb();
    // El catálogo se escribió igual: una foto omitida no frena el resto.
    expect(await db.select().from(products)).toHaveLength(1);

    const fotos = await applyCatalogFotos(plan.productos);
    expect(fotos).toEqual({ fotosSubidas: 0, fotosOmitidas: 2, fotosFallidas: [] });
    expect(await db.select().from(productImages)).toHaveLength(0);
  }, 60_000);

  it("baja, achica y sube cada foto, sólo a un producto sin ninguna, y no duplica al reimportar", async () => {
    const r2 = crearR2Falso();
    const fetchImpl = conCdn(r2);
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl });
    const csv = csvConFotos("https://cdn.test/uno.jpg|https://cdn.test/dos.jpg");
    const plan = await cargarCatalogo(csv);
    expect(plan.fotosNuevas).toBe(2);

    const db = getTestDb();
    const producto = (
      await db.select().from(products).where(eq(products.slug, "producto-con-fotos"))
    )[0]!;

    const primeraSubida = await applyCatalogFotos(plan.productos, undefined, { cliente, fetchImpl, resolver: dnsPublico });
    expect(primeraSubida).toEqual({ fotosSubidas: 2, fotosOmitidas: 0, fotosFallidas: [] });

    const imagenes = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, producto.id));
    expect(imagenes).toHaveLength(2);
    expect(imagenes.map((i) => i.alt).sort()).toEqual([
      "Producto con fotos",
      "Producto con fotos — foto 2",
    ]);
    // 1600×1000 se guarda acotada a 1200×750; 800×800, sin agrandar.
    const refs = imagenes.map((i) => i.imageRef).sort();
    expect(refs[0]).toMatch(/^r2:p1\/producto-con-fotos-[0-9a-f]{10}@(1200x750|800x800)$/);
    expect(refs.some((ref) => ref.endsWith("@1200x750"))).toBe(true);
    expect(refs.some((ref) => ref.endsWith("@800x800"))).toBe(true);
    // Cada objeto de cada foto quedó escrito antes de la fila: 4 WebP + JPEG y 3 WebP + JPEG.
    const claves = [...r2.objetos.keys()].sort();
    expect(claves).toHaveLength(9);
    for (const objeto of r2.objetos.values()) {
      expect(objeto.cacheControl).toBe("public, max-age=31536000, immutable");
    }

    // Reimportar la misma planilla: el producto ya tiene fotos, no se tocan.
    const plan2 = await buildCatalogImportPlan(csv);
    expect(plan2.fotosNuevas).toBe(0);
    const segundaSubida = await applyCatalogFotos(plan2.productos, undefined, { cliente, fetchImpl, resolver: dnsPublico });
    expect(segundaSubida).toEqual({ fotosSubidas: 0, fotosOmitidas: 0, fotosFallidas: [] });
    expect(
      await db.select().from(productImages).where(eq(productImages.productId, producto.id))
    ).toHaveLength(2);
  }, 60_000);

  it("una foto que falla no frena a las demás ni al catálogo, y no deja fila", async () => {
    const r2 = crearR2Falso();
    const fetchImpl = conCdn(r2);
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl });
    const plan = await cargarCatalogo(
      csvConFotos("https://cdn.test/rota.jpg|https://cdn.test/html.jpg|https://cdn.test/buena.jpg")
    );

    const resultado = await applyCatalogFotos(plan.productos, undefined, { cliente, fetchImpl, resolver: dnsPublico });
    expect(resultado.fotosSubidas).toBe(1);
    expect(resultado.fotosOmitidas).toBe(0);
    expect(resultado.fotosFallidas.map((f) => [f.url, f.motivo])).toEqual([
      ["https://cdn.test/rota.jpg", "el servidor respondió HTTP 404"],
      ["https://cdn.test/html.jpg", "no es una imagen JPG, PNG, WebP o GIF"],
    ]);
    expect(await getTestDb().select().from(productImages)).toHaveLength(1);
  }, 60_000);

  it("si R2 falla al escribir, no se inserta la fila", async () => {
    const r2 = crearR2Falso();
    r2.fallarPut = ".jpg";
    const fetchImpl = conCdn(r2);
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl });
    const plan = await cargarCatalogo(csvConFotos("https://cdn.test/uno.jpg"));

    const resultado = await applyCatalogFotos(plan.productos, undefined, { cliente, fetchImpl, resolver: dnsPublico });
    expect(resultado.fotosSubidas).toBe(0);
    expect(resultado.fotosFallidas).toHaveLength(1);
    expect(resultado.fotosFallidas[0]!.motivo).toContain("HTTP 400");
    expect(await getTestDb().select().from(productImages)).toHaveLength(0);
  }, 60_000);

  it("una referencia r2: ya subida entra sólo si el objeto existe en el bucket", async () => {
    const r2 = crearR2Falso();
    r2.objetos.set("p1/producto-con-fotos-0123456789.jpg", {
      bytes: jpeg,
      contentType: "image/jpeg",
      cacheControl: null,
      fecha: new Date(),
    });
    const fetchImpl = conCdn(r2);
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl });
    const plan = await cargarCatalogo(
      csvConFotos("r2:p1/producto-con-fotos-0123456789@1200x750|r2:p1/otra-foto-abcdefabcd@800x800")
    );

    const resultado = await applyCatalogFotos(plan.productos, undefined, { cliente, fetchImpl, resolver: dnsPublico });
    expect(resultado.fotosSubidas).toBe(1);
    expect(resultado.fotosFallidas.map((f) => f.url)).toEqual(["r2:p1/otra-foto-abcdefabcd@800x800"]);
    const filas = await getTestDb().select().from(productImages);
    expect(filas.map((f) => f.imageRef)).toEqual(["r2:p1/producto-con-fotos-0123456789@1200x750"]);
  }, 60_000);
});
