import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import type { Connection, PoolConnection } from "mysql2/promise";

/**
 * Migrar sin quedarse colgado detrás de un lock (docs/TEMPLATE-IMPROVEMENT-PLAN.md B3).
 *
 * Un `ALTER TABLE` necesita el metadata lock exclusivo de la tabla, y espera
 * `lock_wait_timeout` —por defecto **un año** en MySQL y MariaDB— a que
 * termine cualquier transacción que la esté leyendo: una conexión olvidada,
 * o el backup nocturno con su snapshot consistente de hasta veinte minutos.
 * Mientras espera, cada consulta nueva de la vidriera sobre esa tabla queda
 * en fila detrás del ALTER: la tienda se cuelga entera.
 *
 * Con el tope, la migración falla en segundos con `ER_LOCK_WAIT_TIMEOUT` y se
 * reintenta cuando la base esté tranquila. El valor se pone en la sesión de
 * esta conexión y se devuelve al default al terminar, así una conexión del
 * pool no se queda con un tope que no es suyo.
 */

export const MIGRATION_LOCK_WAIT_SECONDS = 30;

type MigrationConnection = Connection | PoolConnection;

export async function migrateWithBoundedLocks(
  connection: MigrationConnection,
  options: {
    migrationsFolder?: string;
    lockWaitTimeoutSeconds?: number;
  } = {}
): Promise<void> {
  const seconds = options.lockWaitTimeoutSeconds ?? MIGRATION_LOCK_WAIT_SECONDS;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3_600) {
    throw new Error(
      "lockWaitTimeoutSeconds tiene que ser un entero de 1 a 3600"
    );
  }
  await connection.query(`SET SESSION lock_wait_timeout = ${seconds}`);
  try {
    await migrate(drizzle(connection), {
      migrationsFolder: options.migrationsFolder ?? "drizzle",
    });
  } finally {
    await connection
      .query("SET SESSION lock_wait_timeout = DEFAULT")
      .catch(() => {});
  }
}
