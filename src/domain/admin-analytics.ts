import { and, count, countDistinct, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { analyticsEvents, orders, products, variants } from '@/db/schema';

import { REVENUE_STATUSES } from './admin-dashboard';
import type { Executor } from './executor';

/**
 * Analítica propia — el lado que **lee**. El que escribe es `analytics.ts`.
 *
 * Todo acá es agregación por rango de fechas sobre `analytics_events`, con
 * `orders` del otro lado cada vez que aparece plata. No hay una sola tabla de
 * pre-agregado, y esa ausencia es una decisión: ver "Escala" al final.
 *
 * ### Qué es "una conversión"
 *
 * Una definición y una sola, usada por todas las funciones de este archivo:
 * **una visita convirtió si dejó un evento `compra` cuyo pedido está hoy en
 * `REVENUE_STATUSES`.**
 *
 * Los dos lados de eso importan:
 *
 * - Se cuenta *la visita*, no el pedido. Una persona que compró dos veces en
 *   el rango convirtió una vez, porque el denominador son navegadores y el
 *   numerador tiene que ser la misma unidad. Si no, una tasa puede dar más de
 *   100 % y nadie entiende por qué.
 * - Se lee el estado **de hoy**, contra `orders`, con la misma lista que usa
 *   el resumen del panel (`REVENUE_STATUSES` en `admin-dashboard.ts`). Un
 *   pedido que se venció sin pagarse o que se reembolsó **deja** de contar
 *   como conversión, retroactivamente y solo. Ésa es la razón de que la tabla
 *   de eventos no guarde ni el monto ni el estado: guardarlos sería congelar
 *   una respuesta que tiene que poder cambiar.
 *
 * ### Los cortes de fecha
 *
 * `desde`/`hasta` son instantes UTC que ya salieron del día paraguayo
 * (`parsePyDateInput` / `parsePyDateInputEnd` en `lib/py.ts`), igual que en
 * `/admin/actividad`. Medianoche de Asunción, no de UTC: si no, "ayer" empieza
 * a las 20:00 y el dueño no reconoce ninguno de sus números.
 *
 * ### Escala — por qué no hay rollups
 *
 * Una tienda paraguaya chica hace del orden de miles a decenas de miles de
 * pageviews por mes. Aun siendo generosos, un año son unos cientos de miles de
 * filas, y estas consultas filtran por `(type, created_at)` o `(visit_id,
 * created_at)`, que son índices que ya existen. Eso son milisegundos.
 *
 * Una tabla de rollup diario costaría un job programado, un backfill, un
 * segundo lugar donde el número puede estar mal y la pregunta —imposible de
 * contestar después— de qué hacer con un pedido que cambia de estado tres
 * semanas más tarde y ya está sumado en un total del mes pasado. Es
 * complejidad sin pagar, exactamente como el paquete compartido de
 * `src/domain` que NEW-STORE.md difiere hasta que sean muchas tiendas.
 *
 * Lo que sí hay es una cota al crecimiento, y es la aburrida: `pnpm
 * analytics:purge` borra lo más viejo que `ANALYTICS_RETENTION_DAYS`. Si algún
 * día una tienda de este template mide millones de pageviews por mes, ahí —y
 * recién ahí— vale la pena un rollup, y la señal para saberlo es concreta:
 * esta pantalla tardando.
 */

export type RangoAnalytics = {
  /** Instante UTC inclusive. */
  desde: Date;
  /** Instante UTC exclusivo. */
  hasta: Date;
};

/** Los días que se ofrecen en el selector de la pantalla. */
export const RANGOS_DIAS = [7, 30, 90] as const;
export const RANGO_DIAS_DEFAULT = 30;

/**
 * Cuántos días mirar, a partir de lo que vino en la URL.
 *
 * Pura y exportada para testear: es el borde entre un querystring que escribe
 * cualquiera y una consulta con fechas. Un `?dias=99999` sin esto es un scan
 * de la tabla entera servido a pedido.
 */
export function diasDelRango(valor: string | undefined): number {
  const n = Number(valor);
  if (!Number.isInteger(n)) return RANGO_DIAS_DEFAULT;
  return (RANGOS_DIAS as readonly number[]).includes(n) ? n : RANGO_DIAS_DEFAULT;
}

/**
 * La condición "esta fila cae en el rango". Un helper y no tres copias: el
 * error de poner `<=` en una de las tres consultas y `<` en las otras dos es
 * invisible en la pantalla y desalinea el embudo por un día entero.
 */
function enRango(rango: RangoAnalytics) {
  return and(gte(analyticsEvents.createdAt, rango.desde), lt(analyticsEvents.createdAt, rango.hasta));
}

// ---------------------------------------------------------------------------
// El embudo
// ---------------------------------------------------------------------------

export type Embudo = {
  /** Navegadores distintos que dejaron al menos una `visita`. */
  visitantes: number;
  /** Pageviews. Uno por navegación, así que es mayor que `visitantes`. */
  visitas: number;
  /** Navegadores distintos que agregaron algo al carrito. */
  conCarrito: number;
  /** Navegadores distintos que confirmaron el checkout. */
  conCheckout: number;
  /** Navegadores distintos con un pedido en `REVENUE_STATUSES`. */
  compradores: number;
  /**
   * Pedidos cobrados en el rango, contados desde `orders` y **sin pasar por
   * `analytics_events`**. Es el número de control de la pantalla: si esto es
   * mucho mayor que `compradores`, lo que falta no son ventas sino cookies
   * (ver `LIMITES_CONOCIDOS`).
   */
  pedidosCobrados: number;
};

/**
 * Los cinco escalones del embudo, más el número de control.
 *
 * Cada escalón cuenta **navegadores distintos** (`COUNT(DISTINCT visit_id)`) y
 * no eventos, salvo `visitas`. Contar eventos daría un "embudo" donde el paso
 * 2 puede ser mayor que el paso 1 —alguien agrega cinco cosas al carrito— y
 * eso no es un embudo, es una lista de números sueltos.
 *
 * Los escalones **no están anidados** a propósito: `conCheckout` no exige
 * haber dejado una `visita` antes. Anidarlos parece más prolijo y sería
 * mentira, porque la `visita` es el único escalón que un bloqueador se puede
 * comer: exigirla haría desaparecer del embudo a compradores reales cuya
 * compra el servidor verificó. Es mejor un escalón que a veces sube que un
 * embudo que descarta ventas para verse ordenado.
 */
export async function embudo(rango: RangoAnalytics, executor?: Executor): Promise<Embudo> {
  const tx = executor ?? getDb();

  const distintos = async (type: 'visita' | 'carrito_agregado' | 'checkout_iniciado') => {
    const [row] = await tx
      .select({ n: countDistinct(analyticsEvents.visitId) })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.type, type), enRango(rango)));
    return Number(row?.n ?? 0);
  };

  const [visitas, visitantes, conCarrito, conCheckout, compradores, pedidosCobrados] =
    await Promise.all([
      tx
        .select({ n: count() })
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.type, 'visita'), enRango(rango)))
        .then((rows) => Number(rows[0]?.n ?? 0)),
      distintos('visita'),
      distintos('carrito_agregado'),
      distintos('checkout_iniciado'),
      // El join con `orders` es lo que hace que un pedido vencido deje de
      // contar: sin él esto contaría intentos de compra, no compras.
      tx
        .select({ n: countDistinct(analyticsEvents.visitId) })
        .from(analyticsEvents)
        .innerJoin(orders, eq(analyticsEvents.orderId, orders.id))
        .where(
          and(
            eq(analyticsEvents.type, 'compra'),
            inArray(orders.status, [...REVENUE_STATUSES]),
            enRango(rango),
          ),
        )
        .then((rows) => Number(rows[0]?.n ?? 0)),
      // Desde `orders` y nada más: el control contra el que se mide cuánto se
      // está perdiendo por cookies.
      tx
        .select({ n: count() })
        .from(orders)
        .where(
          and(
            inArray(orders.status, [...REVENUE_STATUSES]),
            gte(orders.createdAt, rango.desde),
            lt(orders.createdAt, rango.hasta),
          ),
        )
        .then((rows) => Number(rows[0]?.n ?? 0)),
    ]);

  return { visitantes, visitas, conCarrito, conCheckout, compradores, pedidosCobrados };
}

/**
 * `tasa(12, 100)` → `12`. Porcentaje entero, redondeado.
 *
 * Denominador cero devuelve `null` y **no** cero: una tienda sin visitas en el
 * rango no convirtió el 0 %, no se sabe. La pantalla dibuja un guion, que es
 * lo honesto; un "0 %" al lado de una página nueva es un número que hace tomar
 * decisiones al revés.
 *
 * Entero y no decimal porque el denominador es una magnitud aproximada (ver
 * `LIMITES_CONOCIDOS`): un "3,47 %" calculado sobre visitas que un bloqueador
 * puede haberse comido es precisión inventada.
 */
export function tasa(parte: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

// ---------------------------------------------------------------------------
// Páginas más vistas
// ---------------------------------------------------------------------------

export type PaginaVista = { path: string; visitas: number; visitantes: number };

export async function paginasMasVistas(
  rango: RangoAnalytics,
  limit = 10,
  executor?: Executor,
): Promise<PaginaVista[]> {
  const tx = executor ?? getDb();

  const rows = await tx
    .select({
      path: analyticsEvents.path,
      visitas: count(),
      visitantes: countDistinct(analyticsEvents.visitId),
    })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.type, 'visita'), enRango(rango)))
    .groupBy(analyticsEvents.path)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows
    .filter((row): row is typeof row & { path: string } => row.path !== null)
    .map((row) => ({
      path: row.path,
      visitas: Number(row.visitas),
      visitantes: Number(row.visitantes),
    }));
}

// ---------------------------------------------------------------------------
// Qué se agrega al carrito
// ---------------------------------------------------------------------------

export type ProductoAgregado = {
  productId: number;
  name: string;
  /** Veces que alguna variante de este producto entró a un carrito. */
  agregados: number;
};

/**
 * Lo que más entra al carrito, por producto.
 *
 * Se agrupa por producto y no por variante, igual que `topProducts()`: al
 * dueño le sirve saber que el corpiño se agrega, no que se agrega en 90B.
 *
 * Puesto al lado de `topProducts()` en la pantalla contesta la pregunta que
 * ninguna de las dos contesta sola: **qué se agrega mucho y se vende poco.**
 * Eso es un precio alto, un flete que asusta o una foto que promete otra cosa,
 * y es accionable — que es más de lo que se puede decir de la mayoría de los
 * números de una pantalla de analítica.
 *
 * Las filas con `variant_id` en NULL (variantes borradas del catálogo) quedan
 * afuera por el `innerJoin`, y está bien: un producto que ya no existe no es
 * accionable.
 */
export async function productosMasAgregados(
  rango: RangoAnalytics,
  limit = 10,
  executor?: Executor,
): Promise<ProductoAgregado[]> {
  const tx = executor ?? getDb();

  const rows = await tx
    .select({
      productId: products.id,
      name: products.name,
      agregados: count(),
    })
    .from(analyticsEvents)
    .innerJoin(variants, eq(analyticsEvents.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(and(eq(analyticsEvents.type, 'carrito_agregado'), enRango(rango)))
    .groupBy(products.id, products.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    agregados: Number(row.agregados),
  }));
}

// ---------------------------------------------------------------------------
// Conversión por página de entrada — la difícil
// ---------------------------------------------------------------------------

export type ConversionEntrada = {
  /**
   * La ruta por la que entró, o `null` para las compras cuya visita nunca
   * dejó un pageview (ver abajo por qué esa fila existe y no se esconde).
   */
  path: string | null;
  /** Navegadores que entraron por acá dentro del rango. */
  visitantes: number;
  /** De ésos, cuántos terminaron con un pedido cobrado. */
  compradores: number;
  /** Porcentaje entero, o `null` si no hay denominador. */
  tasaPct: number | null;
};

/**
 * Cuánto convierte cada página de entrada.
 *
 * ### Qué se está calculando, exactamente
 *
 * Para cada navegador con actividad en el rango se busca **su primer pageview
 * del rango**; esa ruta es su "página de entrada". Después se pregunta si ese
 * mismo navegador dejó una `compra` con un pedido hoy cobrado. La tasa es
 * compradores sobre visitantes, agrupado por página de entrada.
 *
 * ### Cómo, y por qué así
 *
 * Tres pasos, no uno:
 *
 * 1. `primeras` — `MIN(id)` por `visit_id` entre las `visita` del rango. Se
 *    usa `MIN(id)` y no `MIN(created_at)`: el `id` es autoincremental y único,
 *    así que dos pageviews en el mismo segundo —lo normal cuando alguien abre
 *    dos pestañas— tienen un ganador definido. Con `MIN(created_at)` habría
 *    empate y la fila se contaría dos veces, inflando el denominador.
 * 2. `compradoras` — los `visit_id` con una `compra` en el rango cuyo pedido
 *    está en `REVENUE_STATUSES`. Ya deduplicado por `visit_id`, así que dos
 *    compras de la misma persona no pueden dar más del 100 %.
 * 3. El `LEFT JOIN` de (1) con (2), agrupado por la ruta del paso 1.
 *
 * Se arma con `sql` crudo y no con el query builder porque el paso 1 es una
 * subconsulta agregada que se vuelve a unir contra su propia tabla, y
 * expresarlo con el builder sale más largo y menos legible que el SQL. La
 * consulta no tiene ni un valor interpolado del usuario: sólo las dos fechas,
 * que van parametrizadas.
 *
 * ### La fila `null` — y por qué no se esconde
 *
 * Hay compras cuyo `visit_id` no dejó ni un pageview en el rango: se le
 * bloqueó el beacon, entró antes del rango que se está mirando, o compró desde
 * un navegador donde el JavaScript no corrió. Esas conversiones se agrupan en
 * una fila con `path: null` en vez de descartarse.
 *
 * Esconderlas dejaría una pantalla más prolija donde la suma de las
 * conversiones no da los pedidos que el dueño ve en `/admin/pedidos`, y esa
 * diferencia sin explicación es exactamente lo que hace que alguien deje de
 * creerle a una pantalla entera. Mostrada, esa fila **es** la medida de cuánto
 * se está perdiendo por cookies: chica, los números de arriba son buenos;
 * grande, hay que leerlos con pinzas.
 */
export async function conversionPorPaginaDeEntrada(
  rango: RangoAnalytics,
  limit = 15,
  executor?: Executor,
): Promise<ConversionEntrada[]> {
  const tx = executor ?? getDb();
  const estados = listaDeEstadosCobrados();
  // `LIMIT ?` no se puede parametrizar en un prepared statement de MySQL, así
  // que va interpolado — y por eso pasa antes por `Math.trunc`: es la única
  // forma en que un número podría llegar crudo al SQL.
  const tope = sql.raw(String(Math.max(1, Math.trunc(limit))));

  const rows = await tx.execute(sql`
    SELECT
      entrada.path                      AS path,
      COUNT(*)                          AS visitantes,
      SUM(compradoras.visit_id IS NOT NULL) AS compradores
    FROM (
      SELECT e.visit_id, MIN(e.id) AS primer_id
      FROM analytics_events e
      WHERE e.type = 'visita'
        AND e.created_at >= ${rango.desde}
        AND e.created_at <  ${rango.hasta}
      GROUP BY e.visit_id
    ) AS primeras
    JOIN analytics_events AS entrada
      ON entrada.id = primeras.primer_id
    LEFT JOIN (
      SELECT DISTINCT c.visit_id
      FROM analytics_events c
      JOIN orders o ON o.id = c.order_id
      WHERE c.type = 'compra'
        AND c.created_at >= ${rango.desde}
        AND c.created_at <  ${rango.hasta}
        AND o.status IN (${estados})
    ) AS compradoras
      ON compradoras.visit_id = primeras.visit_id
    GROUP BY entrada.path
    ORDER BY visitantes DESC
    LIMIT ${tope}
  `);

  const filas = filasDe(rows).map((row) => {
    const visitantes = Number(row.visitantes ?? 0);
    const compradores = Number(row.compradores ?? 0);
    return {
      path: typeof row.path === 'string' ? row.path : null,
      visitantes,
      compradores,
      tasaPct: tasa(compradores, visitantes),
    };
  });

  const huerfanas = await comprasSinPaginaDeEntrada(rango, tx);
  if (huerfanas > 0) {
    filas.push({ path: null, visitantes: 0, compradores: huerfanas, tasaPct: null });
  }

  return filas;
}

/**
 * Compras del rango cuyo navegador no dejó ningún pageview en el rango.
 *
 * Es la fila `null` de arriba. Va en su propia consulta y no como un `RIGHT
 * JOIN` de la anterior porque son dos preguntas distintas —"de los que
 * entraron, cuántos compraron" y "cuántos compraron sin que sepamos por dónde
 * entraron"— y un solo SQL que conteste las dos es más difícil de leer que
 * dos que contesten una cada uno.
 */
async function comprasSinPaginaDeEntrada(
  rango: RangoAnalytics,
  tx: Executor,
): Promise<number> {
  const estados = listaDeEstadosCobrados();

  const rows = await tx.execute(sql`
    SELECT COUNT(DISTINCT c.visit_id) AS n
    FROM analytics_events c
    JOIN orders o ON o.id = c.order_id
    WHERE c.type = 'compra'
      AND c.created_at >= ${rango.desde}
      AND c.created_at <  ${rango.hasta}
      AND o.status IN (${estados})
      AND NOT EXISTS (
        SELECT 1 FROM analytics_events v
        WHERE v.visit_id = c.visit_id
          AND v.type = 'visita'
          AND v.created_at >= ${rango.desde}
          AND v.created_at <  ${rango.hasta}
      )
  `);

  return Number(filasDe(rows)[0]?.n ?? 0);
}

/**
 * `REVENUE_STATUSES` como lista parametrizada para un `IN (...)` de SQL crudo.
 *
 * `sql` no expande un array solo: interpolarlo daría un único parámetro con
 * los cuatro estados pegados y la consulta no devolvería nada, en silencio.
 * Cada estado va como su propio placeholder, así que la lista sigue saliendo
 * de `admin-dashboard.ts` y no hay ni un string armado a mano.
 */
function listaDeEstadosCobrados() {
  return sql.join(
    REVENUE_STATUSES.map((estado) => sql`${estado}`),
    sql`, `,
  );
}

/**
 * Las filas de un `tx.execute()`.
 *
 * mysql2 devuelve `[filas, campos]` y drizzle deja pasar esa forma tal cual en
 * `execute`, así que hay que desenvolverla una vez. Está acá, en un solo
 * lugar, para que las dos consultas crudas de arriba no lo repitan.
 */
function filasDe(result: unknown): Array<Record<string, unknown>> {
  const primero = Array.isArray(result) ? result[0] : result;
  return Array.isArray(primero) ? (primero as Array<Record<string, unknown>>) : [];
}

// ---------------------------------------------------------------------------
// Los límites, escritos
// ---------------------------------------------------------------------------

/**
 * Lo que estos números **no** pueden ver.
 *
 * Vive acá, en el dominio, y no sólo en el JSX: la pantalla los muestra, pero
 * la lista es parte de la definición de la métrica y tiene que estar donde se
 * calcula. Un número de conversión sin esta lista al lado no es un número, es
 * una impresión.
 *
 * Las claves las traduce `src/i18n/es-PY.ts`.
 */
export const LIMITES_CONOCIDOS = [
  /**
   * Un navegador es un visitante. La compradora que mira en el celular en el
   * colectivo y compra a la noche en la notebook son dos: una visita que "no
   * convirtió" y una compra sin página de entrada. Esto no se puede arreglar
   * sin identificar a la persona antes de que compre, que es exactamente lo
   * que este diseño no hace.
   */
  'panel.analitica.limite.dispositivos',
  /**
   * Borrar cookies, la ventana privada o un navegador distinto arrancan de
   * cero. Cada uno de esos casos infla los visitantes y baja la tasa.
   */
  'panel.analitica.limite.cookies',
  /**
   * Los navegadores dentro de WhatsApp e Instagram —por donde llega media
   * Paraguay— muchas veces aíslan el almacenamiento por cada apertura. Un
   * mismo link abierto dos veces puede contar como dos visitantes. Es el
   * límite que más pega en este mercado en particular.
   */
  'panel.analitica.limite.appsMensajeria',
  /**
   * Bloqueadores y JavaScript apagado se comen pageviews. Las compras no,
   * porque las escribe el servidor. Consecuencia práctica: **las tasas de
   * conversión son un piso**, no un promedio — el numerador es más confiable
   * que el denominador.
   */
  'panel.analitica.limite.bloqueadores',
  /**
   * Los bots y crawlers cuentan como visitas. No se los filtra porque
   * filtrarlos bien requiere mirar el user-agent, que es justamente lo que
   * esta analítica decidió no guardar.
   */
  'panel.analitica.limite.bots',
  /**
   * "Página de entrada" es la primera **del rango elegido**, no la primera de
   * la vida. Cambiar el rango cambia la página de entrada de alguien que
   * venía navegando de antes, y eso es a propósito: así el número es una
   * propiedad del período que se está mirando y no del historial completo.
   */
  'panel.analitica.limite.rango',
] as const;

// ---------------------------------------------------------------------------
// Retención
// ---------------------------------------------------------------------------

/** Default de `ANALYTICS_RETENTION_DAYS`. Un año: cubre comparar temporadas. */
export const RETENCION_DIAS_DEFAULT = 365;

/**
 * Cuántos días guardar, leído del entorno. Pura: recibe el string, no lo busca.
 *
 * Un valor inválido cae en el default en vez de tirar. El criterio es el mismo
 * que el de `TIENDA.lang` con un idioma que no existe: una variable mal
 * tipeada no puede romper una tienda que está vendiendo, y menos por una
 * tarea de limpieza.
 */
export function retencionDias(valor: string | undefined): number {
  const n = Number(valor?.trim());
  if (!Number.isInteger(n) || n < 1) return RETENCION_DIAS_DEFAULT;
  return n;
}

/** El corte: todo lo anterior a esto se borra. Pura, para poder testearla. */
export function corteDeRetencion(dias: number, ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - dias * 24 * 3600_000);
}

/**
 * Cuántos eventos borraría la purga. Es el `--dry-run` de `analytics:purge`.
 *
 * Existe por lo mismo que el `--dry-run` de `import-csv`: la primera vez que
 * alguien corre un comando que borra, quiere ver el número antes.
 */
export async function contarEventosAnterioresA(
  dias: number,
  ahora: Date = new Date(),
  executor?: Executor,
): Promise<{ total: number; corte: Date }> {
  const tx = executor ?? getDb();
  const corte = corteDeRetencion(dias, ahora);

  const [row] = await tx
    .select({ n: count() })
    .from(analyticsEvents)
    .where(lt(analyticsEvents.createdAt, corte));

  return { total: Number(row?.n ?? 0), corte };
}

/**
 * Borra los eventos más viejos que el corte. La corre `pnpm analytics:purge`.
 *
 * **No** está enganchada al cron de `/api/cron/vencer-pedidos` a propósito:
 * ese cron vence pedidos y suelta stock reservado, y una limpieza de
 * estadísticas no tiene por qué compartir una corrida —ni un timeout de
 * Hostinger— con el camino de la plata. Quien quiera automatizarla le agrega
 * una línea al cron del hPanel; es un comando, no una feature.
 */
export async function purgarEventos(
  dias: number = retencionDias(process.env.ANALYTICS_RETENTION_DAYS),
  ahora: Date = new Date(),
  executor?: Executor,
): Promise<{ borrados: number; corte: Date }> {
  const tx = executor ?? getDb();
  const corte = corteDeRetencion(dias, ahora);

  const result = await tx.delete(analyticsEvents).where(lt(analyticsEvents.createdAt, corte));

  // mysql2 devuelve `affectedRows`; drizzle lo pasa en el primer elemento.
  const header = Array.isArray(result) ? result[0] : result;
  return { borrados: Number((header as { affectedRows?: number })?.affectedRows ?? 0), corte };
}
