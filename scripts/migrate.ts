import "../src/lib/load-env";
import { closePool, getPool } from "@/db";
import { applySchemaExtras } from "@/db/extras";
import { migrateWithBoundedLocks } from "@/db/migrate";
import { migrationStatus, type MigrationStatus } from "@/db/migration-status";
import { safeError } from "@/lib/safe-error";

/**
 * `pnpm db:migrate`: las migraciones versionadas de `drizzle/` y los extras.
 *
 * Antes de aplicar dice qué falta, y avisa lo que drizzle **no** va a hacer:
 * una migración pendiente más vieja que la última aplicada se saltea sin
 * error, y una fila aplicada que no es de este journal (migración propia de
 * la tienda, o reescrita) no se arregla migrando
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md B2). El ALTER no espera un lock más que
 * `MIGRATION_LOCK_WAIT_SECONDS` (B3).
 */
function describir(status: MigrationStatus): string {
  return status.current
    ? `al día (${status.applied}/${status.expected})`
    : `${status.pending.length} pendiente(s)` +
        (status.pending.length ? `: ${status.pending.join(", ")}` : "") +
        (status.foreign
          ? ` · ${status.foreign} fila(s) que no son de este journal`
          : "");
}

async function main(): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    const antes = await migrationStatus(connection);
    console.log(`Migraciones: ${describir(antes)}`);
    if (antes.skipped.length > 0 || antes.foreign > 0) {
      console.error(
        "✗ La historia de migraciones de esta base no coincide con drizzle/: " +
          (antes.skipped.length
            ? `drizzle saltearía ${antes.skipped.join(", ")} (son más viejas que la última aplicada). `
            : "") +
          'No migro: revisalo a mano con backup y `pnpm db:check` (NEW-STORE.md § "Migraciones propias de una tienda").'
      );
      process.exitCode = 1;
      return;
    }
    await migrateWithBoundedLocks(connection);
    await applySchemaExtras(connection);
    console.log(
      `Migrations and schema extras applied — ${describir(await migrationStatus(connection))}`
    );
  } finally {
    connection.release();
    await closePool();
  }
}
main().catch(async (error) => {
  console.error(safeError(error).message);
  await closePool();
  process.exitCode = 1;
});
