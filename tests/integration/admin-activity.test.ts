import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { orderEvents, stockAdjustments, users } from '@/db/schema';
import { actividadActores, listActivity } from '@/domain/admin-activity';
import { createUser } from '@/lib/auth';

import { closeTestDb, getTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createOrder, createVariant } from '../helpers/factories';

/**
 * El feed de actividad (PLAN.md FASE 2, PR L).
 *
 * Lo que de verdad hay que probar acá es **la paginación de un feed que sale
 * de dos tablas**. La forma fácil —traer N de cada una y ordenarlas en
 * memoria— funciona en la página 1 y miente en la 2: si en el rango entraron
 * 300 eventos de pedido y 3 ajustes de stock, los eventos tapan a los ajustes
 * y la segunda página muestra filas que en un feed real irían antes. Por eso
 * los tests de abajo intercalan a propósito los dos tipos y después piden las
 * páginas de a una.
 *
 * Las fechas se escriben a mano en vez de dejar el `defaultNow()`: sin control
 * del `created_at` no se puede afirmar nada sobre el orden, y un test de orden
 * que depende de cuán rápido corrió el insert es un test que va a titilar.
 */

const BASE = new Date('2026-08-01T12:00:00Z');

/** `BASE` + n minutos. Más grande = más nuevo. */
function minuto(n: number): Date {
  return new Date(BASE.getTime() + n * 60_000);
}

async function unUsuario(email: string, name: string | null = null) {
  const created = await createUser({
    email,
    password: 'tienda2026segura',
    name,
    role: 'owner',
  });
  return created.id;
}

describe.skipIf(!hasTestDb)('feed unificado y su paginación', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  /**
   * Seis movimientos alternados: stock en los minutos pares, pedido en los
   * impares. Devuelve el orden esperado, del más nuevo al más viejo.
   */
  async function seisMovimientos(actorUserId: number | null = null) {
    const db = getTestDb();
    const orderId = await createOrder({ status: 'pagado' });
    const variantId = await createVariant({ onHand: 10 });

    for (const n of [1, 3, 5]) {
      await db.insert(orderEvents).values({
        orderId,
        fromStatus: 'pagado',
        toStatus: 'preparando',
        actor: 'admin:due@tienda.py',
        actorUserId,
        reason: `evento ${n}`,
        createdAt: minuto(n),
      });
    }

    for (const n of [2, 4, 6]) {
      await db.insert(stockAdjustments).values({
        variantId,
        delta: n,
        previousOnHand: 10,
        newOnHand: 10 + n,
        reason: `ajuste ${n}`,
        actor: 'admin:due@tienda.py',
        actorUserId,
        createdAt: minuto(n),
      });
    }

    return { orderId, variantId };
  }

  const motivos = (page: Awaited<ReturnType<typeof listActivity>>) =>
    page.rows.map((row) => row.reason);

  it('mezcla las dos tablas en un solo orden cronológico', async () => {
    await seisMovimientos();

    const page = await listActivity({ perPage: 10 });
    expect(page.total).toBe(6);
    // Minuto 6 → 1, alternando tabla en cada paso. Que se alternen es el
    // punto: son dos tablas y un solo orden.
    expect(motivos(page)).toEqual([
      'ajuste 6',
      'evento 5',
      'ajuste 4',
      'evento 3',
      'ajuste 2',
      'evento 1',
    ]);
  });

  it('la página 2 continúa donde terminó la 1, sin repetir ni saltear', async () => {
    await seisMovimientos();

    const primera = await listActivity({ perPage: 2, page: 1 });
    const segunda = await listActivity({ perPage: 2, page: 2 });
    const tercera = await listActivity({ perPage: 2, page: 3 });

    expect(motivos(primera)).toEqual(['ajuste 6', 'evento 5']);
    expect(motivos(segunda)).toEqual(['ajuste 4', 'evento 3']);
    expect(motivos(tercera)).toEqual(['ajuste 2', 'evento 1']);
    expect(primera.totalPages).toBe(3);
  });

  it('con muchos de un tipo y pocos del otro, los pocos no se pierden', async () => {
    // El caso que rompe el "traer N de cada una y ordenar en memoria": 25
    // eventos nuevos y un ajuste viejo, con páginas de 10. El ajuste tiene que
    // aparecer último, no desaparecer.
    const db = getTestDb();
    const orderId = await createOrder({ status: 'pagado' });
    const variantId = await createVariant({ onHand: 10 });

    await db.insert(stockAdjustments).values({
      variantId,
      delta: -1,
      previousOnHand: 10,
      newOnHand: 9,
      reason: 'el ajuste viejo',
      actor: 'admin:due@tienda.py',
      createdAt: minuto(0),
    });

    for (let n = 1; n <= 25; n += 1) {
      await db.insert(orderEvents).values({
        orderId,
        fromStatus: 'pagado',
        toStatus: 'preparando',
        actor: 'admin:due@tienda.py',
        reason: `evento ${n}`,
        createdAt: minuto(n),
      });
    }

    const ultima = await listActivity({ perPage: 10, page: 3 });
    expect(ultima.total).toBe(26);
    expect(ultima.totalPages).toBe(3);
    expect(motivos(ultima)).toEqual([
      'evento 5',
      'evento 4',
      'evento 3',
      'evento 2',
      'evento 1',
      'el ajuste viejo',
    ]);
  });

  it('dos filas con el mismo instante no se pisan entre páginas', async () => {
    // Un evento y un ajuste escritos en el mismo segundo. Sin desempate, MySQL
    // puede devolverlos en cualquier orden en cada consulta, y entonces uno
    // sale dos veces y el otro nunca.
    const db = getTestDb();
    const orderId = await createOrder({ status: 'pagado' });
    const variantId = await createVariant({ onHand: 10 });

    await db.insert(orderEvents).values({
      orderId,
      fromStatus: 'pagado',
      toStatus: 'preparando',
      actor: 'admin:due@tienda.py',
      reason: 'mismo instante — pedido',
      createdAt: minuto(1),
    });
    await db.insert(stockAdjustments).values({
      variantId,
      delta: 1,
      previousOnHand: 10,
      newOnHand: 11,
      reason: 'mismo instante — stock',
      actor: 'admin:due@tienda.py',
      createdAt: minuto(1),
    });

    const primera = await listActivity({ perPage: 1, page: 1 });
    const segunda = await listActivity({ perPage: 1, page: 2 });

    const vistos = [...motivos(primera), ...motivos(segunda)];
    expect(new Set(vistos).size).toBe(2);
  });

  it('sin movimientos devuelve una página vacía y no explota', async () => {
    const page = await listActivity();
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(1);
  });

  it('una página más allá del final se corrige a la última', async () => {
    await seisMovimientos();
    const page = await listActivity({ perPage: 2, page: 99 });
    expect(page.page).toBe(3);
    expect(page.rows).toHaveLength(2);
  });
});

describe.skipIf(!hasTestDb)('filtros', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  async function tiendaConDosPersonas() {
    const db = getTestDb();
    const ana = await unUsuario('ana@tienda.py', 'Ana');
    const beto = await unUsuario('beto@tienda.py');
    const orderId = await createOrder({ status: 'pagado' });
    const variantId = await createVariant({ onHand: 10 });

    await db.insert(orderEvents).values({
      orderId,
      fromStatus: 'pagado',
      toStatus: 'preparando',
      actor: 'admin:ana@tienda.py',
      actorUserId: ana,
      reason: 'lo de Ana',
      createdAt: minuto(3),
    });
    await db.insert(stockAdjustments).values({
      variantId,
      delta: 2,
      previousOnHand: 10,
      newOnHand: 12,
      reason: 'lo de Beto',
      actor: 'admin:beto@tienda.py',
      actorUserId: beto,
      createdAt: minuto(2),
    });
    await db.insert(orderEvents).values({
      orderId,
      fromStatus: 'pendiente_pago',
      toStatus: 'vencido',
      actor: 'cron:vencer-pedidos',
      actorUserId: null,
      reason: 'lo del cron',
      createdAt: minuto(1),
    });

    return { ana, beto };
  }

  it('por persona', async () => {
    const { ana } = await tiendaConDosPersonas();
    const page = await listActivity({ actorUserId: ana });

    expect(page.total).toBe(1);
    expect(page.rows[0]?.reason).toBe('lo de Ana');
    // El nombre de hoy, no el string histórico: el dueño busca a Ana.
    expect(page.rows[0]?.actorName).toBe('Ana');
    expect(page.rows[0]?.actor).toBe('admin:ana@tienda.py');
  });

  it('sin nombre cargado, se muestra el email', async () => {
    const { beto } = await tiendaConDosPersonas();
    const page = await listActivity({ actorUserId: beto });
    expect(page.rows[0]?.actorName).toBe('beto@tienda.py');
  });

  it('"el sistema" es lo que no movió ninguna persona', async () => {
    await tiendaConDosPersonas();
    const page = await listActivity({ actorUserId: 'sistema' });

    expect(page.total).toBe(1);
    expect(page.rows[0]?.reason).toBe('lo del cron');
    expect(page.rows[0]?.actorName).toBeNull();
  });

  it('por tipo', async () => {
    await tiendaConDosPersonas();

    const pedidos = await listActivity({ kind: 'pedido' });
    expect(pedidos.total).toBe(2);
    expect(pedidos.rows.every((row) => row.kind === 'pedido')).toBe(true);

    const stock = await listActivity({ kind: 'stock' });
    expect(stock.total).toBe(1);
    expect(stock.rows[0]?.kind).toBe('stock');
  });

  it('por fecha, con el "hasta" incluyendo el día entero', async () => {
    await tiendaConDosPersonas();

    const page = await listActivity({ createdFrom: minuto(2), createdTo: minuto(4) });
    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.reason)).toEqual(['lo de Ana', 'lo de Beto']);
  });

  it('los filtros se combinan', async () => {
    const { ana } = await tiendaConDosPersonas();
    const page = await listActivity({ actorUserId: ana, kind: 'stock' });
    expect(page.total).toBe(0);
    expect(page.rows).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)('detalle de cada fila', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('un evento trae el número de pedido y los dos estados', async () => {
    const db = getTestDb();
    const orderId = await createOrder({ status: 'pagado' });
    await db.insert(orderEvents).values({
      orderId,
      fromStatus: 'pagado',
      toStatus: 'enviado',
      actor: 'admin:due@tienda.py',
      createdAt: minuto(1),
    });

    const [row] = (await listActivity()).rows;
    if (row?.kind !== 'pedido') throw new Error('esperaba una fila de pedido');
    expect(row.orderId).toBe(orderId);
    expect(row.orderNumber).toMatch(/^PY-T/);
    expect(row.fromStatus).toBe('pagado');
    expect(row.toStatus).toBe('enviado');
  });

  it('un ajuste trae SKU, producto y el antes/después', async () => {
    const db = getTestDb();
    const variantId = await createVariant({ onHand: 10 });
    await db.insert(stockAdjustments).values({
      variantId,
      delta: -3,
      previousOnHand: 10,
      newOnHand: 7,
      reason: 'rotura',
      actor: 'admin:due@tienda.py',
      createdAt: minuto(1),
    });

    const [row] = (await listActivity()).rows;
    if (row?.kind !== 'stock') throw new Error('esperaba una fila de stock');
    expect(row.variantId).toBe(variantId);
    expect(row.sku).toMatch(/^SKU-/);
    expect(row.productName).toMatch(/^prod-/);
    expect(row.delta).toBe(-3);
    expect(row.previousOnHand).toBe(10);
    expect(row.newOnHand).toBe(7);
  });
});

describe.skipIf(!hasTestDb)('el desplegable de personas', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('incluye a los desactivados: es justo a quien se quiere revisar', async () => {
    const ana = await unUsuario('ana@tienda.py', 'Ana');
    await unUsuario('beto@tienda.py');

    await getTestDb().update(users).set({ isActive: false }).where(eq(users.id, ana));

    const actores = await actividadActores();
    expect(actores.map((actor) => actor.label)).toEqual(['Ana', 'beto@tienda.py']);
    expect(actores.find((actor) => actor.label === 'Ana')?.isActive).toBe(false);
  });
});
