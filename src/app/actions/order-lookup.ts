"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { findOrderByNumberAndPhone, orderUrl } from "@/domain/order-access";
import { LOOKUP_LIMIT, LOOKUP_WINDOW_MS, clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Búsqueda del pedido por número + teléfono (PLAN.md 3.9).
 *
 * Dos reglas, las dos para que esto no sirva de enumerador:
 * 1. rate limit de 5 intentos por IP cada 15 minutos;
 * 2. un único mensaje de error, igual para "no existe", "el teléfono no
 *    coincide" y "el formato está mal". Cualquier diferencia convierte el
 *    formulario en un oráculo de números de pedido válidos.
 */

const GENERIC_ERROR =
  "No encontramos un pedido con esos datos. Revisá el número y el teléfono que usaste al comprar.";

const LookupSchema = z.object({
  orderNumber: z.string().trim().min(3).max(16),
  phone: z.string().trim().min(6).max(30),
});

export type LookupResult = { ok: true; redirectTo: string } | { ok: false; error: string };

export async function lookupOrder(input: unknown): Promise<LookupResult> {
  const ip = clientIp(await headers());
  const limit = rateLimit(`lookup:${ip}`, { limit: LOOKUP_LIMIT, windowMs: LOOKUP_WINDOW_MS });

  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Demasiados intentos. Probá de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}, o escribinos por WhatsApp.`,
    };
  }

  const parsed = LookupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const found = await findOrderByNumberAndPhone(parsed.data.orderNumber, parsed.data.phone);
  if (!found) {
    return { ok: false, error: GENERIC_ERROR };
  }

  return { ok: true, redirectTo: orderUrl(found.orderNumber, found.accessToken) };
}
