"use server";

import { z } from "zod";

import { registrarAgregadoAlCarrito } from "@/domain/analytics";
import { priceCart, type PricedCart } from "@/domain/cart";
import { freeShippingWithoutZone, type FreeShippingProgress } from "@/domain/free-shipping";
import { listShippingZones } from "@/domain/shipping";
import {
  ANALYTICS_CART_LIMIT,
  ANALYTICS_CART_WINDOW_MS,
  rateLimit,
} from "@/lib/rate-limit";
import { visitIdActual } from "@/lib/visit-cookie";

/**
 * Server action que revalida el carrito. La llama el slide-over al abrirse y
 * el checkout al entrar: es el único momento en que los precios que ve el
 * comprador vuelven a coincidir con la DB.
 */

const LineasSchema = z.array(
  z.object({
    variantId: z.number().int().positive(),
    qty: z.number().int().min(1).max(99),
    // Lo que el navegador venía mostrando: sirve para avisar del cambio,
    // nunca para cobrar.
    unitPricePyg: z.number().int().nonnegative().optional(),
  })
);

/**
 * El input acepta **las dos formas**: el array pelado de siempre, y un objeto
 * con las líneas más el gesto que disparó la llamada.
 *
 * La forma vieja se sigue aceptando y no es cortesía con nadie: este template
 * se clona, y una tienda ya creada que traiga esta mejora por `template:diff`
 * puede tener su `cart-store.ts` rediseñado —es piel— y seguir mandando el
 * array. Con la unión, ahí el carrito sigue funcionando exactamente igual y lo
 * único que no hay es el número de "agregados al carrito".
 */
const RevalidateInputSchema = z.union([
  LineasSchema.transform((lines) => ({ lines, agregado: undefined as number | undefined })),
  z.object({
    lines: LineasSchema,
    /**
     * La variante que **se acaba de agregar**, si esta llamada viene de ese
     * gesto. Es lo único que deja fila de analítica.
     *
     * Una variante y no un booleano: abrir el carrito con cuatro líneas
     * adentro revalida exactamente igual que agregar la cuarta, así que un
     * "sí, fue un agregar" haría contar las cuatro cada vez. La pregunta que
     * contesta el escalón del embudo es "¿qué se agregó?", y sólo el navegador
     * sabe cuál de las líneas es la nueva.
     *
     * Que **haya sido** un agregar es lo único de acá que el servidor no puede
     * verificar, y por eso el evento está clasificado como "nivel 2" y no como
     * verificado (ver `src/domain/analytics.ts`). Lo que sí verifica es que la
     * variante exista y esté en el carrito re-preciado: un id inventado no
     * deja fila.
     */
    agregado: z.number().int().positive().optional(),
  }),
]);

/**
 * Además del re-precio, el progreso hacia el envío gratis.
 *
 * Va acá y no en una llamada aparte porque es el mismo momento y el mismo
 * carrito: dos viajes al servidor para dibujar una barra sería un viaje de
 * más en una red móvil paraguaya. El carrito todavía no sabe la ciudad, así
 * que el estado que sale de acá suele ser el "indefinido" —el que se dibuja
 * con la aclaración— y recién el checkout, con la ciudad puesta, consigue el
 * número exacto (ver `quoteCartShipping`).
 */
export type RevalidatedCart = PricedCart & { freeShipping: FreeShippingProgress };

const EMPTY: RevalidatedCart = {
  lines: [],
  subtotalPyg: 0,
  iva10Pyg: 0,
  iva5Pyg: 0,
  issues: [],
  freeShipping: { kind: "sin_umbral" },
};

export async function revalidateCart(input: unknown): Promise<RevalidatedCart> {
  const parsed = RevalidateInputSchema.safeParse(input);
  if (!parsed.success) return EMPTY;

  const { lines, agregado } = parsed.data;

  const expectedPrices = new Map<number, number>();
  for (const item of lines) {
    if (item.unitPricePyg !== undefined) expectedPrices.set(item.variantId, item.unitPricePyg);
  }

  const priced = await priceCart(
    lines.map((item) => ({ variantId: item.variantId, qty: item.qty })),
    { expectedPrices }
  );

  // Después de re-preciar y nunca antes: así la variante que queda registrada
  // es una que existe en la base, no un id que mandó el navegador.
  if (agregado !== undefined) await registrarAgregado(priced, agregado);

  // Las zonas no se cachean acá a propósito: son cuatro filas y el dueño las
  // edita el día que cambia el flete.
  const zones = await listShippingZones().catch(() => []);

  return { ...priced, freeShipping: freeShippingWithoutZone(zones, priced.subtotalPyg) };
}

/**
 * Deja la fila de "agregado al carrito" — el escalón 2 del embudo.
 *
 * ### Por qué viaja pegada a la revalidación y no en su propia acción
 *
 * Porque `revalidateCart` es la llamada que el carrito **ya hace** al agregar
 * algo (ver `sync()` en `src/lib/cart-store.ts`). Una acción aparte sería un
 * viaje de red más por cada "agregar", y este repo ya tomó esa decisión una
 * vez, por escrito, cuando metió el progreso de envío gratis en esta misma
 * respuesta: en una conexión móvil paraguaya un viaje de más se nota.
 *
 * De paso hace el número difícil de bloquear: no hay una petición de analítica
 * separada que un bloqueador pueda cortar sin romper el carrito.
 *
 * ### Por qué acá hay un rate limit y antes no había ninguno
 *
 * Hasta este cambio `revalidateCart` era la única acción del repo sin guard, y
 * la razón estaba escrita en `tests/unit/security-review.test.ts`: no tocaba
 * nada del servidor. Ahora puede escribir una fila, así que la razón ya no
 * vale y el límite es lo que la devuelve al mismo régimen que el resto.
 *
 * El límite cubre **sólo** este camino. Un carrito que se abre, se revalida y
 * se cotiza sigue sin límite y sin escribir nada: quien esté comprando nunca
 * se topa con esto.
 *
 * Nunca tira ni cambia lo que devuelve la acción: si esto falla, el carrito se
 * revalida igual (ver `registrarAgregadoAlCarrito`).
 */
async function registrarAgregado(priced: PricedCart, variantId: number): Promise<void> {
  // La variante tiene que estar en el carrito **re-preciado**, o sea existir y
  // estar a la venta. Es lo que separa "el navegador dice que agregó algo" de
  // "el servidor confirma qué es ese algo".
  if (!priced.lines.some((line) => line.variantId === variantId)) return;

  const visitId = await visitIdActual();
  if (visitId === null) return;

  if (!rateLimit(`analytics:carrito:${visitId}`, {
    limit: ANALYTICS_CART_LIMIT,
    windowMs: ANALYTICS_CART_WINDOW_MS,
  }).ok) {
    return;
  }

  // La cantidad no se guarda: la pregunta que contesta este escalón es
  // "¿cuánta gente llega hasta acá?", y "agregó 3" no la contesta mejor que
  // "agregó".
  await registrarAgregadoAlCarrito(visitId, variantId);
}
