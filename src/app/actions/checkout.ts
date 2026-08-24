"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { registrarCheckoutIniciado, registrarCompra } from "@/domain/analytics";
import { CheckoutError, TotalChangedError, createOrder } from "@/domain/create-order";
import { notifyNewOrder } from "@/domain/messaging/order-notification";
import { orderUrl } from "@/domain/order-access";
import { isPagoparConfigured, pagoparCheckoutUrl } from "@/domain/pagopar/config";
import { startPagoparCheckout } from "@/domain/pagopar/checkout";
import { DOC_TYPES, PAYMENT_METHODS } from "@/db/schema";
import type { CartIssue } from "@/lib/cart-issues";
import { t } from "@/i18n";
import { currentCustomer } from "@/lib/customer-session";
import { visitIdActual } from "@/lib/visit-cookie";
import {
  CHECKOUT_LIMIT,
  CHECKOUT_WINDOW_MS,
  clientIp,
  rateLimit,
} from "@/lib/rate-limit";

/**
 * Server action del checkout.
 *
 * Recibe el carrito del navegador y devuelve la URL tokenizada del pedido.
 * Los montos no viajan en el input: los calcula `createOrder` desde la DB.
 *
 * Es una acción **pública** —los compradores son anónimos, ARCH.md §1 regla 3—
 * así que no hay sesión que verificar. Lo que sí hay es un límite por IP: cada
 * pedido creado reserva stock por 45 minutos o 24 horas sin que nadie haya
 * pagado nada, y un script sin freno deja la vidriera en "sin stock" gratis.
 */

const CheckoutActionSchema = z.object({
  items: z
    .array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(99) }))
    .min(1, "El carrito está vacío"),
  customerName: z.string().trim().min(3, "Poné tu nombre completo").max(160),
  customerPhone: z.string().trim().min(6, "Falta tu WhatsApp").max(30),
  // Opcional de verdad: vacío es lo normal y se guarda como NULL. Lo que no
  // pasa es un email mal escrito — desde que el campo se renderiza (PR A.3)
  // esta columna recibe lo que tipeó una persona, y un "juan@" guardado es un
  // dato que nadie va a poder usar el día que el WhatsApp falle.
  customerEmail: z
    .union([z.literal(""), z.email("Revisá el email: parece incompleto").max(200)])
    .optional(),
  docType: z.enum(DOC_TYPES),
  docNumber: z.string().trim().max(32).optional().or(z.literal("")),
  isConsumidorFinal: z.boolean(),
  shipCity: z.string().trim().min(2, "Falta la ciudad").max(120),
  shipBarrio: z.string().trim().max(120).optional().or(z.literal("")),
  shipAddress: z.string().trim().min(5, "Falta la dirección").max(255),
  shipReference: z.string().trim().max(255).optional().or(z.literal("")),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Ausente = no se preguntó (un POST viejo, o el formulario sin la casilla).
  // No se completa con `false`: ver `orders.marketing_opt_in`.
  /** El código tipeado. El descuento lo calcula el servidor (PR G). */
  couponCode: z.string().trim().max(40).optional(),
  marketingOptIn: z.boolean().optional(),
  isGift: z.boolean().optional(),
  giftNote: z.string().trim().max(300).optional().or(z.literal("")),
  // El total que el navegador venía mostrando. Se compara contra el que
  // calcula la DB para poder avisar que cambió; nunca se cobra (ver
  // `CreateOrderInput.expectedTotalPyg`).
  expectedTotalPyg: z.number().int().nonnegative().optional(),
});

export type CheckoutResult =
  | { ok: true; orderNumber: string; redirectTo: string }
  | {
      ok: false;
      error: string;
      issues?: CartIssue[];
      /**
       * El total cambió mientras completaba el formulario. No se creó nada:
       * la pantalla muestra el número nuevo y ella confirma otra vez.
       */
      totalChanged?: { before: number; after: number };
    };

export async function submitCheckout(input: unknown): Promise<CheckoutResult> {
  // Antes de mirar el cuerpo: lo caro de este endpoint no es validarlo sino la
  // transacción que reserva stock al final.
  const ip = clientIp(await headers());
  if (!rateLimit(`checkout:${ip}`, { limit: CHECKOUT_LIMIT, windowMs: CHECKOUT_WINDOW_MS }).ok) {
    return { ok: false, error: t("error.checkout.demasiadosIntentos") };
  }

  const parsed = CheckoutActionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? t("error.checkout.revisaDatos") };
  }

  // El form ya lo oculta si no está configurado; esto es el guard del lado
  // servidor para quien lo intente igual con un POST directo.
  if (parsed.data.paymentMethod === "tarjeta" && !isPagoparConfigured()) {
    return { ok: false, error: t("error.checkout.sinTarjeta") };
  }

  // Los dos escalones de abajo del embudo se anotan **acá y no en el
  // dominio**: `createOrder` es maquinaria del camino de la plata y no tiene
  // por qué enterarse de que existe una analítica. Acá, en la acción, el
  // registro queda fuera de la transacción del pedido — que es la propiedad
  // que importa, porque un INSERT de estadística que falle adentro haría
  // rollback de un pedido bueno.
  //
  // El `visitId` sale de la cookie, igual que el `customerId` sale de la
  // sesión: nada de identidad viaja en el formulario.
  const visitId = await visitIdActual();

  // "Inició el checkout" = apretó confirmar con datos que pasaron el schema y
  // el rate limit. No es "abrió /checkout", que ya queda medido por el
  // pageview de esa ruta. Se anota **antes** de crear el pedido, a propósito:
  // el escalón tiene que contar también a quien no llegó a comprar —un cupón
  // vencido, stock que se acabó mientras completaba— porque ése es
  // exactamente el abandono que el embudo existe para mostrar.
  if (visitId !== null) await registrarCheckoutIniciado(visitId);

  try {
    // La cuenta sale de **la cookie**, no del formulario: un `customerId` que
    // viaje en el input deja atar la compra propia a la cuenta de cualquiera.
    // Sin sesión —el checkout de invitado, que es el camino principal— queda
    // null y el pedido es exactamente el de siempre.
    const customer = await currentCustomer();

    const order = await createOrder({
      ...parsed.data,
      customerId: customer?.customerId ?? null,
      couponCode: parsed.data.couponCode || null,
      customerEmail: parsed.data.customerEmail || null,
      docNumber: parsed.data.docNumber || null,
      shipBarrio: parsed.data.shipBarrio || null,
      shipReference: parsed.data.shipReference || null,
      giftNote: parsed.data.giftNote || null,
    });

    // El pedido ya está escrito y su stock reservado. Nada de lo que siga
    // —esto y el aviso de abajo— puede tumbarlo: las dos cosas atrapan sus
    // propios errores y no tiran (ver `registrarCompra` y `notifyNewOrder`).
    //
    // Sin monto: la fila guarda el `orderId` y listo. Cuánto entró y si entró
    // se leen de `orders` al consultar, así que un pedido que después se vence
    // o se reembolsa deja de contar como conversión sin que nadie tenga que
    // acordarse de tocar nada.
    if (visitId !== null) await registrarCompra(visitId, order.orderId);

    // Se avisa acá, para todo método de pago: transferencia y contra entrega
    // ya necesitan que el dueño mire el pedido (revisar el comprobante,
    // preparar el envío), y con tarjeta prefiero un aviso de más — un
    // checkout abandonado en Pagopar— a uno de menos. No tira: ver
    // `notifyNewOrder`.
    await notifyNewOrder({
      orderNumber: order.orderNumber,
      totalPyg: order.totalPyg,
      customerName: parsed.data.customerName,
    });

    if (parsed.data.paymentMethod === "tarjeta") {
      // El pedido y la reserva de stock (45 min, RESERVATION_TTL_MINUTES.tarjeta)
      // ya quedaron escritos por `createOrder`; acá sólo se abre la transacción
      // en Pagopar y se manda al comprador a pagar.
      try {
        const started = await startPagoparCheckout(order.orderId);
        return {
          ok: true,
          orderNumber: order.orderNumber,
          redirectTo: pagoparCheckoutUrl(started.hashPedido),
        };
      } catch (pagoparError) {
        console.error("startPagoparCheckout falló", pagoparError);
        // El pedido y su reserva de 45 min ya quedaron escritos: no se pierden
        // por un error de red con Pagopar. Mandamos al comprador a la página
        // de su pedido en vez de a un checkout roto; desde ahí puede
        // contactar al comercio para reintentar.
        return {
          ok: true,
          orderNumber: order.orderNumber,
          redirectTo: orderUrl(order.orderNumber, order.accessToken),
        };
      }
    }

    return {
      ok: true,
      orderNumber: order.orderNumber,
      redirectTo: orderUrl(order.orderNumber, order.accessToken),
    };
  } catch (error) {
    // Antes que CheckoutError: es una subclase suya.
    if (error instanceof TotalChangedError) {
      return {
        ok: false,
        error: error.message,
        totalChanged: { before: error.before, after: error.after },
      };
    }
    if (error instanceof CheckoutError) {
      return { ok: false, error: error.message, issues: error.issues };
    }
    // El detalle queda en el log del servidor; al comprador no le sirve.
    console.error("createOrder falló", error);
    return { ok: false, error: t("error.checkout.generico") };
  }
}
