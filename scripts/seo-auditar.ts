import "../src/lib/load-env";

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { closePool, getDb } from "../src/db";
import { categories, productImages, products } from "../src/db/schema";
import type { Executor } from "../src/domain/executor";
import { markdownToText } from "../src/lib/markdown";
import { safeError } from "../src/lib/safe-error";

/**
 * `pnpm seo:auditar` — qué le falta a la tienda para aparecer bien en Google
 * (O35, fable/plan-trafico.md §2.4, docs/SEO.md § "seo:auditar").
 *
 * **Sólo lee.** Una fila por hallazgo: categoría, producto o guía, su slug y
 * qué falta. Los controles y sus umbrales son las constantes de abajo, y
 * `docs/SEO.md` los lista uno por uno.
 *
 *   pnpm seo:auditar              # tabla para leer
 *   pnpm seo:auditar --json       # para una sesión
 *   pnpm seo:auditar --estricto   # sale con 1 si hay cualquier hallazgo
 *
 * Las guías (`src/lib/guias.ts`, O34) se revisan sólo si ese archivo existe;
 * si no, la salida lo dice y sigue con categorías y productos.
 *
 * Necesita `DATABASE_URL`.
 */

// --- Umbrales (docs/SEO.md los repite: cambiar uno es cambiar los dos) -----

/** Descripción de categoría: palabras (fable/plan-trafico.md §6.5). */
export const CATEGORIA_PALABRAS_MIN = 120;
export const CATEGORIA_PALABRAS_MAX = 250;
/** Descripción de producto: palabras. */
export const PRODUCTO_PALABRAS_MIN = 50;
/** Título SEO: caracteres (lo que Google muestra sin cortar). */
export const TITULO_SEO_MAX = 60;
/** Descripción SEO: caracteres. */
export const DESCRIPCION_SEO_MIN = 110;
export const DESCRIPCION_SEO_MAX = 160;
/** Fotos públicas mínimas por producto. */
export const FOTOS_MIN = 1;

/** Los controles, con el texto que imprime cada uno. */
export const CONTROLES = {
  sinDescripcion: "sin descripción",
  descripcionCorta: "descripción corta",
  descripcionLarga: "descripción larga",
  sinTituloSeo: "sin título SEO",
  tituloSeoLargo: "título SEO largo",
  sinDescripcionSeo: "sin descripción SEO",
  descripcionSeoFueraDeRango: "descripción SEO fuera de rango",
  sinFotos: "sin fotos",
  tituloRepetido: "título repetido",
  sinGuia: "ninguna guía la nombra",
  guiaIlegible: "guía que no se puede leer",
  guiaConProblemas: "guía con problemas",
  guiaApuntaANada: "guía que apunta a algo que no existe",
} as const;

export type Control = keyof typeof CONTROLES;

export type Hallazgo = {
  tipo: "categoria" | "producto" | "guia";
  slug: string;
  control: Control;
  detalle: string;
};

export type CategoriaAuditada = {
  slug: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type ProductoAuditado = {
  slug: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  fotos: number;
};

/** Lo que el script usa de `src/lib/guias.ts` (O34), ya resuelto. */
export type GuiasAuditadas = {
  /** Las guías leídas, publicadas y borradores. */
  guias: { slug: string; titulo: string; borrador: boolean; categorias: string[]; productos: string[] }[];
  rotos: { archivo: string; error: string }[];
  /** `problemasDeGuias` por slug. */
  problemas: Map<string, string[]>;
};

function palabras(markdown: string | null): number {
  const texto = markdownToText(markdown ?? "").trim();
  return texto === "" ? 0 : texto.split(/\s+/).length;
}

/** El título con que la página sale en Google: el SEO, si no el nombre. */
function tituloEfectivo(fila: { seoTitle: string | null; name: string }): string {
  return (fila.seoTitle?.trim() || fila.name).trim();
}

function textosSeo(
  tipo: "categoria" | "producto",
  fila: { slug: string; seoTitle: string | null; seoDescription: string | null },
  exigirTitulo: boolean
): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const titulo = fila.seoTitle?.trim() ?? "";
  if (!titulo) {
    if (exigirTitulo)
      hallazgos.push({ tipo, slug: fila.slug, control: "sinTituloSeo", detalle: "" });
  } else if (titulo.length > TITULO_SEO_MAX)
    hallazgos.push({
      tipo,
      slug: fila.slug,
      control: "tituloSeoLargo",
      detalle: `${titulo.length} > ${TITULO_SEO_MAX}`,
    });
  const descripcion = fila.seoDescription?.trim() ?? "";
  if (!descripcion)
    hallazgos.push({ tipo, slug: fila.slug, control: "sinDescripcionSeo", detalle: "" });
  else if (descripcion.length < DESCRIPCION_SEO_MIN || descripcion.length > DESCRIPCION_SEO_MAX)
    hallazgos.push({
      tipo,
      slug: fila.slug,
      control: "descripcionSeoFueraDeRango",
      detalle: `${descripcion.length} (${DESCRIPCION_SEO_MIN}–${DESCRIPCION_SEO_MAX})`,
    });
  return hallazgos;
}

/** La auditoría entera, sin base ni archivos. Pura. */
export function auditarSeo(input: {
  categorias: readonly CategoriaAuditada[];
  productos: readonly ProductoAuditado[];
  /** `null`: `src/lib/guias.ts` no existe todavía; se saltean los controles de guías. */
  guias: GuiasAuditadas | null;
}): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];

  for (const categoria of input.categorias) {
    const n = palabras(categoria.description);
    if (n === 0)
      hallazgos.push({ tipo: "categoria", slug: categoria.slug, control: "sinDescripcion", detalle: "" });
    else if (n < CATEGORIA_PALABRAS_MIN)
      hallazgos.push({
        tipo: "categoria",
        slug: categoria.slug,
        control: "descripcionCorta",
        detalle: `${n} palabras (${CATEGORIA_PALABRAS_MIN}–${CATEGORIA_PALABRAS_MAX})`,
      });
    else if (n > CATEGORIA_PALABRAS_MAX)
      hallazgos.push({
        tipo: "categoria",
        slug: categoria.slug,
        control: "descripcionLarga",
        detalle: `${n} palabras (${CATEGORIA_PALABRAS_MIN}–${CATEGORIA_PALABRAS_MAX})`,
      });
    hallazgos.push(...textosSeo("categoria", categoria, true));
  }

  for (const producto of input.productos) {
    const n = palabras(producto.description);
    if (n === 0)
      hallazgos.push({ tipo: "producto", slug: producto.slug, control: "sinDescripcion", detalle: "" });
    else if (n < PRODUCTO_PALABRAS_MIN)
      hallazgos.push({
        tipo: "producto",
        slug: producto.slug,
        control: "descripcionCorta",
        detalle: `${n} palabras (mín. ${PRODUCTO_PALABRAS_MIN})`,
      });
    // El título SEO de un producto es opcional (el nombre ya sirve), pero si
    // está, que no se corte.
    hallazgos.push(...textosSeo("producto", producto, false));
    if (producto.fotos < FOTOS_MIN)
      hallazgos.push({ tipo: "producto", slug: producto.slug, control: "sinFotos", detalle: "" });
  }

  // Dos páginas con el mismo título compiten por la misma búsqueda.
  const porTitulo = new Map<string, { tipo: "categoria" | "producto"; slug: string }[]>();
  for (const [tipo, filas] of [
    ["categoria", input.categorias],
    ["producto", input.productos],
  ] as const) {
    for (const fila of filas) {
      const clave = tituloEfectivo(fila).toLocaleLowerCase("es-PY");
      porTitulo.set(clave, [...(porTitulo.get(clave) ?? []), { tipo, slug: fila.slug }]);
    }
  }
  for (const [titulo, paginas] of porTitulo) {
    if (paginas.length < 2) continue;
    for (const pagina of paginas)
      hallazgos.push({
        ...pagina,
        control: "tituloRepetido",
        detalle: `"${titulo}" (${paginas.length} páginas)`,
      });
  }

  if (input.guias) {
    const publicadas = input.guias.guias.filter((guia) => !guia.borrador);
    for (const roto of input.guias.rotos)
      hallazgos.push({ tipo: "guia", slug: roto.archivo, control: "guiaIlegible", detalle: roto.error });
    for (const [slug, problemas] of input.guias.problemas)
      hallazgos.push({ tipo: "guia", slug, control: "guiaConProblemas", detalle: problemas.join("; ") });

    const categorias = new Set(input.categorias.map((categoria) => categoria.slug));
    const productos = new Set(input.productos.map((producto) => producto.slug));
    for (const guia of publicadas) {
      const faltan = [
        ...guia.categorias.filter((slug) => !categorias.has(slug)).map((slug) => `categoría ${slug}`),
        ...guia.productos.filter((slug) => !productos.has(slug)).map((slug) => `producto ${slug}`),
      ];
      if (faltan.length > 0)
        hallazgos.push({ tipo: "guia", slug: guia.slug, control: "guiaApuntaANada", detalle: faltan.join(", ") });
    }

    const nombradas = new Set(publicadas.flatMap((guia) => guia.categorias));
    for (const categoria of input.categorias)
      if (!nombradas.has(categoria.slug))
        hallazgos.push({ tipo: "categoria", slug: categoria.slug, control: "sinGuia", detalle: "" });
  }

  return hallazgos;
}

/** Lo que la vidriera publica: categorías activas y productos publicados. */
export async function leerCatalogo(executor: Executor): Promise<{
  categorias: CategoriaAuditada[];
  productos: ProductoAuditado[];
}> {
  const categorias = await executor
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      seoTitle: categories.seoTitle,
      seoDescription: categories.seoDescription,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position), asc(categories.slug));

  const filas = await executor
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      seoTitle: products.seoTitle,
      seoDescription: products.seoDescription,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.isActive, true),
        isNotNull(products.publishedAt),
        eq(categories.isActive, true)
      )
    )
    .orderBy(asc(products.slug));

  const fotos = new Map<number, number>();
  if (filas.length > 0) {
    const imagenes = await executor
      .select({ productId: productImages.productId, provenance: productImages.provenance })
      .from(productImages)
      .where(inArray(productImages.productId, filas.map((fila) => fila.id)));
    // Una ilustrativa no cuenta como foto del producto (no sale afuera).
    for (const imagen of imagenes)
      if (imagen.provenance !== "illustrative")
        fotos.set(imagen.productId, (fotos.get(imagen.productId) ?? 0) + 1);
  }

  return {
    categorias,
    productos: filas.map(({ id, ...fila }) => ({ ...fila, fotos: fotos.get(id) ?? 0 })),
  };
}

type ModuloGuias = {
  directorioGuias: (raiz?: string) => string;
  leerCarpetaDeGuias: (carpeta: string) => {
    guias: GuiasAuditadas["guias"];
    rotos: GuiasAuditadas["rotos"];
  };
  problemasDeGuias: (guias: never[]) => Map<string, string[]>;
};

/**
 * Las guías de la tienda, si el template ya trae `src/lib/guias.ts` (O34).
 * Sin ese archivo, `null`: los controles de guías se saltean.
 */
export async function cargarGuias(
  raiz: string = process.cwd(),
  importar: (url: string) => Promise<unknown> = (url) => import(url)
): Promise<GuiasAuditadas | null> {
  const archivo = join(raiz, "src/lib/guias.ts");
  if (!existsSync(archivo)) return null;
  const modulo = (await importar(pathToFileURL(archivo).href)) as ModuloGuias;
  const { guias, rotos } = modulo.leerCarpetaDeGuias(modulo.directorioGuias(raiz));
  return { guias, rotos, problemas: modulo.problemasDeGuias(guias as never[]) };
}

/** La tabla para personas. */
export function tablaHallazgos(hallazgos: readonly Hallazgo[]): string {
  if (hallazgos.length === 0) return "Sin hallazgos.";
  const filas = hallazgos.map((hallazgo) => [
    hallazgo.tipo,
    hallazgo.slug,
    CONTROLES[hallazgo.control] + (hallazgo.detalle ? `: ${hallazgo.detalle}` : ""),
  ]);
  const ancho = [0, 1].map((columna) =>
    Math.max(...filas.map((fila) => fila[columna]!.length), columna === 0 ? 4 : 4)
  );
  const linea = (fila: string[]) =>
    `${fila[0]!.padEnd(ancho[0]!)}  ${fila[1]!.padEnd(ancho[1]!)}  ${fila[2]}`;
  return [linea(["tipo", "slug", "hallazgo"]), ...filas.map(linea)].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const json = args.includes("--json");
  const estricto = args.includes("--estricto");
  const desconocidos = args.filter((arg) => !["--json", "--estricto"].includes(arg));
  if (desconocidos.length > 0) {
    console.error(`Opción desconocida: ${desconocidos.join(" ")}`);
    console.error("Uso: pnpm seo:auditar [--json] [--estricto]");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL: la auditoría lee el catálogo de la base.");
    process.exit(2);
  }

  try {
    const [catalogo, guias] = await Promise.all([leerCatalogo(getDb()), cargarGuias()]);
    const hallazgos = auditarSeo({ ...catalogo, guias });
    if (json) {
      console.log(
        JSON.stringify(
          {
            categorias: catalogo.categorias.length,
            productos: catalogo.productos.length,
            guias: guias ? guias.guias.length : null,
            hallazgos,
          },
          null,
          2
        )
      );
    } else {
      console.log(tablaHallazgos(hallazgos));
      console.log(
        `\n${hallazgos.length} hallazgos en ${catalogo.categorias.length} categorías y ${catalogo.productos.length} productos` +
          (guias ? ` y ${guias.guias.length} guías.` : ". Guías: se saltean (todavía no hay src/lib/guias.ts).")
      );
    }
    if (estricto && hallazgos.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`✗ ${safeError(error).message}`);
    process.exitCode = 2;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && /seo-auditar\.ts$/.test(process.argv[1])) {
  void main();
}
