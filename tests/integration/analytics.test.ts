import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { analyticsEvents, orders } from '../../src/db/schema';
import { transitionOrder } from '../../src/domain/orders';
import {
  contarEventosAnterioresA,
  conversionPorPaginaDeEntrada,
  embudo,
  paginasMasVistas,
  productosMasAgregados,
  purgarEventos,
  type RangoAnalytics,
} from '../../src/domain/admin-analytics';
import { closeTestDb, getTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createOrder, createVariant } from '../helpers/factories';

/**
 * Analítica propia — los números, contra una base de verdad.
 *
 * Las funciones puras y los guardarraíles de diseño están en
 * `tests/unit/analytics.test.ts`; acá está lo único que no se puede verificar
 * sin MySQL, que es justamente lo que más importa: que la correlación
 * "esta visita entró por acá y después compró" dé lo que tiene que dar, y que
 * un pedido que se cae deje de contar como conversión.
 */
describe.skipIf(!hasTestDb)('analítica', () => {
  beforeEach(async () => {
    await resetTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // Mediodía de Asunción del 10/8/2026, y un rango que lo contiene.
  const AHORA = new Date('2026-08-10T15:00:00Z');
  const RANGO: RangoAnalytics = {
    desde: new Date('2026-08-01T03:00:00Z'),
    hasta: new Date('2026-08-11T03:00:00Z'),
  };

  /** Un evento con fecha puesta a mano: `created_at` tiene default de MySQL. */
  async function evento(fila: {
    visitId: string;
    type: 'visita' | 'carrito_agregado' | 'checkout_iniciado' | 'compra';
    path?: string;
    variantId?: number;
    orderId?: number;
    createdAt?: Date;
  }): Promise<void> {
    await getTestDb()
      .insert(analyticsEvents)
      .values({
        visitId: fila.visitId,
        type: fila.type,
        path: fila.path ?? null,
        variantId: fila.variantId ?? null,
        orderId: fila.orderId ?? null,
        createdAt: fila.createdAt ?? AHORA,
      });
  }

  /** Un pedido cobrado, con su fecha adentro del rango. */
  async function pedidoCobrado(totalPyg = 100_000): Promise<number> {
    const id = await createOrder({ status: 'pagado', totalPyg });
    await getTestDb().update(orders).set({ createdAt: AHORA }).where(eq(orders.id, id));
    return id;
  }

  // -------------------------------------------------------------------------

  describe('embudo', () => {
    it('cuenta navegadores distintos, no eventos', async () => {
      // Una misma visita con tres pageviews es **un** visitante.
      await evento({ visitId: 'a'.repeat(32), type: 'visita', path: '/' });
      await evento({ visitId: 'a'.repeat(32), type: 'visita', path: '/producto/x' });
      await evento({ visitId: 'a'.repeat(32), type: 'visita', path: '/carrito' });
      await evento({ visitId: 'b'.repeat(32), type: 'visita', path: '/' });

      const resultado = await embudo(RANGO);

      expect(resultado.visitas).toBe(4);
      expect(resultado.visitantes).toBe(2);
    });

    it('un pedido que no está cobrado no cuenta como conversión', async () => {
      const visitId = 'c'.repeat(32);
      await evento({ visitId, type: 'visita', path: '/' });

      const pendiente = await createOrder({ status: 'pendiente_pago', totalPyg: 50_000 });
      await getTestDb().update(orders).set({ createdAt: AHORA }).where(eq(orders.id, pendiente));
      await evento({ visitId, type: 'compra', orderId: pendiente });

      expect((await embudo(RANGO)).compradores).toBe(0);

      // Y en cuanto se cobra, cuenta — sin tocar la tabla de eventos. Ésta es
      // la razón entera de que la fila guarde el `order_id` y no el monto.
      //
      // Se mueve con `transitionOrder` y no con un UPDATE: el estado del
      // pedido sólo se escribe por ahí, también en los tests (hay un
      // guardarraíl de CI que lo verifica sobre el código).
      await transitionOrder(pendiente, 'pagado', 'test', 'cobrado en el test');
      expect((await embudo(RANGO)).compradores).toBe(1);
    });

    it('el control sale de orders y ve las compras que la analítica no vio', async () => {
      // Un pedido cobrado sin ninguna fila de analítica: la compradora tenía
      // el beacon bloqueado. El control lo ve igual.
      await pedidoCobrado();

      const resultado = await embudo(RANGO);
      expect(resultado.pedidosCobrados).toBe(1);
      expect(resultado.compradores).toBe(0);
    });

    it('deja afuera lo que cae fuera del rango', async () => {
      await evento({
        visitId: 'd'.repeat(32),
        type: 'visita',
        path: '/',
        createdAt: new Date('2026-07-01T15:00:00Z'),
      });

      expect((await embudo(RANGO)).visitas).toBe(0);
    });
  });

  // -------------------------------------------------------------------------

  describe('conversión por página de entrada', () => {
    it('atribuye la compra a la primera página de la visita', async () => {
      const visitId = 'e'.repeat(32);
      const orderId = await pedidoCobrado();

      // Entró por la campaña y después navegó. La entrada es la primera.
      await evento({ visitId, type: 'visita', path: '/categoria/promos' });
      await evento({ visitId, type: 'visita', path: '/producto/x' });
      await evento({ visitId, type: 'visita', path: '/checkout' });
      await evento({ visitId, type: 'compra', orderId });

      const filas = await conversionPorPaginaDeEntrada(RANGO);
      const promos = filas.find((fila) => fila.path === '/categoria/promos');

      expect(promos).toBeDefined();
      expect(promos?.visitantes).toBe(1);
      expect(promos?.compradores).toBe(1);
      expect(promos?.tasaPct).toBe(100);

      // Las páginas por las que pasó después no son páginas de entrada.
      expect(filas.some((fila) => fila.path === '/producto/x')).toBe(false);
    });

    it('calcula la tasa sobre los que entraron por esa página', async () => {
      const compradora = 'f'.repeat(32);
      const orderId = await pedidoCobrado();

      await evento({ visitId: compradora, type: 'visita', path: '/categoria/promos' });
      await evento({ visitId: compradora, type: 'compra', orderId });

      // Tres más entraron por la misma página y no compraron.
      for (const sufijo of ['1', '2', '3']) {
        await evento({ visitId: `${'0'.repeat(31)}${sufijo}`, type: 'visita', path: '/categoria/promos' });
      }

      const promos = (await conversionPorPaginaDeEntrada(RANGO)).find(
        (fila) => fila.path === '/categoria/promos',
      );

      expect(promos?.visitantes).toBe(4);
      expect(promos?.compradores).toBe(1);
      expect(promos?.tasaPct).toBe(25);
    });

    it('dos compras de la misma visita no pasan del 100 %', async () => {
      const visitId = 'a'.repeat(31) + '9';
      await evento({ visitId, type: 'visita', path: '/' });
      await evento({ visitId, type: 'compra', orderId: await pedidoCobrado() });
      await evento({ visitId, type: 'compra', orderId: await pedidoCobrado(200_000) });

      const raiz = (await conversionPorPaginaDeEntrada(RANGO)).find((fila) => fila.path === '/');
      expect(raiz?.compradores).toBe(1);
      expect(raiz?.tasaPct).toBe(100);
    });

    it('las compras sin página de entrada salen en su propia fila y no se esconden', async () => {
      // Sin ningún pageview: el beacon no llegó, o entró antes del rango.
      const visitId = 'b'.repeat(31) + '9';
      await evento({ visitId, type: 'compra', orderId: await pedidoCobrado() });

      const sinPagina = (await conversionPorPaginaDeEntrada(RANGO)).find(
        (fila) => fila.path === null,
      );

      expect(sinPagina).toBeDefined();
      expect(sinPagina?.compradores).toBe(1);
    });
  });

  // -------------------------------------------------------------------------

  describe('rankings', () => {
    it('las páginas más vistas salen ordenadas', async () => {
      for (let i = 0; i < 3; i += 1) {
        await evento({ visitId: `${'1'.repeat(31)}${i}`, type: 'visita', path: '/popular' });
      }
      await evento({ visitId: '2'.repeat(32), type: 'visita', path: '/rara' });

      const paginas = await paginasMasVistas(RANGO);
      expect(paginas[0]?.path).toBe('/popular');
      expect(paginas[0]?.visitas).toBe(3);
      expect(paginas[0]?.visitantes).toBe(3);
    });

    it('lo más agregado al carrito se agrupa por producto', async () => {
      const variantId = await createVariant({ onHand: 10 });

      await evento({ visitId: '3'.repeat(32), type: 'carrito_agregado', variantId });
      await evento({ visitId: '4'.repeat(32), type: 'carrito_agregado', variantId });

      const agregados = await productosMasAgregados(RANGO);
      expect(agregados).toHaveLength(1);
      expect(agregados[0]?.agregados).toBe(2);
    });
  });

  // -------------------------------------------------------------------------

  describe('retención', () => {
    it('la purga borra lo viejo y deja lo nuevo', async () => {
      await evento({
        visitId: '5'.repeat(32),
        type: 'visita',
        path: '/viejo',
        createdAt: new Date('2024-01-01T12:00:00Z'),
      });
      await evento({ visitId: '6'.repeat(32), type: 'visita', path: '/nuevo' });

      const { total } = await contarEventosAnterioresA(365, AHORA);
      expect(total).toBe(1);

      const { borrados } = await purgarEventos(365, AHORA);
      expect(borrados).toBe(1);

      const quedan = await getTestDb().select().from(analyticsEvents);
      expect(quedan).toHaveLength(1);
      expect(quedan[0]?.path).toBe('/nuevo');
    });
  });
});
