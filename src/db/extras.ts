import type { Pool } from 'mysql2/promise';

/**
 * Objetos de schema que el dialecto MySQL de drizzle-kit no sabe generar.
 * Se aplican después de cada `db:push` y también en el setup de los tests.
 */
export const FULLTEXT_INDEX_NAME = 'ft_products_name_description';
export const CATEGORIES_PARENT_FK = 'categories_parent_fk';

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
