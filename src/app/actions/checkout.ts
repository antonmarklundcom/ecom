"use server";

import { z } from "zod";

import { CheckoutError, createOrder } from "@/domain/create-order";
import { orderUrl } from "@/domain/order-access";
import { pagoparCheckoutRedirectUrl, startPagoparCheckout } from "@/domain/pagopar/checkout";
import { DOC_TYPES, PAYMENT_METHODS } from "@/db/schema";
import type { CartIssue } from "@/lib/cart-issues";

/**
 * Server action del checkout.
 *
 * Recibe el carrito del navegador y devuelve la URL tokenizada del pedido.
 * Los montos no viajan en el input: los calcula `createOrder` desde la DB.
 */

const CheckoutActionSchema = z.object({
  items: z
    .array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(99) }))
    .min(1, "El carrito está vacío"),
  customerName: z.string().trim().min(3, "Poné tu nombre completo").max(160),
  customerPhone: z.string().trim().min(6, "Falta tu WhatsApp").max(30),
  customerEmail: z.string().trim().max(200).optional().or(z.literal("")),
  docType: z.enum(DOC_TYPES),
  docNumber: z.string().trim().max(32).optional().or(z.literal("")),
  isConsumidorFinal: z.boolean(),
  shipCity: z.string().trim().min(2, "Falta la ciudad").max(120),
  shipBarrio: z.string().trim().max(120).optional().or(z.literal("")),
  shipAddress: z.string().trim().min(5, "Falta la dirección").max(255),
  shipReference: z.string().trim().max(255).optional().or(z.literal("")),
  paymentMethod: z.enum(PAYMENT_METHODS),
});

export type CheckoutResult =
  | { ok: true; orderNumber: string; redirectTo: string; warning?: string }
  | { ok: false; error: string; issues?: CartIssue[] };

export async function submitCheckout(input: unknown): Promise<CheckoutResult> {
  const parsed = CheckoutActionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Revisá los datos del formulario." };
  }

  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder({
      ...parsed.data,
      customerEmail: parsed.data.customerEmail || null,
      docNumber: parsed.data.docNumber || null,
      shipBarrio: parsed.data.shipBarrio || null,
      shipReference: parsed.data.shipReference || null,
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { ok: false, error: error.message, issues: error.issues };
    }
    // El detalle queda en el log del servidor; al comprador no le sirve.
    console.error("createOrder falló", error);
    return { ok: false, error: "No pudimos crear el pedido. Probá de nuevo en un momento." };
  }

  const fallback = orderUrl(order.orderNumber, order.accessToken);

  if (parsed.data.paymentMethod !== "tarjeta") {
    return { ok: true, orderNumber: order.orderNumber, redirectTo: fallback };
  }

  // El pedido y la reserva de stock ya quedaron escritos (createOrder,
  // arriba) — si Pagopar falla acá, el pedido no se pierde: el comprador
  // sigue teniendo el link tokenizado, sólo que sin la redirección directa a
  // pagar. La reserva de 45 min de "tarjeta" (RESERVATION_TTL_MINUTES) le da
  // margen para reintentar.
  try {
    const { hashPedido } = await startPagoparCheckout(order.orderId);
    return {
      ok: true,
      orderNumber: order.orderNumber,
      redirectTo: pagoparCheckoutRedirectUrl(hashPedido),
    };
  } catch (error) {
    console.error(`no pude iniciar el pago con Pagopar para ${order.orderNumber}`, error);
    return {
      ok: true,
      orderNumber: order.orderNumber,
      redirectTo: fallback,
      warning: "Creamos tu pedido, pero no pudimos abrir la pasarela de pago. Escribinos por WhatsApp.",
    };
  }
}
