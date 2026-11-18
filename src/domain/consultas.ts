import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  categories,
  enquiryDaily,
  products,
  searchDaily,
  variants,
} from "@/db/schema";
import { ENQUIRY_ORIGINS, type EnquiryOrigin } from "@/lib/consulta-click";
import { toCsv, type CsvValue } from "@/lib/csv";
import { log, mensajeDe } from "@/lib/log";
import { parsePyDateInput, pyDateInputValue } from "@/lib/py";

import type { Executor } from "./executor";

/**
 * Consultas por WhatsApp y búsquedas, contadas por día (O33,
 * `fable/plan-trafico.md` §2.2).
 *
 * Una tienda que todavía no vende sólo tiene una señal de que algo funciona:
 * cuánta gente toca "Consultar por WhatsApp", en qué producto, y qué busca
 * sin encontrarlo. Esto la cuenta **sin guardar nada de nadie**: ni IP, ni
 * user agent, ni cookie, ni el texto del mensaje. Una fila es "este día, este
 * producto, desde este botón: N". El test de privacidad lo hace cumplir
 * (`tests/unit/consultas-privacidad.test.ts`).
 *
 * Nada de acá tira hacia afuera: contar es secundario, y una base caída no
 * puede romper la búsqueda ni la ruta del beacon.
 */

/** Cuántos términos **nuevos** por día se aceptan. Lo que sobra no se guarda. */
export const MAX_TERMINOS_POR_DIA = 500;

/** Largo máximo de un término guardado (la columna es `varchar(80)`). */
export const TERMINO_MAX = 80;

/** Cuánto se guardan los conteos: 13 meses, para comparar contra el año pasado. */
export const RETENCION_MESES = 13;

/** El día paraguayo de `now`, como lo guarda la columna `day`. */
export function diaPY(now: Date = new Date()): string {
  return pyDateInputValue(now);
}

/**
 * El día paraguayo `n` días antes del de `now`. Se para al mediodía para que
 * ningún cambio de offset lo haga caer en el día equivocado.
 */
export function diaPYMenos(now: Date, n: number): string {
  const hoy = parsePyDateInput(diaPY(now))!;
  return diaPY(new Date(hoy.getTime() + 12 * 3600_000 - n * 24 * 3600_000));
}

// ---------------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------------

/**
 * El término como se guarda, o `null` si no se guarda.
 *
 * Minúsculas, espacios colapsados, recortado a `TERMINO_MAX`. **No se guarda**
 * un término con `@` (un e-mail) ni con siete o más dígitos seguidos (un
 * teléfono, una cédula, un número de tarjeta) — y los dígitos se cuentan
 * ignorando espacios, puntos, guiones y paréntesis entre ellos, porque
 * "0981 123 456" es un teléfono igual.
 */
export function normalizarTermino(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const termino = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (termino.length < 2) return null;
  if (termino.includes("@")) return null;
  if (/\d{7,}/.test(termino.replace(/[\s.\-()/+]/g, ""))) return null;
  return termino.slice(0, TERMINO_MAX).trim();
}

/**
 * ¿El pedido se presenta como un robot? Un crawler no ejecuta el JavaScript del
 * beacon, pero sí pide `/buscar?q=…` si encuentra el link. Lo que se mira es
 * sólo esto: el user agent no se guarda en ningún lado.
 */
export function esRobot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|scrape|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget|python-requests|httpclient|axios|node-fetch/i.test(
    userAgent
  );
}

/** ¿Es un prefetch del navegador o del router? No es una búsqueda de nadie. */
export function esPrefetch(headers: Headers): boolean {
  if (headers.get("next-router-prefetch")) return true;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  return /prefetch|prerender/i.test(purpose);
}

/**
 * Suma una búsqueda al día de hoy. Se llama una vez por request de la página
 * de resultados (`/buscar`), nunca por un robot ni por un prefetch. No tira.
 */
export async function registrarBusqueda(
  input: { termino: string; resultados: number; headers: Headers },
  now: Date = new Date(),
  executor?: Executor
): Promise<boolean> {
  if (esRobot(input.headers.get("user-agent")) || esPrefetch(input.headers))
    return false;
  const term = normalizarTermino(input.termino);
  if (!term) return false;

  try {
    const tx = executor ?? getDb();
    const day = diaPY(now);
    const zeroResults = input.resultados === 0;

    const [existente] = await tx
      .select({ id: searchDaily.id })
      .from(searchDaily)
      .where(and(eq(searchDaily.day, day), eq(searchDaily.term, term)))
      .limit(1);
    if (!existente) {
      const [fila] = await tx
        .select({ n: sql<number>`COUNT(DISTINCT ${searchDaily.term})` })
        .from(searchDaily)
        .where(eq(searchDaily.day, day));
      if (Number(fila?.n ?? 0) >= MAX_TERMINOS_POR_DIA) return false;
    }

    await tx
      .insert(searchDaily)
      .values({ day, term, zeroResults, count: 1 })
      .onDuplicateKeyUpdate({ set: { count: sql`${searchDaily.count} + 1` } });
    return true;
  } catch (error) {
    log.warn("consultas: no se pudo contar la búsqueda", { error: mensajeDe(error) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Consultas por WhatsApp
// ---------------------------------------------------------------------------

export type ConsultaValida = {
  origin: EnquiryOrigin;
  productId: number;
  variantId: number;
};

/** Orígenes que siempre son de un producto. */
const CON_PRODUCTO: ReadonlySet<EnquiryOrigin> = new Set(["producto", "tarjeta"]);

/**
 * El cuerpo del beacon → una consulta con forma válida, o `null`. Puro: la
 * existencia del producto la mira `registrarConsulta`.
 */
export function parsearConsulta(body: unknown): ConsultaValida | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { o, p, v } = body as Record<string, unknown>;
  if (typeof o !== "string" || !(ENQUIRY_ORIGINS as readonly string[]).includes(o))
    return null;
  const origin = o as EnquiryOrigin;
  const entero = (valor: unknown): number | null => {
    if (valor === undefined || valor === null) return 0;
    return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0 && valor <= 2_147_483_647
      ? valor
      : null;
  };
  const productId = entero(p);
  const variantId = entero(v);
  if (productId === null || variantId === null) return null;
  if (variantId > 0 && productId === 0) return null;
  if (CON_PRODUCTO.has(origin) && productId === 0) return null;
  return { origin, productId, variantId };
}

/**
 * Suma un clic. El producto tiene que existir y estar **publicado** (activo,
 * con fecha de publicación y en una categoría activa, igual que la vidriera);
 * la variante, si viene, tiene que ser suya y estar activa. Devuelve si contó.
 * No tira.
 */
export async function registrarConsulta(
  consulta: ConsultaValida,
  now: Date = new Date(),
  executor?: Executor
): Promise<boolean> {
  try {
    const tx = executor ?? getDb();
    if (consulta.productId > 0) {
      const [publicado] = await tx
        .select({ id: products.id })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(products.id, consulta.productId),
            eq(products.isActive, true),
            isNotNull(products.publishedAt),
            eq(categories.isActive, true)
          )
        )
        .limit(1);
      if (!publicado) return false;
    }
    if (consulta.variantId > 0) {
      const [variante] = await tx
        .select({ id: variants.id })
        .from(variants)
        .where(
          and(
            eq(variants.id, consulta.variantId),
            eq(variants.productId, consulta.productId),
            eq(variants.isActive, true)
          )
        )
        .limit(1);
      if (!variante) return false;
    }

    await tx
      .insert(enquiryDaily)
      .values({
        day: diaPY(now),
        productId: consulta.productId,
        variantId: consulta.variantId,
        origin: consulta.origin,
        count: 1,
      })
      .onDuplicateKeyUpdate({ set: { count: sql`${enquiryDaily.count} + 1` } });
    return true;
  } catch (error) {
    log.warn("consultas: no se pudo contar el clic", { error: mensajeDe(error) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lectura: panel, resumen diario, CSV
// ---------------------------------------------------------------------------

/** Total de consultas de un día paraguayo (el resumen diario usa "ayer"). */
export async function consultasDelDia(day: string, executor?: Executor): Promise<number> {
  const tx = executor ?? getDb();
  const [fila] = await tx
    .select({ n: sql<string | number>`COALESCE(SUM(${enquiryDaily.count}), 0)` })
    .from(enquiryDaily)
    .where(eq(enquiryDaily.day, day));
  return Number(fila?.n ?? 0);
}

export type ConsultasPorProducto = {
  productId: number;
  /** `null` cuando el producto se borró después de la consulta. */
  nombre: string | null;
  slug: string | null;
  d7: number;
  d30: number;
  d90: number;
};

export type ResumenConsultas = {
  /** Productos por consultas de los últimos 90 días, con 7 y 30 al lado. */
  productos: ConsultasPorProducto[];
  /** Consultas sin producto (botón flotante, contacto, guía) en 7/30/90 días. */
  sinProducto: { d7: number; d30: number; d90: number };
  /** Por origen, últimos 30 días. */
  porOrigen: { origin: EnquiryOrigin; total: number }[];
  /** Términos más buscados, últimos 30 días. */
  terminos: { term: string; total: number }[];
  /** Términos que no dieron nada, últimos 30 días. */
  sinResultado: { term: string; total: number }[];
};

const LIMITE_LISTA = 50;

export async function resumenConsultas(
  now: Date = new Date(),
  executor?: Executor
): Promise<ResumenConsultas> {
  const tx = executor ?? getDb();
  const desde7 = diaPYMenos(now, 6);
  const desde30 = diaPYMenos(now, 29);
  const desde90 = diaPYMenos(now, 89);

  const suma = (desde: string) =>
    sql<string | number>`COALESCE(SUM(CASE WHEN ${enquiryDaily.day} >= ${desde} THEN ${enquiryDaily.count} ELSE 0 END), 0)`;
  const total90 = sql<string | number>`COALESCE(SUM(${enquiryDaily.count}), 0)`;

  const [porProducto, porOrigen, terminos, sinResultado] = await Promise.all([
    tx
      .select({
        productId: enquiryDaily.productId,
        nombre: products.name,
        slug: products.slug,
        d7: suma(desde7),
        d30: suma(desde30),
        d90: total90,
      })
      .from(enquiryDaily)
      .leftJoin(products, eq(products.id, enquiryDaily.productId))
      .where(gte(enquiryDaily.day, desde90))
      .groupBy(enquiryDaily.productId, products.name, products.slug)
      .orderBy(desc(total90)),
    tx
      .select({
        origin: enquiryDaily.origin,
        total: sql<string | number>`COALESCE(SUM(${enquiryDaily.count}), 0)`,
      })
      .from(enquiryDaily)
      .where(gte(enquiryDaily.day, desde30))
      .groupBy(enquiryDaily.origin),
    tx
      .select({
        term: searchDaily.term,
        total: sql<string | number>`SUM(${searchDaily.count})`,
      })
      .from(searchDaily)
      .where(gte(searchDaily.day, desde30))
      .groupBy(searchDaily.term)
      .orderBy(desc(sql`SUM(${searchDaily.count})`), searchDaily.term)
      .limit(LIMITE_LISTA),
    tx
      .select({
        term: searchDaily.term,
        total: sql<string | number>`SUM(${searchDaily.count})`,
      })
      .from(searchDaily)
      .where(and(gte(searchDaily.day, desde30), eq(searchDaily.zeroResults, true)))
      .groupBy(searchDaily.term)
      .orderBy(desc(sql`SUM(${searchDaily.count})`), searchDaily.term)
      .limit(LIMITE_LISTA),
  ]);

  const numeros = (fila: { d7: unknown; d30: unknown; d90: unknown }) => ({
    d7: Number(fila.d7),
    d30: Number(fila.d30),
    d90: Number(fila.d90),
  });
  const sin = porProducto.find((fila) => fila.productId === 0);

  return {
    productos: porProducto
      .filter((fila) => fila.productId !== 0)
      .slice(0, LIMITE_LISTA)
      .map((fila) => ({
        productId: fila.productId,
        nombre: fila.nombre,
        slug: fila.slug,
        ...numeros(fila),
      })),
    sinProducto: sin ? numeros(sin) : { d7: 0, d30: 0, d90: 0 },
    porOrigen: ENQUIRY_ORIGINS.map((origin) => ({
      origin,
      total: Number(porOrigen.find((fila) => fila.origin === origin)?.total ?? 0),
    })),
    terminos: terminos.map((fila) => ({ term: fila.term, total: Number(fila.total) })),
    sinResultado: sinResultado.map((fila) => ({ term: fila.term, total: Number(fila.total) })),
  };
}

/**
 * Los últimos 90 días, fila por fila, en un CSV (`src/lib/csv.ts`: `;`, BOM,
 * defensa contra fórmulas). Para quien quiera cruzarlo en una planilla. Sólo
 * lee, y no lleva nada de nadie: día, producto, variante, origen, término.
 */
export async function consultasCsv(now: Date = new Date(), executor?: Executor): Promise<string> {
  const tx = executor ?? getDb();
  const desde = diaPYMenos(now, 89);
  const [clics, busquedas] = await Promise.all([
    tx
      .select({
        day: enquiryDaily.day,
        producto: products.name,
        sku: variants.sku,
        origin: enquiryDaily.origin,
        count: enquiryDaily.count,
      })
      .from(enquiryDaily)
      .leftJoin(products, eq(products.id, enquiryDaily.productId))
      .leftJoin(variants, eq(variants.id, enquiryDaily.variantId))
      .where(gte(enquiryDaily.day, desde))
      .orderBy(enquiryDaily.day, enquiryDaily.id),
    tx
      .select({
        day: searchDaily.day,
        term: searchDaily.term,
        zeroResults: searchDaily.zeroResults,
        count: searchDaily.count,
      })
      .from(searchDaily)
      .where(gte(searchDaily.day, desde))
      .orderBy(searchDaily.day, searchDaily.id),
  ]);

  const filas: CsvValue[][] = [
    ...clics.map((fila) => [
      "consulta",
      fila.day,
      fila.producto ?? "",
      fila.sku ?? "",
      fila.origin,
      "",
      "",
      fila.count,
    ]),
    ...busquedas.map((fila) => [
      "busqueda",
      fila.day,
      "",
      "",
      "",
      fila.term,
      fila.zeroResults ? "si" : "no",
      fila.count,
    ]),
  ];
  return toCsv(
    ["tipo", "dia", "producto", "variante", "origen", "termino", "sin_resultado", "cantidad"],
    filas
  );
}

// ---------------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------------

/** El primer día que se conserva: hoy menos `RETENCION_MESES` meses. */
export function primerDiaConservado(now: Date = new Date()): string {
  const [anio, mes, dia] = diaPY(now).split("-").map(Number) as [number, number, number];
  const total = anio * 12 + (mes - 1) - RETENCION_MESES;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Como texto: "2025-10-31" en un mes de 30 días sigue comparando bien.
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-${pad(dia)}`;
}

/** Borra los conteos de hace más de 13 meses. Lo corre el cron de mantenimiento. */
export async function podarConteos(
  now: Date = new Date(),
  executor?: Executor
): Promise<number> {
  const tx = executor ?? getDb();
  const corte = primerDiaConservado(now);
  const afectadas = (result: unknown) => {
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: number })?.affectedRows ?? 0);
  };
  const a = await tx.delete(enquiryDaily).where(lt(enquiryDaily.day, corte));
  const b = await tx.delete(searchDaily).where(lt(searchDaily.day, corte));
  return afectadas(a) + afectadas(b);
}
