import { and, asc, count, eq, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { slugify } from "@/lib/slug";

import type { Executor } from "./executor";

/**
 * ABM de categorías para el panel (PLAN.md FASE 2, PR J).
 *
 * Hasta acá esta tabla la escribía **sólo el seed**: una tienda que quería una
 * categoría nueva llamaba al desarrollador. Eso es exactamente lo que la FASE
 * 2 viene a sacar del medio.
 *
 * Dos reglas que no son negociables y por eso viven en el dominio y no en el
 * formulario:
 *
 * 1. **No hay borrado.** `products.category_id` es NOT NULL con
 *    `onDelete: 'restrict'`: la fila no se puede borrar mientras tenga
 *    productos, y borrar la de una categoría vacía sólo serviría para que
 *    mañana no se entienda de dónde salió el hueco en el orden. Se desactiva.
 * 2. **El slug es una URL.** Cambiarlo rompe lo que Google indexó y lo que la
 *    gente compartió por WhatsApp. Se permite —es la tienda del dueño— pero la
 *    pantalla lo dice con todas las letras antes de guardar.
 */

export class AdminCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCategoryError";
  }
}

export type AdminCategoryRow = {
  id: number;
  slug: string;
  name: string;
  position: number;
  isActive: boolean;
  /** Productos que cuelgan de la categoría, publicados o no. */
  productCount: number;
  /** De ésos, los que hoy se ven en la vidriera. Es el número que importa
   *  antes de desactivar: son los que van a desaparecer. */
  visibleCount: number;
};

export async function listAdminCategories(executor?: Executor): Promise<AdminCategoryRow[]> {
  const tx = executor ?? getDb();

  const rows = await tx
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      position: categories.position,
      isActive: categories.isActive,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));

  const counts = await tx
    .select({
      categoryId: products.categoryId,
      total: count(),
      visible: sql<number>`SUM(CASE WHEN ${products.isActive} = 1 AND ${products.publishedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(products)
    .groupBy(products.categoryId);

  const byCategory = new Map(counts.map((row) => [Number(row.categoryId), row]));

  return rows.map((row) => ({
    ...row,
    productCount: Number(byCategory.get(row.id)?.total ?? 0),
    visibleCount: Number(byCategory.get(row.id)?.visible ?? 0),
  }));
}

export type CategoryInput = {
  name: string;
  /** Vacío = se deriva del nombre. */
  slug?: string;
  isActive?: boolean;
};

function normalize(input: CategoryInput): { name: string; slug: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new AdminCategoryError("El nombre necesita al menos 2 caracteres.");
  if (name.length > 120) throw new AdminCategoryError("El nombre es demasiado largo.");

  const slug = slugify(input.slug?.trim() || name);
  if (slug.length < 2) {
    throw new AdminCategoryError(
      "De ese nombre no sale una URL usable. Escribí el enlace a mano."
    );
  }
  if (slug.length > 120) throw new AdminCategoryError("El enlace es demasiado largo.");

  return { name, slug };
}

async function assertSlugFree(tx: Executor, slug: string, exceptId: number | null): Promise<void> {
  const rows = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  const clash = rows[0];
  if (clash && clash.id !== exceptId) {
    throw new AdminCategoryError(`Ya hay una categoría con el enlace "${slug}".`);
  }
}

export async function createCategory(input: CategoryInput): Promise<number> {
  const { name, slug } = normalize(input);

  return getDb().transaction(async (tx) => {
    await assertSlugFree(tx, slug, null);

    // Al final del orden: una categoría nueva no se le mete adelante a las que
    // el dueño ya acomodó.
    const last = await tx
      .select({ max: sql<number>`COALESCE(MAX(${categories.position}), -1)` })
      .from(categories);

    await tx.insert(categories).values({
      slug,
      name,
      position: Number(last[0]?.max ?? -1) + 1,
      isActive: input.isActive ?? true,
    });

    const created = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    const id = created[0]?.id;
    if (!id) throw new AdminCategoryError("No pude crear la categoría.");
    return id;
  });
}

export async function updateCategory(id: number, input: CategoryInput): Promise<void> {
  const { name, slug } = normalize(input);

  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!rows[0]) throw new AdminCategoryError("Esa categoría no existe.");

    await assertSlugFree(tx, slug, id);

    await tx.update(categories).set({ name, slug }).where(eq(categories.id, id));
  });
}

/**
 * Prender y apagar.
 *
 * Apagada, la categoría desaparece del menú, su página deja de existir **y sus
 * productos salen de la vidriera** (ver el filtro de `src/db/queries.ts`). Los
 * productos no se tocan: conservan su `is_active` y su `published_at`, así que
 * volver a prender la categoría los devuelve tal cual estaban.
 *
 * Es asimétrico a propósito: apagar no pide nada, y por eso la pantalla avisa
 * cuántos productos se van a llevar puestos antes de que el dueño confirme.
 */
export async function setCategoryActive(id: number, isActive: boolean): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!rows[0]) throw new AdminCategoryError("Esa categoría no existe.");

  await db.update(categories).set({ isActive }).where(eq(categories.id, id));
}

/**
 * Subir o bajar una categoría en el menú.
 *
 * Intercambia posiciones con la vecina en vez de aceptar un número: el dueño
 * piensa "esta va arriba de aquella", no "esta es la 3". Va en transacción con
 * las dos filas bloqueadas — dos pestañas reordenando a la vez dejarían dos
 * categorías con la misma posición, y el desempate silencioso es por nombre.
 */
export async function moveCategory(id: number, direction: "arriba" | "abajo"): Promise<void> {
  return getDb().transaction(async (tx) => {
    const all = await tx
      .select({ id: categories.id, position: categories.position, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name))
      .for("update");

    const index = all.findIndex((row) => row.id === id);
    if (index === -1) throw new AdminCategoryError("Esa categoría no existe.");

    const targetIndex = direction === "arriba" ? index - 1 : index + 1;
    // Ya está en la punta: no es un error, es un botón que no hace nada.
    if (targetIndex < 0 || targetIndex >= all.length) return;

    // Se reescribe el orden entero y no sólo el par: las posiciones heredadas
    // del seed pueden venir empatadas o con huecos, y un swap sobre empates no
    // mueve nada. Normalizar deja el orden que la pantalla ya está mostrando.
    const reordered = [...all];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);

    for (const [position, row] of reordered.entries()) {
      if (row.position === position) continue;
      await tx.update(categories).set({ position }).where(eq(categories.id, row.id));
    }
  });
}

/**
 * Cuántas categorías activas quedarían además de ésta.
 *
 * La usa la pantalla para avisar "vas a dejar la tienda sin categorías", que
 * es un estado válido —una tienda en pausa— pero nunca es lo que alguien
 * quiso hacer sin darse cuenta.
 */
export async function otrasCategoriasActivas(id: number, executor?: Executor): Promise<number> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select({ n: count() })
    .from(categories)
    .where(and(eq(categories.isActive, true), ne(categories.id, id)));
  return Number(rows[0]?.n ?? 0);
}

/** Productos publicados que hoy cuelgan de la categoría. */
export async function productosVisibles(id: number, executor?: Executor): Promise<number> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select({ n: count() })
    .from(products)
    .where(
      and(eq(products.categoryId, id), eq(products.isActive, true), isNotNull(products.publishedAt))
    );
  return Number(rows[0]?.n ?? 0);
}
