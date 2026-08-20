import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { shippingZones } from "@/db/schema";
import { assertGs } from "@/lib/money";
import { slugify } from "@/lib/slug";

import type { Executor } from "./executor";
import { normalizeCity } from "./shipping";

/**
 * ABM de zonas de envío para el panel (PLAN.md FASE 2, PR K).
 *
 * El flete es plata: `quoteShipping()` lee de esta tabla y `computeOrderTotals`
 * lo suma al total. Por eso los precios pasan por `assertGs` —enteros en
 * guaraníes, jamás un float— igual que cualquier otro monto del sistema.
 *
 * **Un pedido en vuelo no se rompe.** La cotización se recalcula server-side
 * en cada paso del checkout contra el estado actual de esta tabla, así que
 * cambiar una tarifa acá cambia lo que se cobra de ahí en adelante y nada
 * más: los pedidos ya creados guardan su propio `shipping_pyg` y no se
 * recalculan nunca.
 */

export class AdminShippingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminShippingError";
  }
}

export type AdminShippingZoneRow = {
  id: number;
  slug: string;
  name: string;
  cities: string[];
  pricePyg: number;
  freeThresholdPyg: number | null;
  isActive: boolean;
  position: number;
};

export async function listAdminShippingZones(
  executor?: Executor
): Promise<AdminShippingZoneRow[]> {
  const tx = executor ?? getDb();
  const rows = await tx
    .select()
    .from(shippingZones)
    .orderBy(asc(shippingZones.position), asc(shippingZones.name));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    cities: row.cities ?? [],
    pricePyg: row.pricePyg,
    freeThresholdPyg: row.freeThresholdPyg,
    isActive: row.isActive,
    position: row.position,
  }));
}

export type ShippingZoneInput = {
  name: string;
  slug?: string;
  cities: string[];
  pricePyg: number;
  freeThresholdPyg?: number | null;
  isActive?: boolean;
};

type Normalized = {
  name: string;
  slug: string;
  cities: string[];
  pricePyg: number;
  freeThresholdPyg: number | null;
};

/**
 * Las reglas que no se le pueden confiar al formulario.
 *
 * La de las ciudades no es cosmética: `quoteShipping()` compara con
 * `normalizeCity()` —sin acentos, en minúsculas—, así que "Ciudad del Este" y
 * "ciudad del este" son la misma. Dejar las dos en la lista no rompe la
 * cotización pero sí la pantalla del dueño, que muestra una zona con ciudades
 * repetidas y no explica por qué.
 */
function normalize(input: ShippingZoneInput): Normalized {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new AdminShippingError("La zona necesita un nombre.");
  if (name.length > 160) throw new AdminShippingError("El nombre es demasiado largo.");

  const slug = slugify(input.slug?.trim() || name);
  if (slug.length < 2) throw new AdminShippingError("De ese nombre no sale un identificador.");
  if (slug.length > 120) throw new AdminShippingError("El identificador es demasiado largo.");

  const vistas = new Set<string>();
  const cities: string[] = [];
  for (const raw of input.cities) {
    const city = raw.trim().replace(/\s+/g, " ");
    if (!city) continue;
    if (city.length > 120) throw new AdminShippingError(`"${city}" no parece una ciudad.`);
    const key = normalizeCity(city);
    if (vistas.has(key)) continue;
    vistas.add(key);
    cities.push(city);
  }

  assertGs(input.pricePyg, "precio del envío");

  const freeThresholdPyg = input.freeThresholdPyg ?? null;
  if (freeThresholdPyg !== null) {
    assertGs(freeThresholdPyg, "umbral de envío gratis");
    if (freeThresholdPyg === 0) {
      // Un umbral de ₲0 hace que todo pedido viaje gratis. Se puede querer,
      // pero casi siempre es "dejé el campo en cero sin pensarlo": la forma
      // deliberada de tener envío gratis siempre es precio 0.
      throw new AdminShippingError(
        "Un umbral de ₲0 regala todos los envíos. Si es lo que querés, poné el precio en 0."
      );
    }
  }

  return { name, slug, cities, pricePyg: input.pricePyg, freeThresholdPyg };
}

async function assertSlugFree(tx: Executor, slug: string, exceptId: number | null): Promise<void> {
  const rows = await tx
    .select({ id: shippingZones.id })
    .from(shippingZones)
    .where(eq(shippingZones.slug, slug))
    .limit(1);
  const clash = rows[0];
  if (clash && clash.id !== exceptId) {
    throw new AdminShippingError(`Ya hay una zona con el identificador "${slug}".`);
  }
}

export async function createShippingZone(input: ShippingZoneInput): Promise<number> {
  const zone = normalize(input);

  return getDb().transaction(async (tx) => {
    await assertSlugFree(tx, zone.slug, null);

    const last = await tx
      .select({ max: sql<number>`COALESCE(MAX(${shippingZones.position}), -1)` })
      .from(shippingZones);

    await tx.insert(shippingZones).values({
      slug: zone.slug,
      name: zone.name,
      cities: zone.cities,
      pricePyg: zone.pricePyg,
      freeThresholdPyg: zone.freeThresholdPyg,
      isActive: input.isActive ?? true,
      position: Number(last[0]?.max ?? -1) + 1,
    });

    const created = await tx
      .select({ id: shippingZones.id })
      .from(shippingZones)
      .where(eq(shippingZones.slug, zone.slug))
      .limit(1);
    const id = created[0]?.id;
    if (!id) throw new AdminShippingError("No pude crear la zona.");
    return id;
  });
}

export async function updateShippingZone(id: number, input: ShippingZoneInput): Promise<void> {
  const zone = normalize(input);

  return getDb().transaction(async (tx) => {
    const rows = await tx.select().from(shippingZones).where(eq(shippingZones.id, id)).limit(1);
    if (!rows[0]) throw new AdminShippingError("Esa zona no existe.");

    await assertSlugFree(tx, zone.slug, id);

    await tx
      .update(shippingZones)
      .set({
        slug: zone.slug,
        name: zone.name,
        cities: zone.cities,
        pricePyg: zone.pricePyg,
        freeThresholdPyg: zone.freeThresholdPyg,
      })
      .where(eq(shippingZones.id, id));
  });
}

/**
 * Prender y apagar.
 *
 * **Apagar la última zona activa no está prohibido, pero cambia lo que se
 * cobra**: sin zonas, `quoteShipping()` devuelve `sin_zonas` y el envío sale
 * ₲0 para todo el mundo. Es el estado en el que sale una tienda recién
 * clonada, y es coherente —una tienda que no configuró envíos no los cobra—,
 * pero llegar ahí por accidente es regalar el flete. La pantalla lo avisa.
 */
export async function setShippingZoneActive(id: number, isActive: boolean): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: shippingZones.id })
    .from(shippingZones)
    .where(eq(shippingZones.id, id))
    .limit(1);
  if (!rows[0]) throw new AdminShippingError("Esa zona no existe.");

  await db.update(shippingZones).set({ isActive }).where(eq(shippingZones.id, id));
}
