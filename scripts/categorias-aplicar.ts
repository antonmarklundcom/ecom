import "../src/lib/load-env";

import { readFileSync } from "node:fs";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { closePool, getDb } from "../src/db";
import { categories } from "../src/db/schema";
import type { Executor } from "../src/domain/executor";
import { safeError } from "../src/lib/safe-error";

/**
 * `pnpm categorias:aplicar` — el árbol de categorías y sus textos, desde un
 * archivo revisado (O35, fable/plan-trafico.md §2.4).
 *
 * Lee `src/content/categorias.json` (o el archivo que se le pase): una lista
 * de categorías con slug, nombre, madre, posición, descripción, título SEO y
 * descripción SEO. Ver `docs/SEO.md` § "categorias.json".
 *
 * - **Ensayo por defecto**: sin `--aplicar` muestra lo que haría y no escribe.
 * - Valida el archivo **entero** antes de escribir nada: un slug repetido, una
 *   madre que no está ni en el archivo ni en la base, o un ciclo frenan todo.
 * - Una sola transacción: entra todo o nada.
 * - **Nunca borra** una categoría, ni la activa o desactiva.
 * - En una categoría que ya existe sólo llena los campos **vacíos**; con
 *   `--pisar` reemplaza nombre, madre, posición y textos por los del archivo.
 *   Una categoría nueva entra con todo lo del archivo, activa.
 * - Una línea por categoría: `+` nueva, `~` cambia (qué campos), `=` igual.
 *
 * Necesita `DATABASE_URL` (quien lo corre es el dueño). La vidriera toma los
 * cambios en el próximo revalidate (5 minutos como mucho).
 *
 *   pnpm categorias:aplicar                    # ensayo con src/content/categorias.json
 *   pnpm categorias:aplicar --aplicar          # escribe
 *   pnpm categorias:aplicar --aplicar --pisar  # y reemplaza lo que ya había
 *   pnpm categorias:aplicar otro.json          # otro archivo
 */

export const ARCHIVO_CATEGORIAS = "src/content/categorias.json";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Texto opcional: vacío o sólo espacios cuenta como "no lo dice". */
const textoOpcional = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((valor) => (valor?.trim() ? valor.trim() : null));

export const EntradaCategoriaSchema = z
  .object({
    slug: z.string().max(120).regex(SLUG, "slug inválido (minúsculas, números y guiones)"),
    nombre: z.string().trim().min(1).max(120),
    padre: z
      .string()
      .nullish()
      .transform((valor) => (valor?.trim() ? valor.trim() : null)),
    posicion: z.number().int().min(0).max(1_000_000).nullish(),
    descripcion: textoOpcional(65_535),
    seoTitulo: textoOpcional(200),
    seoDescripcion: textoOpcional(500),
  })
  .strict();

export type EntradaCategoria = z.infer<typeof EntradaCategoriaSchema>;

/** Una categoría como está en la base, con lo que este script puede tocar. */
export type CategoriaExistente = {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  position: number;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

/** Los campos que se escriben, con el nombre de la columna. */
type Campos = {
  name: string;
  parentSlug: string | null;
  position: number;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type PasoCategoria =
  | { slug: string; accion: "nueva"; campos: Campos }
  | {
      slug: string;
      accion: "cambia";
      id: number;
      cambios: Partial<Campos>;
    }
  | { slug: string; accion: "igual"; id: number };

export type PlanCategorias =
  | { ok: true; pasos: PasoCategoria[] }
  | { ok: false; errores: string[] };

/**
 * El plan entero, sin tocar la base: valida y decide qué cambia. Puro.
 *
 * `existentes`: **todas** las categorías de la base (activas o no).
 */
export function planCategorias(
  datos: unknown,
  existentes: readonly CategoriaExistente[],
  opciones: { pisar: boolean }
): PlanCategorias {
  const lista = z.array(z.unknown()).safeParse(datos);
  if (!lista.success)
    return { ok: false, errores: ["el archivo tiene que ser una lista ([…]) de categorías"] };

  const errores: string[] = [];
  const entradas: EntradaCategoria[] = [];
  lista.data.forEach((crudo, indice) => {
    const entrada = EntradaCategoriaSchema.safeParse(crudo);
    if (entrada.success) entradas.push(entrada.data);
    else
      errores.push(
        `#${indice + 1}${slugDe(crudo)}: ${entrada.error.issues
          .map((issue) => `${issue.path.join(".") || "(entrada)"} ${issue.message}`)
          .join("; ")}`
      );
  });

  const vistos = new Set<string>();
  for (const entrada of entradas) {
    if (vistos.has(entrada.slug)) errores.push(`${entrada.slug}: slug repetido en el archivo`);
    vistos.add(entrada.slug);
  }

  const porSlug = new Map(existentes.map((categoria) => [categoria.slug, categoria]));
  const porId = new Map(existentes.map((categoria) => [categoria.id, categoria]));
  for (const entrada of entradas) {
    if (entrada.padre === null) continue;
    if (entrada.padre === entrada.slug)
      errores.push(`${entrada.slug}: no puede ser su propia madre`);
    else if (!vistos.has(entrada.padre) && !porSlug.has(entrada.padre))
      errores.push(`${entrada.slug}: la madre "${entrada.padre}" no está ni en el archivo ni en la base`);
  }
  if (errores.length > 0) return { ok: false, errores };

  const pasos: PasoCategoria[] = entradas.map((entrada, indice) => {
    const deseado: Campos = {
      name: entrada.nombre,
      parentSlug: entrada.padre,
      position: entrada.posicion ?? indice,
      description: entrada.descripcion,
      seoTitle: entrada.seoTitulo,
      seoDescription: entrada.seoDescripcion,
    };
    const actual = porSlug.get(entrada.slug);
    if (!actual) return { slug: entrada.slug, accion: "nueva", campos: deseado };

    const madreActual =
      actual.parentId === null ? null : (porId.get(actual.parentId)?.slug ?? null);
    const cambios: Partial<Campos> = {};
    const vacio = (valor: string | null) => valor === null || valor.trim() === "";
    if (opciones.pisar) {
      if (deseado.name !== actual.name) cambios.name = deseado.name;
      if (deseado.parentSlug !== madreActual) cambios.parentSlug = deseado.parentSlug;
      if (entrada.posicion != null && deseado.position !== actual.position)
        cambios.position = deseado.position;
      // Con `--pisar` un texto ausente en el archivo no borra el de la base:
      // el archivo dice lo que sabe, no lo que no.
      if (deseado.description !== null && deseado.description !== actual.description)
        cambios.description = deseado.description;
      if (deseado.seoTitle !== null && deseado.seoTitle !== actual.seoTitle)
        cambios.seoTitle = deseado.seoTitle;
      if (deseado.seoDescription !== null && deseado.seoDescription !== actual.seoDescription)
        cambios.seoDescription = deseado.seoDescription;
    } else {
      if (madreActual === null && deseado.parentSlug !== null)
        cambios.parentSlug = deseado.parentSlug;
      if (vacio(actual.description) && deseado.description !== null)
        cambios.description = deseado.description;
      if (vacio(actual.seoTitle) && deseado.seoTitle !== null) cambios.seoTitle = deseado.seoTitle;
      if (vacio(actual.seoDescription) && deseado.seoDescription !== null)
        cambios.seoDescription = deseado.seoDescription;
    }
    return Object.keys(cambios).length > 0
      ? { slug: entrada.slug, accion: "cambia", id: actual.id, cambios }
      : { slug: entrada.slug, accion: "igual", id: actual.id };
  });

  // Un ciclo en el árbol final (A madre de B y B madre de A) colgaría la miga
  // de pan: se rechaza antes de escribir.
  const madreFinal = new Map<string, string | null>(
    existentes.map((categoria) => [
      categoria.slug,
      categoria.parentId === null ? null : (porId.get(categoria.parentId)?.slug ?? null),
    ])
  );
  for (const paso of pasos) {
    if (paso.accion === "nueva") madreFinal.set(paso.slug, paso.campos.parentSlug);
    if (paso.accion === "cambia" && paso.cambios.parentSlug !== undefined)
      madreFinal.set(paso.slug, paso.cambios.parentSlug);
  }
  for (const paso of pasos) {
    const camino = new Set<string>([paso.slug]);
    let actual = madreFinal.get(paso.slug) ?? null;
    while (actual !== null) {
      if (camino.has(actual)) {
        return { ok: false, errores: [`${paso.slug}: el árbol queda con un ciclo (${[...camino, actual].join(" → ")})`] };
      }
      camino.add(actual);
      actual = madreFinal.get(actual) ?? null;
    }
  }

  return { ok: true, pasos };
}

function slugDe(crudo: unknown): string {
  return crudo && typeof crudo === "object" && typeof (crudo as { slug?: unknown }).slug === "string"
    ? ` (${(crudo as { slug: string }).slug})`
    : "";
}

/** Una línea por categoría, para la terminal. */
export function lineaPaso(paso: PasoCategoria): string {
  if (paso.accion === "nueva") return `+ ${paso.slug}  nueva`;
  if (paso.accion === "igual") return `= ${paso.slug}  sin cambios`;
  const nombres: Record<keyof Campos, string> = {
    name: "nombre",
    parentSlug: "madre",
    position: "posición",
    description: "descripción",
    seoTitle: "título SEO",
    seoDescription: "descripción SEO",
  };
  return `~ ${paso.slug}  ${(Object.keys(paso.cambios) as (keyof Campos)[])
    .map((campo) => nombres[campo])
    .join(", ")}`;
}

/** Todas las categorías, con las columnas que mira el plan. */
export async function leerCategorias(executor: Executor): Promise<CategoriaExistente[]> {
  return executor
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      position: categories.position,
      description: categories.description,
      seoTitle: categories.seoTitle,
      seoDescription: categories.seoDescription,
    })
    .from(categories)
    .orderBy(asc(categories.id));
}

/**
 * Lee la base, arma el plan y, con `aplicar`, lo escribe en **una**
 * transacción (el plan se rearma adentro, con las filas bloqueadas por la
 * misma transacción). Devuelve el plan.
 */
export async function aplicarCategorias(
  db: ReturnType<typeof getDb>,
  datos: unknown,
  opciones: { aplicar: boolean; pisar: boolean }
): Promise<PlanCategorias> {
  if (!opciones.aplicar) return planCategorias(datos, await leerCategorias(db), opciones);

  return db.transaction(async (tx) => {
    const plan = planCategorias(datos, await leerCategorias(tx), opciones);
    if (!plan.ok) return plan;

    // Primero las nuevas (sin madre), después las madres de todas: así una
    // madre que también es nueva ya tiene id.
    for (const paso of plan.pasos) {
      if (paso.accion !== "nueva") continue;
      await tx.insert(categories).values({
        slug: paso.slug,
        name: paso.campos.name,
        position: paso.campos.position,
        description: paso.campos.description,
        seoTitle: paso.campos.seoTitle,
        seoDescription: paso.campos.seoDescription,
      });
    }
    const ids = new Map((await leerCategorias(tx)).map((fila) => [fila.slug, fila.id]));
    const idDe = (slug: string | null) => (slug === null ? null : (ids.get(slug) ?? null));

    for (const paso of plan.pasos) {
      if (paso.accion === "nueva") {
        if (paso.campos.parentSlug !== null)
          await tx
            .update(categories)
            .set({ parentId: idDe(paso.campos.parentSlug) })
            .where(eq(categories.slug, paso.slug));
        continue;
      }
      if (paso.accion !== "cambia") continue;
      const { parentSlug, ...resto } = paso.cambios;
      await tx
        .update(categories)
        .set({
          ...resto,
          ...(parentSlug !== undefined ? { parentId: idDe(parentSlug) } : {}),
        })
        .where(eq(categories.id, paso.id));
    }
    return plan;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const aplicar = args.includes("--aplicar");
  const pisar = args.includes("--pisar");
  const desconocidos = args.filter(
    (arg) => arg.startsWith("-") && arg !== "--aplicar" && arg !== "--pisar"
  );
  if (desconocidos.length > 0) {
    console.error(`Opción desconocida: ${desconocidos.join(" ")}`);
    console.error("Uso: pnpm categorias:aplicar [archivo.json] [--aplicar] [--pisar]");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL: este comando lee y escribe la base de la tienda.");
    process.exit(2);
  }
  const archivo = args.find((arg) => !arg.startsWith("-")) ?? ARCHIVO_CATEGORIAS;

  let datos: unknown;
  try {
    datos = JSON.parse(readFileSync(archivo, "utf8"));
  } catch (error) {
    console.error(`No pude leer ${archivo}: ${safeError(error).message}`);
    process.exit(2);
  }

  try {
    const plan = await aplicarCategorias(getDb(), datos, { aplicar, pisar });
    if (!plan.ok) {
      console.error(`✗ ${archivo} no se aplicó (nada se escribió):`);
      for (const error of plan.errores) console.error(`  ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${aplicar ? "Aplicado" : "Ensayo (nada se escribió; --aplicar para escribir)"}: ${archivo}${pisar ? " (--pisar)" : ""}`
    );
    for (const paso of plan.pasos) console.log(lineaPaso(paso));
    const cuenta = (accion: PasoCategoria["accion"]) =>
      plan.pasos.filter((paso) => paso.accion === accion).length;
    console.log(`${cuenta("nueva")} nuevas, ${cuenta("cambia")} con cambios, ${cuenta("igual")} iguales.`);
  } catch (error) {
    console.error(`✗ ${safeError(error).message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && /categorias-aplicar\.ts$/.test(process.argv[1])) {
  void main();
}
