import '@/lib/load-env';

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import { sql } from 'drizzle-orm';

import { closePool, getDb } from '@/db';
import { BACKUP_TABLES } from '@/db/schema';

/**
 * `pnpm restore -- <archivo.jsonl.gz>` — reconstruye una base desde un backup
 * de `src/domain/backup.ts` (plan-operacion §5.4 A).
 *
 * ### El candado, que es lo más importante de este archivo
 *
 * **Sólo corre contra una base cuyo nombre contenga `restore` o `test`.** Es
 * el mismo candado que `tests/global-setup.ts` le pone a `TEST_DATABASE_URL`,
 * y por el mismo motivo: este script vacía tablas. Un `pnpm restore` corrido
 * con el `.env` de producción cargado por accidente —el error más fácil del
 * mundo, y el más caro— borra la tienda en vez de recuperarla.
 *
 * Restaurar en producción no es un `pnpm restore` con otro flag: es crear una
 * base nueva llamada `tienda_restore`, restaurar ahí, mirar que esté todo, y
 * recién entonces cambiar `DATABASE_URL`. Esa fricción es a propósito.
 *
 * ### El orden
 *
 * `BACKUP_TABLES` está ordenada por dependencia, y las filas del archivo salen
 * en ese mismo orden, así que insertar en el orden en que vienen nunca choca
 * contra una FK. Igual se apagan los `FOREIGN_KEY_CHECKS` durante la carga:
 * un backup sacado mientras alguien compraba puede tener una fila hija cuya
 * madre se escribió un milisegundo después del `SELECT` de su tabla.
 */

export type Opciones = { archivo: string; vaciar: boolean };

export function parseArgs(argv: string[]): Opciones {
  const args = argv.filter((arg) => arg !== '--');
  const archivo = args.find((arg) => !arg.startsWith('--'));
  if (!archivo) {
    throw new Error('Falta el archivo: pnpm restore -- backups/backup-2026-08-12T0300.jsonl.gz');
  }
  return { archivo, vaciar: !args.includes('--sin-vaciar') };
}

/**
 * El candado. Exportado para poder testearlo sin tocar ninguna base.
 *
 * Se mira el **nombre de la base**, no la URL entera: un host llamado
 * `test.hostinger.com` no convierte a `tienda_produccion` en una base de
 * pruebas.
 */
export function baseEsRestaurable(url: string): boolean {
  try {
    const nombre = new URL(url).pathname.replace(/^\//, '');
    return nombre !== '' && /restore|test/i.test(nombre);
  } catch {
    return false;
  }
}

/** Lee el `.jsonl.gz` línea por línea. Nunca carga el archivo entero. */
export async function* leerBackup(
  archivo: string,
): AsyncGenerator<{ table: string; row: Record<string, unknown> }> {
  const entrada = createReadStream(archivo).pipe(createGunzip());
  const lineas = createInterface({ input: entrada, crlfDelay: Infinity });

  for await (const linea of lineas) {
    const limpia = linea.trim();
    if (limpia === '') continue;
    const parsed = JSON.parse(limpia) as { table: string; row: Record<string, unknown> };
    if (!parsed?.table || !parsed?.row) continue;
    // Una tabla que no está en la lista es un backup de otra versión del
    // schema: se ignora con ruido en vez de reventar a mitad de la carga.
    if (!(BACKUP_TABLES as readonly string[]).includes(parsed.table)) {
      console.warn(`⚠ tabla desconocida en el backup, se ignora: ${parsed.table}`);
      continue;
    }
    yield parsed;
  }
}

export type RestoreReport = { tablas: number; filas: number };

export async function restaurar(opciones: Opciones): Promise<RestoreReport> {
  const url = process.env.DATABASE_URL ?? '';
  if (!baseEsRestaurable(url)) {
    throw new Error(
      'Me niego a restaurar sobre esta base: el nombre tiene que contener "restore" o "test". ' +
        'Creá una base nueva (p. ej. `tienda_restore`), apuntá DATABASE_URL ahí, mirá que esté ' +
        'todo, y recién después cambiá la de producción.',
    );
  }

  const db = getDb();
  const tablas = new Set<string>();
  let filas = 0;

  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  try {
    if (opciones.vaciar) {
      // En orden inverso al de dependencia, por prolijidad: con los checks
      // apagados daría igual, pero el día que alguien los prenda esto sigue
      // andando.
      for (const tabla of [...BACKUP_TABLES].reverse()) {
        await db.execute(sql.raw(`DELETE FROM \`${tabla}\``));
      }
    }

    for await (const { table, row } of leerBackup(opciones.archivo)) {
      const columnas = Object.keys(row);
      if (columnas.length === 0) continue;

      // Identificadores por `sql.identifier` y valores por binds: nada de este
      // archivo interpola datos en el SQL a mano. El contenido del backup es
      // dato, no código, aunque haya salido de nuestra propia base — un
      // archivo `.jsonl.gz` puede venir editado, o de otra instalación.
      const nombres = sql.join(
        columnas.map((columna) => sql.identifier(columna)),
        sql`, `,
      );
      const valores = sql.join(
        columnas.map((columna) => sql`${normalizar(row[columna])}`),
        sql`, `,
      );

      await db.execute(
        sql`INSERT INTO ${sql.identifier(table)} (${nombres}) VALUES (${valores})`,
      );

      tablas.add(table);
      filas += 1;
    }
  } finally {
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  }

  return { tablas: tablas.size, filas };
}

/** El JSON no tiene fechas ni buffers: vuelven como string y así entran. */
function normalizar(valor: unknown): string | number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number' || typeof valor === 'string') return valor;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  return JSON.stringify(valor);
}

async function main(): Promise<void> {
  const opciones = parseArgs(process.argv.slice(2));
  const reporte = await restaurar(opciones);
  console.log(`✓ ${reporte.filas} filas en ${reporte.tablas} tablas`);
  await closePool();
}

// Sólo cuando se lo corre como script, no cuando lo importa un test.
if (process.argv[1]?.includes('restore-backup')) {
  main().catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closePool();
    process.exit(1);
  });
}
