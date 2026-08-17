import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { shippingZones } from "@/db/schema";

import type { Executor } from "./executor";

/**
 * Envío por zona. El precio sale de `shipping_zones`, nunca del navegador.
 *
 * El flete está gravado con IVA 10% incluido, igual que el precio de góndola.
 * Es el tratamiento habitual en PY; conviene confirmarlo con el contador del
 * comercio antes de emitir facturas legales (fase 2).
 */
export const SHIPPING_IVA_RATE = 10;

export type ShippingQuote = {
  zoneId: number | null;
  zoneName: string;
  shippingPyg: number;
  isFree: boolean;
  /**
   * `false` cuando la ciudad no cayó en ninguna zona y se usó la tarifa más
   * cara. No cambia lo que se cobra —eso ya está decidido abajo— pero deja
   * que la pantalla lo diga en vez de mostrar el nombre de una zona que la
   * compradora no eligió.
   */
  matched: boolean;
  /** Umbral de envío gratis de la zona elegida. NULL = la zona no lo ofrece. */
  freeThresholdPyg: number | null;
};

/** Ciudad sin acentos, sin dobles espacios y en minúsculas. */
export function normalizeCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cotiza el envío para una ciudad y un subtotal.
 *
 * Si la ciudad no cae en ninguna zona, usa la más cara: cobrar de menos por
 * un pueblo que no está en la lista sale del bolsillo del comercio.
 */
export async function quoteShipping(
  city: string,
  subtotalPyg: number,
  executor?: Executor
): Promise<ShippingQuote> {
  const tx = executor ?? getDb();
  const zones = await tx
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.isActive, true))
    .orderBy(asc(shippingZones.position));

  if (zones.length === 0) {
    return {
      zoneId: null,
      zoneName: "Sin zonas configuradas",
      shippingPyg: 0,
      isFree: true,
      matched: false,
      freeThresholdPyg: null,
    };
  }

  const target = normalizeCity(city);
  const found = zones.find((zone) => zone.cities.some((name) => normalizeCity(name) === target));
  const zone =
    found ?? zones.reduce((worst, item) => (item.pricePyg > worst.pricePyg ? item : worst), zones[0]!);

  const isFree = zone.freeThresholdPyg !== null && subtotalPyg >= zone.freeThresholdPyg;

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    shippingPyg: isFree ? 0 : zone.pricePyg,
    isFree,
    matched: found !== undefined,
    freeThresholdPyg: zone.freeThresholdPyg,
  };
}

export async function listShippingZones(executor?: Executor) {
  const tx = executor ?? getDb();
  return tx
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.isActive, true))
    .orderBy(asc(shippingZones.position));
}
