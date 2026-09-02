"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminShippingError,
  createShippingZone,
  moveShippingZone,
  setShippingZoneActive,
  updateShippingZone,
} from "@/domain/admin-shipping";
import {
  adminActionError,
  requireOwnerSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
import { t } from "@/i18n";

/**
 * ABM de zonas de envío (PLAN.md FASE 2, PR K). **Todas owner-only.**
 *
 * El flete es plata que entra en cada pedido, y el error se cobra en silencio:
 * una zona con el precio viejo no rompe nada, no aparece en ningún log y se
 * descubre al cerrar el mes. Es de las tres cosas que el dueño no delega.
 *
 * El navegador manda el **texto** de las ciudades y un número de guaraníes; la
 * normalización, la unicidad de ciudades entre zonas y la regla de la última
 * zona activa viven en `src/domain/admin-shipping.ts`, adentro de la
 * transacción y con las filas bloqueadas.
 *
 * No se revalida el checkout: la cotización se recalcula server-side en cada
 * pedido (`quoteShipping`), así que no hay ninguna página cacheada con un
 * precio de flete adentro.
 */

// El largo por ciudad es el de `orders.ship_city` (varchar 120): contra esa columna
// se comparan después, así que una ciudad más larga nunca podría coincidir.
const CitiesSchema = z.array(z.string().max(120)).max(400);

const ZoneDataSchema = z.object({
  name: z.string().trim().min(1, t("adminForm.nombreZona")).max(160),
  slug: z.string().trim().max(120).optional(),
  cities: CitiesSchema,
  pricePyg: z.number().int(t("adminForm.precioEntero")).min(0),
  /** `null` explícito = esta zona no ofrece envío gratis. */
  freeThresholdPyg: z.number().int(t("adminForm.umbralEntero")).positive().nullable(),
});

export async function crearZonaEnvio(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  try {
    await requireOwnerSession();

    const parsed = ZoneDataSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t("adminError.revisaDatos") };
    }

    const created = await createShippingZone({
      name: parsed.data.name,
      slug: parsed.data.slug || null,
      cities: parsed.data.cities,
      pricePyg: parsed.data.pricePyg,
      freeThresholdPyg: parsed.data.freeThresholdPyg,
    });

    revalidatePath("/admin/envios");
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("crearZonaEnvio", error);
  }
}

const UpdateSchema = z.object({
  zoneId: z.number().int().positive(),
  data: ZoneDataSchema,
});

export async function editarZonaEnvio(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t("adminError.revisaDatos") };
    }

    await updateShippingZone({
      zoneId: parsed.data.zoneId,
      data: {
        name: parsed.data.data.name,
        slug: parsed.data.data.slug || null,
        cities: parsed.data.data.cities,
        pricePyg: parsed.data.data.pricePyg,
        freeThresholdPyg: parsed.data.data.freeThresholdPyg,
      },
    });

    revalidatePath("/admin/envios");
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("editarZonaEnvio", error);
  }
}

const ActiveSchema = z.object({
  zoneId: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function cambiarEstadoZonaEnvio(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = ActiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.zona") };

    await setShippingZoneActive({
      zoneId: parsed.data.zoneId,
      isActive: parsed.data.isActive,
    });

    revalidatePath("/admin/envios");
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("cambiarEstadoZonaEnvio", error);
  }
}

const MoveSchema = z.object({
  zoneId: z.number().int().positive(),
  direction: z.enum(["up", "down"]),
});

export async function moverZonaEnvio(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: t("adminError.noEntendi.mover") };

    await moveShippingZone({
      zoneId: parsed.data.zoneId,
      direction: parsed.data.direction,
    });

    revalidatePath("/admin/envios");
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("moverZonaEnvio", error);
  }
}
