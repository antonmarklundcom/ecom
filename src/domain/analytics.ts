import { getDb } from '@/db';
import { analyticsEvents, type AnalyticsEventType } from '@/db/schema';

import type { Executor } from './executor';

/**
 * Analítica propia — el lado que **escribe**. El que lee es
 * `admin-analytics.ts`.
 *
 * =========================================================================
 * ALCANCE Y PRIVACIDAD — esto es una decisión, no lo que quedó
 * =========================================================================
 *
 * Este template **no tiene** Google Analytics, ni el píxel de Meta, ni ningún
 * script de terceros. No es una omisión que alguien vaya a "completar"
 * después: es el diseño. Lo que se mide, se mide acá, contra la base de esta
 * tienda, y no sale del servidor del comercio.
 *
 * Lo que se guarda, en total: un número al azar por navegador, un tipo de
 * evento, a veces una ruta de la propia tienda, a veces el id de una variante,
 * a veces el id de un pedido, y la fecha.
 *
 * Lo que **no** se guarda, y por qué cada cosa:
 *
 * - **La IP.** Es un dato personal en cualquier marco moderno y no contesta
 *   ninguna pregunta que el dueño se haga. `clientIp()` existe en el repo para
 *   el rate limit, que la usa en memoria y no la escribe en ningún lado; acá
 *   ni se lee.
 * - **El user-agent, el idioma, la resolución.** Son los ingredientes del
 *   fingerprinting. Juntando tres o cuatro se identifica a una persona sin
 *   cookie, que es justamente lo que la cookie está evitando tener que hacer.
 * - **El referrer.** Diría de qué sitio vino, o sea información de la
 *   navegación de alguien fuera de esta tienda.
 * - **El querystring.** Se corta en `normalizarPath`. Incluye el `?q=` de la
 *   búsqueda, que es texto que tipeó una persona.
 * - **Teléfono, nombre, email, dirección.** Nada de eso entra en esta tabla.
 *   El único puente con una persona real es `order_id`, y ese pedido tiene los
 *   datos porque hay que llevarle la caja a alguna dirección — no porque los
 *   pida la analítica. Cero datos personales nuevos: es la regla de alcance.
 *
 * Y no hay seguimiento entre sitios de ninguna forma: la cookie es de primera
 * parte, `SameSite=Lax`, y no se comparte con nadie porque no hay nadie con
 * quien compartirla.
 *
 * =========================================================================
 * QUÉ TAN CONFIABLE ES CADA NÚMERO
 * =========================================================================
 *
 * No son todos iguales, y mezclarlos en una pantalla sin decirlo es la forma
 * más común de que el dueño tome una decisión con un número que no significa
 * lo que él cree. Hay tres niveles y la pantalla del panel los distingue:
 *
 * **1. `visita` — reportada por el navegador, "lo mejor que se pudo".**
 * La dispara un componente cliente (`visit-tracker.tsx`) contra
 * `/api/analytics/visita`. Un bloqueador de publicidad, JavaScript apagado o
 * una pestaña cerrada antes de tiempo la pierden, y cualquiera con `curl`
 * puede inventar mil. Es la limitación de **toda** la analítica web, propia o
 * de Google, y se acepta sabiéndola: las visitas son una magnitud, no un
 * conteo exacto. Lo que sí hace el servidor es no creerle nada más que el
 * hecho: la ruta la normaliza él, la fecha la pone él, y el `visitId` sale de
 * la cookie y no del cuerpo del pedido.
 *
 * **2. `carrito_agregado` — la escribe el servidor, la dispara el cliente.**
 * Viaja pegada a `revalidateCart`, que es la llamada que el carrito **ya
 * hace** al agregar algo (`src/lib/cart-store.ts`). Bloquearla rompe el
 * carrito, así que en la práctica no se bloquea; y no cuesta un viaje de red
 * extra, que en una conexión móvil paraguaya no es un detalle. El gesto lo
 * declara el cliente (`evento: "agregar"`, para distinguirlo de abrir el
 * carrito, que llama a lo mismo), pero **qué** se agregó lo lee el servidor de
 * la base al re-preciar. Alguien puede inflar el número; no puede inventar una
 * variante que no existe.
 *
 * **3. `checkout_iniciado` y `compra` — verificadas por el servidor.**
 * Las escribe `submitCheckout` después de que el input pasó el schema, el
 * rate limit y —en el caso de `compra`— después de que `createOrder` devolvió
 * un pedido escrito de verdad. Son los dos números del embudo donde está la
 * plata y son los dos que no dependen de que el navegador colabore. Si algún
 * día un número tiene que ser el que manda en una discusión, es éste.
 *
 * Nótese qué **no** hay: un evento de cliente para "entró al checkout". La
 * visita a `/checkout` ya queda en el nivel 1 y `checkout_iniciado` es el
 * gesto de confirmar, que es el que de verdad separa a quien miró el
 * formulario de quien lo completó. Un tercer evento a mitad de camino sería
 * una fila más para decir lo mismo peor.
 *
 * =========================================================================
 * NUNCA TIRA
 * =========================================================================
 *
 * Todas las funciones de este módulo atrapan sus propios errores y no
 * devuelven nada, exactamente como `notifyNewOrder`
 * (`messaging/order-notification.ts`) y por el mismo motivo, sólo que acá el
 * motivo es más fuerte: `registrarCompra` corre justo después de que el pedido
 * y su reserva de stock quedaron escritos. Una tabla de estadísticas llena, un
 * deadlock o una columna que falta porque alguien no corrió `db:push`
 * **no pueden** tumbar un checkout que ya cobró. Se pierde el dato y queda en
 * el log del servidor; el pedido no se toca.
 *
 * Corolario que vale escribir: nada de esto va adentro de la transacción de
 * `createOrder`. Se llama desde la server action, después. Un `INSERT` de
 * analítica adentro de esa transacción sería una fila más que puede fallar y
 * hacer rollback de un pedido bueno, y un candado más que sostener mientras
 * `reserveStock` tiene variantes bloqueadas.
 */

/** El largo de la columna `path`. Se recorta acá, no en MySQL. */
export const MAX_PATH_LENGTH = 255;

/**
 * Deja una ruta de la tienda en algo que se pueda contar.
 *
 * Devuelve `null` para lo que no hay que guardar, y quien llama descarta el
 * evento entero: es preferible perder un pageview a guardar una fila que
 * ensucia el reporte para siempre.
 *
 * Qué hace, y el porqué de cada regla:
 *
 * - **Corta el querystring y el fragmento.** Privacidad (`?q=` es texto
 *   tipeado por una persona) y cardinalidad: sin esto `/buscar` se convierte
 *   en una ruta distinta por cada búsqueda y el ranking de páginas queda
 *   inservible.
 * - **Exige que empiece con `/` y rechaza `//`.** Un `//sitio-ajeno.py` es una
 *   URL absoluta disfrazada de ruta; guardarla dejaría un dominio de otro
 *   dentro del reporte de esta tienda.
 * - **Saca la barra final** salvo en la raíz, para que `/carrito` y
 *   `/carrito/` no sean dos filas del mismo ranking.
 * - **Recorta a 255.** Un slug largo se guarda cortado en vez de hacer fallar
 *   el INSERT.
 *
 * Lo que **no** hace: agrupar los segmentos dinámicos.
 * `/producto/corpino-encaje` se guarda tal cual y no como `/producto/[slug]`,
 * porque la pregunta que el dueño hace es "¿qué producto trae gente que
 * compra?", y un `[slug]` la contesta con un número solo que no sirve para
 * nada.
 *
 * Pura y sin dependencias: se testea sin base (`tests/unit/analytics.test.ts`).
 */
export function normalizarPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const sinFragmento = raw.split('#')[0] ?? '';
  const sinQuery = sinFragmento.split('?')[0] ?? '';
  const limpio = sinQuery.trim();

  if (limpio === '') return null;
  if (!limpio.startsWith('/')) return null;
  // `//host` y `/\host` son URLs absolutas que el navegador resuelve afuera.
  if (limpio.startsWith('//') || limpio.startsWith('/\\')) return null;
  // Un carácter de control o un espacio en una ruta no vienen de una
  // navegación real: eso es alguien probando el endpoint a mano.
  if (/[\u0000-\u0020\u007f]/.test(limpio)) return null;

  const sinBarraFinal = limpio.length > 1 ? limpio.replace(/\/+$/, '') : limpio;
  const final = sinBarraFinal === '' ? '/' : sinBarraFinal;

  return final.slice(0, MAX_PATH_LENGTH);
}

type EventoBase = {
  visitId: string;
  type: AnalyticsEventType;
  path?: string | null;
  variantId?: number | null;
  orderId?: number | null;
};

/**
 * El único `INSERT` del módulo, y el único `try/catch`.
 *
 * Todas las funciones de abajo pasan por acá para que la regla de "nunca tira"
 * esté escrita una sola vez: cuatro `try/catch` copiados son cuatro lugares
 * donde el próximo evento se olvida del suyo.
 */
async function registrar(evento: EventoBase, executor?: Executor): Promise<void> {
  try {
    const tx = executor ?? getDb();
    await tx.insert(analyticsEvents).values({
      visitId: evento.visitId,
      type: evento.type,
      path: evento.path ?? null,
      variantId: evento.variantId ?? null,
      orderId: evento.orderId ?? null,
    });
  } catch (error) {
    // Sin el `visitId` ni el `orderId` en el mensaje: el log de un hosting
    // compartido lo lee cualquiera con acceso al hPanel, y de todos modos para
    // diagnosticar alcanza con saber qué evento se perdió.
    console.error(`analytics: no se pudo registrar "${evento.type}"`, error);
  }
}

/**
 * Nivel 1 — reportada por el navegador. La llama `/api/analytics/visita`.
 *
 * `path` ya tiene que venir por `normalizarPath`; la ruta se encarga.
 */
export async function registrarVisita(
  visitId: string,
  path: string,
  executor?: Executor,
): Promise<void> {
  await registrar({ visitId, type: 'visita', path }, executor);
}

/**
 * Nivel 2 — la escribe el servidor al re-preciar el carrito.
 *
 * Una fila por variante agregada. `revalidateCart` llama a esto **después** de
 * `priceCart`, así que la variante existe y su precio salió de la base.
 */
export async function registrarAgregadoAlCarrito(
  visitId: string,
  variantId: number,
  executor?: Executor,
): Promise<void> {
  await registrar({ visitId, type: 'carrito_agregado', variantId }, executor);
}

/** Nivel 3 — verificada por el servidor: alguien confirmó el checkout. */
export async function registrarCheckoutIniciado(
  visitId: string,
  executor?: Executor,
): Promise<void> {
  await registrar({ visitId, type: 'checkout_iniciado' }, executor);
}

/**
 * Nivel 3 — verificada por el servidor: el pedido quedó escrito.
 *
 * Se llama **fuera** de la transacción de `createOrder` y con el `orderId` que
 * ésta devolvió. Sin monto: lo que se cobró y si se cobró se leen de `orders`
 * al consultar (ver el encabezado de la tabla en `schema.ts`).
 */
export async function registrarCompra(
  visitId: string,
  orderId: number,
  executor?: Executor,
): Promise<void> {
  await registrar({ visitId, type: 'compra', orderId }, executor);
}
