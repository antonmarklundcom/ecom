import type { Pool } from 'mysql2/promise';

/**
 * Objetos de schema que el dialecto MySQL de drizzle-kit no sabe generar.
 * Se aplican después de cada `db:push` y también en el setup de los tests.
 */
export const FULLTEXT_INDEX_NAME = 'ft_products_name_description';
export const CATEGORIES_PARENT_FK = 'categories_parent_fk';
export const ORDERS_CUSTOMER_FK = 'orders_customer_fk';
export const ORDERS_COUPON_FK = 'orders_coupon_fk';
export const LOGIN_TOKENS_CUSTOMER_FK = 'login_tokens_customer_fk';
export const ORDER_EVENTS_ACTOR_FK = 'order_events_actor_fk';
export const STOCK_ADJUSTMENTS_ACTOR_FK = 'stock_adjustments_actor_fk';

export async function applySchemaExtras(pool: Pool): Promise<string[]> {
  const applied: string[] = [];

  const [ftRows] = await pool.query<never>(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = ?`,
    [FULLTEXT_INDEX_NAME],
  );
  if (count(ftRows) === 0) {
    await pool.query(
      `ALTER TABLE \`products\` ADD FULLTEXT INDEX \`${FULLTEXT_INDEX_NAME}\` (\`name\`, \`description\`)`,
    );
    applied.push(`FULLTEXT(products.name, products.description)`);
  }

  const [fkRows] = await pool.query<never>(
    `SELECT COUNT(*) AS n FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name = 'categories' AND constraint_name = ?`,
    [CATEGORIES_PARENT_FK],
  );
  if (count(fkRows) === 0) {
    await pool.query(
      `ALTER TABLE \`categories\` ADD CONSTRAINT \`${CATEGORIES_PARENT_FK}\` ` +
        'FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    applied.push('FK categories.parent_id → categories.id');
  }

  // `orders.customer_id` → `customers.id` (PR E). Va acá y no en el schema
  // por lo mismo que la FK de categorías: `customers` se declara después de
  // `orders` en schema.ts y drizzle-kit no maneja la referencia hacia
  // adelante.
  //
  // `ON DELETE SET NULL` y no `CASCADE`: borrar una cuenta no puede borrar
  // los pedidos que esa persona pagó. El pedido sobrevive como lo que
  // siempre pudo ser —uno de invitado— y la contabilidad no se mueve.
  const [ordersCustomerFk] = await pool.query<never>(
    `SELECT COUNT(*) AS n FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name = 'orders' AND constraint_name = ?`,
    [ORDERS_CUSTOMER_FK],
  );
  if (count(ordersCustomerFk) === 0) {
    await pool.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`${ORDERS_CUSTOMER_FK}\` ` +
        'FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    applied.push('FK orders.customer_id → customers.id');
  }

  // `orders.coupon_id` → `coupons.id` (PR G). `ON DELETE SET NULL`: borrar un
  // cupón no puede borrar los pedidos que lo usaron. El pedido conserva
  // `coupon_code` y `discount_pyg`, que es lo que explica su total dentro de
  // seis meses — por eso el código se guarda como snapshot y no sólo como FK.
  const [ordersCouponFk] = await pool.query<never>(
    `SELECT COUNT(*) AS n FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name = 'orders' AND constraint_name = ?`,
    [ORDERS_COUPON_FK],
  );
  if (count(ordersCouponFk) === 0) {
    await pool.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`${ORDERS_COUPON_FK}\` ` +
        'FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    applied.push('FK orders.coupon_id → coupons.id');
  }

  // `login_tokens.customer_id` → `customers.id` (PR F). `ON DELETE CASCADE` y
  // no SET NULL: al revés que la auditoría, acá no hay nada que conservar. Un
  // código de acceso de una cuenta que ya no existe es basura con capacidad de
  // abrir sesiones, y lo correcto es que se vaya con ella.
  const [loginTokensFk] = await pool.query<never>(
    `SELECT COUNT(*) AS n FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name = 'login_tokens' AND constraint_name = ?`,
    [LOGIN_TOKENS_CUSTOMER_FK],
  );
  if (count(loginTokensFk) === 0) {
    await pool.query(
      `ALTER TABLE \`login_tokens\` ADD CONSTRAINT \`${LOGIN_TOKENS_CUSTOMER_FK}\` ` +
        'FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
    applied.push('FK login_tokens.customer_id → customers.id');
  }

  // Atribución auditable (PR D). Van acá y no en el schema por lo mismo que la
  // FK de categorías: drizzle-kit no las genera desde `mysqlTable`.
  //
  // `ON DELETE SET NULL` en las dos, y es la decisión importante: borrar un
  // usuario **no** puede borrar el historial de lo que hizo. El log es
  // append-only y sobrevive a la persona; lo que queda después del borrado es
  // el `actor` de texto, que es justamente para eso.
  for (const [constraint, table] of [
    [ORDER_EVENTS_ACTOR_FK, 'order_events'],
    [STOCK_ADJUSTMENTS_ACTOR_FK, 'stock_adjustments'],
  ] as const) {
    const [rows] = await pool.query<never>(
      `SELECT COUNT(*) AS n FROM information_schema.table_constraints
        WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
      [table, constraint],
    );
    if (count(rows) === 0) {
      await pool.query(
        `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ` +
          'FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
      );
      applied.push(`FK ${table}.actor_user_id → users.id`);
    }
  }

  await pool.query(
    "INSERT INTO `counters` (`name`, `value`) VALUES ('order_number', 0) " +
      'ON DUPLICATE KEY UPDATE `name` = `name`',
  );
  applied.push('contador order_number');

  return applied;
}

function count(rows: unknown): number {
  const first = Array.isArray(rows) ? (rows[0] as { n?: number } | undefined) : undefined;
  return Number(first?.n ?? 0);
}
