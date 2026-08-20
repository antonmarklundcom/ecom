"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminShippingError,
  createShippingZone,
  setShippingZoneActive,
  updateShippingZone,
} from "@/domain/admin-shipping";
import {
  adminActionError,
  requireOwnerSession,
  type AdminActionResult,
} from "@/lib/admin-guard";

/**
 * ABM de zonas de envío (PLAN.md FASE 2, PR K).
 *
 * **Owner-only: el flete es plata.** Quien puede poner el envío en ₲0 puede
 * regalar la logística de toda la tienda, y eso no es una decisión de
 * mostrador. Es el mismo criterio que cupones y reembolsos (ARCH.md §1).
 *
 * Las validaciones de monto viven en `src/domain/admin-shipping.ts` con
 * `assertGs`, no acá: un precio con decimales no es un problema de formulario,
 * es plata mal representada.
 */

function revalidarEnvios(): void {
  revalidatePath("/admin/envios");
  // La cotización del checkout se recalcula server-side en cada request, pero
  // el aviso de "te faltan ₲X para el envío gratis" se renderiza en páginas
  // cacheadas de la vidriera.
  revalidatePath("/", "layout");
}

const CitiesSchema = z.array(z.string().max(120)).max(300);

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre").max(160),
  slug: z.string().trim().max(120).optional(),
  cities: CitiesSchema,
  pricePyg: z.number().int().min(0, "El precio no puede ser negativo"),
  freeThresholdPyg: z.number().int().min(0).nullable().optional(),
});

export async function crearZonaEnvio(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  try {
    await requireOwnerSession();

    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    const id = await createShippingZone(parsed.data);

    revalidarEnvios();
    return { ok: true, id };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("crearZonaEnvio", error);
  }
}

const EditSchema = CreateSchema.extend({ id: z.number().int().positive() });

export async function editarZonaEnvio(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = EditSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    const { id, ...zone } = parsed.data;
    await updateShippingZone(id, zone);

    revalidarEnvios();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("editarZonaEnvio", error);
  }
}

const ActiveSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean(),
});

export async function cambiarEstadoZonaEnvio(input: unknown): Promise<AdminActionResult> {
  try {
    await requireOwnerSession();

    const parsed = ActiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "No entendí qué zona cambiar." };

    await setShippingZoneActive(parsed.data.id, parsed.data.isActive);

    revalidarEnvios();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminShippingError) return { ok: false, error: error.message };
    return adminActionError("cambiarEstadoZonaEnvio", error);
  }
}
