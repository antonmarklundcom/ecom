import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { orderEvents, stockAdjustments } from '@/db/schema';
import { activityActors, listActivity } from '@/domain/admin-activity';

import { closeTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createAdminUser, createOrder, createVariant } from '../helpers/factories';

/**
 * `/admin/actividad` (PLAN.md FASE 2, PR L).
 *
 * El feed mezcla dos tablas append-only. Lo que se prueba acá es lo que se
 * rompe cuando se mezcla mal: que la paginación sea del **conjunto** (y no 20
 * de cada tabla ordenadas después), que el filtro por usuario use el
 * `actor_user_id` del PR D, y que lo que no movió una persona —el cron, un
 * webhook— aparezca igual, sin usuario.
 */

async function evento(options: {
  orderId: number;
  actor: string;
  actorUserId?: number | null;
  createdAt: Date;
}): Promise<void> {
  await getDb().insert(orderEvents).values({
    orderId: options.orderId,
    fromStatus: 'pendiente_pago',
    toStatus: 'pagado',
    actor: options.actor,
    actorUserId: options.actorUserId ?? null,
    createdAt: options.createdAt,
  });
}

async function ajuste(options: {
  variantId: number;
  actor: string;
  actorUserId?: number | null;
  createdAt: Date;
}): Promise<void> {
  await getDb().insert(stockAdjustments).values({
    variantId: options.variantId,
    delta: -2,
    previousOnHand: 10,
    newOnHand: 8,
    reason: 'rotura',
    actor: options.actor,
    actorUserId: options.actorUserId ?? null,
    createdAt: options.createdAt,
  });
}

const T = (minutos: number) => new Date(Date.UTC(2026, 0, 15, 12, minutos, 0));

describe.skipIf(!hasTestDb)('feed de actividad', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('mezcla las dos tablas y las devuelve de la más nueva a la más vieja', async () => {
    const orderId = await createOrder();
    const variantId = await createVariant({ onHand: 10 });

    await evento({ orderId, actor: 'admin:due@tienda.py', createdAt: T(1) });
    await ajuste({ variantId, actor: 'admin:due@tienda.py', createdAt: T(3) });
    await evento({ orderId, actor: 'cron', createdAt: T(2) });

    const feed = await listActivity();

    expect(feed.total).toBe(3);
    expect(feed.rows.map((row) => row.kind)).toEqual(['stock', 'pedido', 'pedido']);
    expect(feed.rows[1]!.actor).toBe('cron');
  });

  /**
   * El motivo de que el UNION esté en SQL: con dos consultas separadas, "las
   * 30 más recientes" son 30 de cada tabla ordenadas después, y la página 2
   * repite filas que la 1 ya mostró.
   */
  it('la paginación es del conjunto, no de cada tabla', async () => {
    const orderId = await createOrder();
    const variantId = await createVariant({ onHand: 10 });

    // Los cuatro más nuevos son ajustes de stock; los pedidos quedan atrás.
    for (let i = 0; i < 4; i += 1) await evento({ orderId, actor: 'cron', createdAt: T(i) });
    for (let i = 4; i < 8; i += 1) await ajuste({ variantId, actor: 'cron', createdAt: T(i) });

    const primera = await listActivity({ perPage: 4 });
    const segunda = await listActivity({ perPage: 4, page: 2 });

    expect(primera.total).toBe(8);
    expect(primera.totalPages).toBe(2);
    expect(primera.rows.every((row) => row.kind === 'stock')).toBe(true);
    expect(segunda.rows.every((row) => row.kind === 'pedido')).toBe(true);

    // Y ninguna fila aparece en las dos páginas.
    const claves = [...primera.rows, ...segunda.rows].map((row) => `${row.kind}-${row.id}`);
    expect(new Set(claves).size).toBe(8);
  });

  it('filtra por usuario con el actor_user_id, no con el texto', async () => {
    const orderId = await createOrder();
    const encargada = await createAdminUser({ email: 'encargada@tienda.py', role: 'staff' });
    const dueno = await createAdminUser({ email: 'due@tienda.py', role: 'owner' });

    await evento({ orderId, actor: 'admin:encargada@tienda.py', actorUserId: encargada, createdAt: T(1) });
    await evento({ orderId, actor: 'admin:due@tienda.py', actorUserId: dueno, createdAt: T(2) });
    // Sin usuario detrás: el cron. No tiene que salir en ningún filtro por
    // persona, pero sí en el feed sin filtrar.
    await evento({ orderId, actor: 'cron', createdAt: T(3) });

    const suyo = await listActivity({ actorUserId: encargada });
    expect(suyo.total).toBe(1);
    expect(suyo.rows[0]!.actor).toBe('admin:encargada@tienda.py');

    expect((await listActivity()).total).toBe(3);
  });

  it('filtra por tipo y por rango de fechas', async () => {
    const orderId = await createOrder();
    const variantId = await createVariant({ onHand: 10 });

    await evento({ orderId, actor: 'cron', createdAt: T(1) });
    await ajuste({ variantId, actor: 'cron', createdAt: T(2) });

    expect((await listActivity({ kind: 'stock' })).total).toBe(1);
    expect((await listActivity({ kind: 'pedido' })).total).toBe(1);

    const soloElPrimero = await listActivity({ createdTo: T(1) });
    expect(soloElPrimero.total).toBe(1);
    expect(soloElPrimero.rows[0]!.kind).toBe('pedido');
  });

  it('el ajuste de stock trae el producto y el saldo, no sólo el id', async () => {
    const variantId = await createVariant({ onHand: 10 });
    await ajuste({ variantId, actor: 'admin:due@tienda.py', createdAt: T(1) });

    const [row] = (await listActivity({ kind: 'stock' })).rows;
    expect(row).toMatchObject({ delta: -2, newOnHand: 8, reason: 'rotura' });
    expect(row!.sku).toBeTruthy();
    expect(row!.productName).toBeTruthy();
  });

  it('los actores del filtro incluyen a los usuarios desactivados', async () => {
    await createAdminUser({ email: 'quien-se-fue@tienda.py', role: 'staff' });
    expect((await activityActors()).map((actor) => actor.email)).toContain(
      'quien-se-fue@tienda.py',
    );
  });
});
