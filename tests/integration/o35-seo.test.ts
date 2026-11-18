import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { categories, productImages, products, supplierOffers, variants } from "@/db/schema";
import { saveStoreSettingsSection } from "@/domain/store-settings";

import {
  aplicarCategorias,
  leerCategorias,
} from "../../scripts/categorias-aplicar";
import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createCategory, createProduct, createVariant } from "../helpers/factories";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));
// La tienda maneja proveedores: es el caso en que la ficha lee sus datos.
vi.mock("@/lib/proveedores", () => ({ proveedoresHabilitados: () => true }));

/**
 * O35 contra la base (fable/plan-trafico.md §2.4).
 */
const NOMBRE_PROVEEDOR = "Mayorista Reservado SRL";
const COSTO = 876_543_219;
const STOCK_PROVEEDOR = 4321;
const URL_PROVEEDOR = "https://mayorista-reservado.test/ficha/9";

describe.skipIf(!hasTestDb)("O35 · búsqueda", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  async function productoDeConsulta(checkedAt: Date | null) {
    const categoryId = await createCategory("anillos");
    const productId = await createProduct(categoryId);
    const db = getTestDb();
    await db
      .update(products)
      .set({ slug: "anillo-oro", name: "Anillo de oro", saleMode: "enquiry" })
      .where(eq(products.id, productId));
    const variantId = await createVariant({ productId, onHand: 0, pricePyg: 1_500_000 });
    await db.insert(supplierOffers).values({
      variantId,
      source: NOMBRE_PROVEEDOR,
      unitCostPyg: COSTO,
      supplierStock: STOCK_PROVEEDOR,
      productUrl: URL_PROVEEDOR,
      supplierUrl: URL_PROVEEDOR,
      isConfirmed: true,
      isActive: true,
      isPreferred: true,
      checkedAt,
    });
    const [variante] = await db.select().from(variants).where(eq(variants.id, variantId));
    return { productId, sku: variante!.sku };
  }

  async function renderFicha(slug: string): Promise<string> {
    const { default: ProductPage } = await import("@/app/producto/[slug]/page");
    const elemento = await ProductPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(elemento);
  }

  function ldDeProducto(html: string): {
    offers?: { availability: string; price: number; priceCurrency: string; url: string }[];
  } {
    const bloques = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]!) as { "@type": string }
    );
    return bloques.find((bloque) => bloque["@type"] === "Product") as never;
  }

  it("con proveedores: stock reciente del proveedor → 'En stock' en la línea y en la Offer, y ningún dato del proveedor en el HTML", async () => {
    const { sku } = await productoDeConsulta(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    const html = await renderFicha("anillo-oro");

    for (const marca of [
      NOMBRE_PROVEEDOR,
      "mayorista-reservado",
      URL_PROVEEDOR,
      String(COSTO),
      "876.543.219",
      String(STOCK_PROVEEDOR),
      "4.321",
    ])
      expect(html).not.toContain(marca);

    expect(html).toMatch(/data-testid="product-availability" data-disponibilidad="en_stock"/);
    const ld = ldDeProducto(html);
    expect(ld.offers).toEqual([
      expect.objectContaining({
        price: 1_500_000,
        priceCurrency: "PYG",
        availability: "https://schema.org/InStock",
      }),
    ]);
    expect(ld.offers![0]!.url).toContain(`variante=${sku}`);
  });

  it("con proveedores pero el dato tiene más de 7 días → 'Por encargo' / BackOrder", async () => {
    await productoDeConsulta(new Date(Date.now() - 9 * 24 * 60 * 60 * 1000));
    const html = await renderFicha("anillo-oro");
    expect(html).toMatch(/data-disponibilidad="por_encargo"/);
    expect(ldDeProducto(html).offers![0]!.availability).toBe("https://schema.org/BackOrder");
    expect(html).not.toContain(NOMBRE_PROVEEDOR);
  });

  it("el feed sigue sin productos de consulta, y en modo consulta sale vacío; el sitemap lleva las fotos", async () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://imagenes.example.com");
    const { productId: anillo } = await productoDeConsulta(null);
    const propio = await createProduct(await createCategory("mates"));
    await createVariant({ productId: propio, onHand: 5, pricePyg: 90_000 });
    const db = getTestDb();
    for (const [productId, n] of [
      [anillo, 7],
      [propio, 1],
    ] as const)
      for (let i = 0; i < n; i += 1)
        await db.insert(productImages).values({
          productId,
          imageRef: `r2:p1/foto-${productId}-${i}-0123456789@800x800`,
          position: i,
        });

    const { default: sitemap } = await import("@/app/sitemap");
    const entradas = await sitemap();
    const ficha = entradas.find((e) => e.url.endsWith("/producto/anillo-oro"));
    expect(ficha?.images).toHaveLength(5);
    expect(ficha!.images!.every((src) => src.startsWith("https://imagenes.example.com/"))).toBe(true);
    const { GET } = await import("@/app/feed.xml/route");

    const carrito = await (await GET()).text();
    expect(carrito).not.toContain("anillo-oro");
    expect(carrito.match(/<item>/g)).toHaveLength(1);

    await saveStoreSettingsSection("ventas", { modo: "consulta" }, { userId: null });
    const consulta = await (await GET()).text();
    expect(consulta).not.toContain("<item>");
    expect(consulta).toContain("<channel>");
    vi.unstubAllEnvs();
  });
});

describe.skipIf(!hasTestDb)("O35 · categorias:aplicar", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  const archivo = [
    {
      slug: "anillos",
      nombre: "Anillos",
      descripcion: "Anillos de compromiso y alianzas.",
      seoTitulo: "Anillos de compromiso en Paraguay",
      seoDescripcion: "Elegí tu anillo.",
    },
    { slug: "alianzas", nombre: "Alianzas", padre: "anillos", posicion: 2 },
    { slug: "aros", nombre: "Aros", padre: "joyas" },
  ];

  it("ensayo, aplicar, segunda corrida igual y --pisar", async () => {
    const db = getTestDb();
    // Una que ya existe: con nombre y texto propios, sin madre ni SEO.
    await db.insert(categories).values({ slug: "anillos", name: "Anillos viejos", description: "Texto del dueño" });
    await db.insert(categories).values({ slug: "joyas", name: "Joyas" });
    await db.insert(categories).values({ slug: "fuera-del-archivo", name: "Queda" });

    const ensayo = await aplicarCategorias(db, archivo, { aplicar: false, pisar: false });
    expect(ensayo.ok && ensayo.pasos.map((p) => p.accion)).toEqual(["cambia", "nueva", "nueva"]);
    expect((await leerCategorias(db)).map((c) => c.slug).sort()).toEqual([
      "anillos",
      "fuera-del-archivo",
      "joyas",
    ]);

    const aplicado = await aplicarCategorias(db, archivo, { aplicar: true, pisar: false });
    expect(aplicado.ok).toBe(true);
    const filas = new Map((await leerCategorias(db)).map((c) => [c.slug, c]));
    // Llena sólo lo vacío: el nombre y el texto del dueño quedan.
    expect(filas.get("anillos")).toMatchObject({
      name: "Anillos viejos",
      description: "Texto del dueño",
      seoTitle: "Anillos de compromiso en Paraguay",
      seoDescription: "Elegí tu anillo.",
    });
    expect(filas.get("alianzas")).toMatchObject({ parentId: filas.get("anillos")!.id, position: 2 });
    expect(filas.get("aros")!.parentId).toBe(filas.get("joyas")!.id);
    expect(filas.has("fuera-del-archivo")).toBe(true);

    const segunda = await aplicarCategorias(db, archivo, { aplicar: true, pisar: false });
    expect(segunda.ok && segunda.pasos.every((p) => p.accion === "igual")).toBe(true);

    const pisado = await aplicarCategorias(db, archivo, { aplicar: true, pisar: true });
    expect(pisado.ok && pisado.pasos.map((p) => p.accion)).toEqual(["cambia", "igual", "igual"]);
    const anillos = (await leerCategorias(db)).find((c) => c.slug === "anillos")!;
    expect(anillos).toMatchObject({ name: "Anillos", description: "Anillos de compromiso y alianzas." });
    expect((await leerCategorias(db)).length).toBe(5);
  });

  it("rechaza el archivo entero sin escribir: slug repetido, madre inexistente, ciclo", async () => {
    const db = getTestDb();
    for (const malo of [
      [archivo[0], archivo[0]],
      [{ slug: "aros", nombre: "Aros", padre: "no-existe" }],
      [
        { slug: "a", nombre: "A", padre: "b" },
        { slug: "b", nombre: "B", padre: "a" },
      ],
      [{ slug: "Con Espacios", nombre: "X" }],
    ]) {
      const plan = await aplicarCategorias(db, malo, { aplicar: true, pisar: false });
      expect(plan.ok).toBe(false);
    }
    expect(await leerCategorias(db)).toEqual([]);
  });
});
