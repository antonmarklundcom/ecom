import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import * as schema from './schema';

/**
 * One pool per process. Hostinger caps concurrent connections per DB user —
 * a bigger pool buys nothing and produces random ER_CON_COUNT_ERROR under load.
 */
const POOL_OPTIONS = {
  connectionLimit: 8,
  // Store and read everything in UTC; business logic converts to America/Asuncion.
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: false,
  charset: 'utf8mb4_general_ci',
} as const;

export type Database = MySql2Database<typeof schema>;

declare global {
  // Next.js dev reloads the module graph on every edit; without this the pool
  // count grows until MySQL refuses new connections.
  var __ecomPool: mysql.Pool | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL no está definida. Copiá .env.example a .env.local y completala. ' +
        '(tsx no carga .env solo: usá `import "dotenv/config"` al inicio de cada script.)',
    );
  }
  return url;
}

export function getPool(): mysql.Pool {
  if (!globalThis.__ecomPool) {
    globalThis.__ecomPool = mysql.createPool({ uri: connectionString(), ...POOL_OPTIONS });
  }
  return globalThis.__ecomPool;
}

let cachedDb: Database | undefined;

/** Lazily built so importing this module never requires DATABASE_URL. */
export function getDb(): Database {
  if (!cachedDb) {
    cachedDb = drizzle(getPool(), { schema, mode: 'default' });
  }
  return cachedDb;
}

/** Ambient handle for app code: `db.select()...`. Scripts/tests can use getDb(). */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export async function closePool(): Promise<void> {
  if (globalThis.__ecomPool) {
    await globalThis.__ecomPool.end();
    globalThis.__ecomPool = undefined;
    cachedDb = undefined;
  }
}

export { schema };
