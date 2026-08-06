import '../../src/lib/load-env';

import { sql } from 'drizzle-orm';

import { closePool, getDb } from '../../src/db';
import * as schema from '../../src/db/schema';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** `describe.skipIf(!hasTestDb)` — sin base, sólo corren los tests unitarios. */
export const hasTestDb = Boolean(TEST_DATABASE_URL);

// El código de dominio abre sus transacciones contra el pool de `src/db`, que
// es justamente el camino que queremos ejercitar (transacciones y FOR UPDATE
// reales, no un executor inyectado que se saltaría la transacción). El pool se
// construye recién en el primer getDb(), así que alcanza con apuntarlo acá.
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

export function getTestDb() {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL no definida');
  return getDb();
}

export async function closeTestDb(): Promise<void> {
  await closePool();
}

const TABLES = [
  'order_events',
  'stock_reservations',
  'receipts',
  'payment_events',
  'payments',
  'order_items',
  'orders',
  'variants',
  'product_images',
  'products',
  'categories',
  'shipping_zones',
  'users',
  'counters',
];

/** Vacía todo entre tests y deja el contador de pedidos en cero. */
export async function resetTables(): Promise<void> {
  const db = getTestDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  await db.insert(schema.counters).values({ name: 'order_number', value: 0 });
}
