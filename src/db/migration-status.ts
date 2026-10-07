import { readMigrationFiles } from "drizzle-orm/migrator";

import journal from "../../drizzle/meta/_journal.json";
import { getPool } from "@/db";

/**
 * ¿La base tiene aplicadas exactamente las migraciones de este código?
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md B2)
 *
 * El health miraba si MySQL contesta y si las columnas del catálogo existen,
 * pero nada comparaba `__drizzle_migrations` con `drizzle/meta/_journal.json`.
 * Un deploy que sube código nuevo antes de migrar —o una tienda cuya historia
 * de migraciones se cruzó con la del template— seguía diciendo "todo bien".
 *
 * El migrador de drizzle aplica una migración sólo si su `when` es mayor que
 * el `created_at` de la última aplicada, y nunca mira hashes. Por eso se
 * reportan tres cosas distintas:
 *
 * - `pending`: migraciones del journal que la base no tiene;
 * - `skipped`: de esas, las que `pnpm db:migrate` **no va a correr nunca**
 *   porque son más viejas que la última aplicada (hay que revisarlas a mano);
 * - `foreign`: filas aplicadas que no son de este journal (otro hash, u otra
 *   fecha para el mismo hash): una migración propia de la tienda, o una que
 *   el template reescribió.
 */

export type MigrationStatus = {
  /** Sin pendientes ni filas ajenas: el esquema es el que espera el código. */
  current: boolean;
  applied: number;
  expected: number;
  pending: string[];
  skipped: string[];
  foreign: number;
};

export type ExpectedMigration = { tag: string; hash: string; when: number };
export type AppliedMigration = { hash: string; createdAt: number };

let expectedCache: ExpectedMigration[] | null = null;

/** Las migraciones de `drizzle/` con el hash que les calcula drizzle. */
export function expectedMigrations(
  migrationsFolder = "drizzle"
): ExpectedMigration[] {
  if (migrationsFolder === "drizzle" && expectedCache) return expectedCache;
  const files = readMigrationFiles({ migrationsFolder });
  const entries = journal.entries;
  const result = files.map((file, index) => ({
    tag: entries[index]?.tag ?? `#${index}`,
    hash: file.hash,
    when: file.folderMillis,
  }));
  if (migrationsFolder === "drizzle") expectedCache = result;
  return result;
}

/** La comparación, pura: lo que dice la base contra lo que trae el código. */
export function compareMigrations(
  applied: readonly AppliedMigration[],
  expected: readonly ExpectedMigration[]
): MigrationStatus {
  const appliedByHash = new Map(applied.map((row) => [row.hash, row]));
  const expectedByHash = new Map(expected.map((entry) => [entry.hash, entry]));

  const foreign = applied.filter((row) => {
    const entry = expectedByHash.get(row.hash);
    return !entry || entry.when !== row.createdAt;
  }).length;

  const pendingEntries = expected.filter(
    (entry) => !appliedByHash.has(entry.hash)
  );
  const newest = applied.reduce(
    (max, row) => (row.createdAt > max ? row.createdAt : max),
    Number.NEGATIVE_INFINITY
  );

  return {
    current: pendingEntries.length === 0 && foreign === 0,
    applied: applied.length,
    expected: expected.length,
    pending: pendingEntries.map((entry) => entry.tag),
    skipped: pendingEntries
      .filter((entry) => entry.when <= newest)
      .map((entry) => entry.tag),
    foreign,
  };
}

type Queryable = {
  query: (sql: string) => Promise<unknown>;
};

/**
 * Lee `__drizzle_migrations` y la compara con el journal. Una base sin esa
 * tabla (nunca migrada) tiene todo pendiente; cualquier otro error sube.
 */
export async function migrationStatus(
  connection: Queryable = getPool()
): Promise<MigrationStatus> {
  let rows: { hash: string; created_at: number | string }[] = [];
  try {
    const result = (await connection.query(
      "SELECT hash, created_at FROM `__drizzle_migrations` ORDER BY id"
    )) as [typeof rows, unknown];
    rows = result[0];
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error;
  }
  return compareMigrations(
    rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
    expectedMigrations()
  );
}
