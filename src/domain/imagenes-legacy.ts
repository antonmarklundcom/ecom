import { and, isNotNull, not, like, sql } from "drizzle-orm";

import { TIENDA } from "@/config/tienda";
import { getDb } from "@/db";
import { bankDetails, categories, productImages, receipts } from "@/db/schema";
import { esRefR2 } from "@/lib/imagenes-r2";

import type { Executor } from "./executor";
import { readStoreSettings } from "./store-settings";

/**
 * Las referencias de imagen que **no** son de R2: lo que quedó del
 * almacenamiento anterior en una tienda que se actualizó.
 *
 * No se rompen —una referencia que no es de R2 se dibuja como placeholder,
 * nunca como una URL rota—, pero se ven como fotos que faltan. `pnpm
 * preflight` las cuenta y avisa; el script de migración de fotos (NEW-STORE.md)
 * las trae a R2 y reescribe la referencia.
 */

export type RefsLegacy = {
  productImages: number;
  categories: number;
  bankQr: number;
  /** Portada, logo y favicon de `/admin/ajustes`. */
  storeSettings: number;
  /** `TIENDA.hero.imagen` en `src/config/tienda.ts`: se edita a mano. */
  tiendaConfig: number;
  /** Comprobantes privados (se ven en el panel; no se dibujan en la vidriera). */
  receipts: number;
};

export function totalRefsLegacy(refs: RefsLegacy): number {
  return Object.values(refs).reduce((a, b) => a + b, 0);
}

async function contar(
  tx: Executor,
  tabla: typeof productImages | typeof categories | typeof bankDetails | typeof receipts,
  condicion: ReturnType<typeof and>
): Promise<number> {
  const [fila] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(tabla)
    .where(condicion);
  return Number(fila?.n ?? 0);
}

export async function contarRefsLegacy(executor?: Executor): Promise<RefsLegacy> {
  const tx = executor ?? getDb();
  const { settings } = await readStoreSettings(tx);
  const ajustes = [
    settings.marca.heroImagenId,
    settings.identidad.logoId,
    settings.identidad.faviconId,
  ].filter((ref): ref is string => typeof ref === "string" && ref.trim() !== "" && !esRefR2(ref));

  const heroConfig = TIENDA.hero?.imagen?.imageRef;

  return {
    productImages: await contar(
      tx,
      productImages,
      and(not(like(productImages.imageRef, "r2:p1/%")))
    ),
    categories: await contar(
      tx,
      categories,
      and(isNotNull(categories.imageRef), not(like(categories.imageRef, "r2:p1/%")))
    ),
    bankQr: await contar(
      tx,
      bankDetails,
      and(isNotNull(bankDetails.qrImageRef), not(like(bankDetails.qrImageRef, "r2:p1/%")))
    ),
    storeSettings: ajustes.length,
    tiendaConfig: heroConfig && !esRefR2(heroConfig) ? 1 : 0,
    receipts: await contar(tx, receipts, and(not(like(receipts.storageKey, "r2:%")))),
  };
}
