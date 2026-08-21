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
  'stock_adjustments',
  'variants',
  'product_images',
  'products',
  'categories',
  'shipping_zones',
  // Antes que `users`, que la referencia con FK (updated_by).
  'bank_details',
  'users',
  // Antes que `customers`, que la referencia con FK.
  'login_tokens',
  'customers',
  // Después de `orders`, que la referencia con FK.
  'coupons',
  'counters',
  // La marca de `POST /api/setup/init`: sin vaciarla, el segundo test de esa
  // ruta arranca creyendo que la tienda ya se inicializó.
  'setup_state',
];

/**
 * Vacía todo entre tests y deja el contador de pedidos en cero.
 *
 * `DELETE` y no `TRUNCATE`: TRUNCATE es DDL y necesita un metadata lock
 * exclusivo, así que en MySQL 8 se queda esperando —con `lock_wait_timeout`
 * por defecto, un año— si alguna conexión del pool dejó una transacción
 * abierta. `DELETE` toma locks de fila normales y las tablas de test son
 * chicas. (MariaDB, que es lo que corre en local, no se cuelga igual: esto
 * apareció recién en CI.)
 */
export async function resetTables(): Promise<void> {
  const db = getTestDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of TABLES) {
    // Nada de `ALTER TABLE ... AUTO_INCREMENT = 1` acá: también es DDL y
    // vuelve a meter el mismo metadata lock. Ningún test depende de que los
    // ids arranquen en 1 — las factories devuelven el id que crearon.
    await db.execute(sql.raw(`DELETE FROM \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  await db.insert(schema.counters).values({ name: 'order_number', value: 0 });
}
