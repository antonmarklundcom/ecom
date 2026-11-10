import { safeError } from "@/lib/safe-error";
import { createHash, randomBytes } from "node:crypto";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { drizzle } from "drizzle-orm/mysql2";

import { sql } from "drizzle-orm";

import { getPool } from "@/db";
import * as schema from "@/db/schema";
import {
  backupManifest,
  rowDigest,
  type BackupManifest,
  type BackupSetManifest,
  type BackupSetObject,
} from "./backup-format";
import { BACKUP_TABLES, type BackupTable } from "@/db/schema";
import {
  PREFIJO_BACKUPS,
  clienteR2,
  r2Configurado,
  type ClienteR2,
} from "@/lib/r2";
import { log } from "@/lib/log";
import { PY_TIMEZONE } from "@/lib/py";

import type { Executor } from "./executor";

/**
 * Copias de seguridad de la base, desde adentro de la app (plan-operacion §5.4 A).
 *
 * `pnpm backup` ya existía y sigue existiendo: es el camino "grande",
 * `mysqldump` corrido **desde la máquina de Anton** contra la base remota. Su
 * problema es que depende de que alguien se acuerde. Esto es el otro camino:
 * un cron que corre solo, todos los días, sin que nadie haga nada.
 *
 * ### Las cuatro decisiones que da el entorno
 *
 * 1. **No hay `mysqldump` en el slot de Hostinger**, ni conviene pelearse con
 *    los ulimits para conseguirlo. Así que el dump es JavaScript: `SELECT *`
 *    paginado y JSON Lines.
 * 2. **Hay poca RAM.** Nunca se arma la base entera en memoria: se pagina de a
 *    1.000 filas y se escribe a un stream comprimido. Una tienda con 50.000
 *    pedidos tiene que poder sacar su copia en un slot compartido.
 * 3. **La lista de tablas es explícita** (`BACKUP_TABLES` en `schema.ts`), no
 *    `SHOW TABLES`. Una tabla nueva que nadie decidió incluir hace fallar un
 *    test en vez de entrar sola —o, peor, quedar afuera en silencio.
 * 4. **`raw_payload` de `payments` va entero.** Es el aviso crudo de Pagopar y
 *    es parte del rastro de la plata: un backup que lo trunca no sirve para
 *    reconstruir un incidente, que es justo cuando se usa un backup.
 *
 * ### El formato
 *
 * JSON Lines comprimido: una línea por fila, `{"table":"orders","row":{…}}`.
 *
 * - **Formato 3 (el del cron, en R2)**: un set bajo `backups/<id>/`, con **un
 *   objeto por tabla** (`orders.jsonl.gz`, …) y un `manifest.json` que lista
 *   cada objeto con su cantidad de filas y sus hashes, más el total. El
 *   manifiesto se escribe **último**: un set sin manifiesto es una corrida que
 *   no terminó, y `pnpm restore` rechaza cualquier set con un objeto de menos
 *   o un conteo o hash que no coincide. Partirlo así saca el techo de "un solo
 *   archivo" y una tabla grande no frena a las demás.
 * - **Formato 2 (un archivo)**: manifiesto de versión, las filas y un cierre
 *   con conteos y checksum, en un solo `.jsonl.gz` (`dumpDatabase`). Lo sigue
 *   aceptando `pnpm restore`.
 *
 * La lectura usa una sola conexión con snapshot consistente; la carga sólo
 * acepta una base de recuperación vacía.
 */

/** Cuántas filas por consulta. Ver la decisión 2. */
export const PAGE_SIZE = 1_000;

/** Cuántos días se conservan las copias en R2. */
export const RETAIN_DAYS = 14;

export type DumpStats = { tables: number; rows: number };

/**
 * Vuelca la base a un stream de JSON Lines (sin comprimir).
 *
 * La paginación va por **clave primaria** y no por `OFFSET`: con `OFFSET`, una
 * fila insertada a mitad del dump corre el resto y una fila se salta o se
 * duplica. Todas las tablas de `BACKUP_TABLES` tienen `id` autoincremental
 * salvo `counters` (PK `name`), `setup_state`, `bank_details`, `store_settings` y `job_runs`,
 * que son de una o dos filas y se traen enteras.
 */
export async function* dumpRows(
  executor?: Executor,
  tables: readonly BackupTable[] = BACKUP_TABLES
): AsyncGenerator<{ table: BackupTable; row: Record<string, unknown> }> {
  if (!executor) {
    const connection = await getPool().getConnection();
    let completed = false;
    try {
      await connection.query(
        "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ"
      );
      await connection.query(
        "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"
      );
      yield* dumpRows(drizzle(connection, { schema, mode: "default" }), tables);
      await connection.commit();
      completed = true;
    } catch (error) {
      connection.destroy();
      throw error;
    } finally {
      if (!completed) connection.destroy();
      connection.release();
    }
    return;
  }
  const tx = executor;

  for (const table of tables) {
    const pk = PRIMARY_KEY[table];

    if (pk === null) {
      // Tablas de configuración: una puñado de filas, sin paginar.
      const result = await tx.execute(sql.raw(`SELECT * FROM \`${table}\``));
      for (const row of rowsOf(result)) yield { table, row };
      continue;
    }

    let desde: number | string | null = null;
    for (;;) {
      const where = desde === null ? "" : `WHERE \`${pk}\` > ${escapar(desde)}`;
      const result = await tx.execute(
        sql.raw(
          `SELECT * FROM \`${table}\` ${where} ORDER BY \`${pk}\` ASC LIMIT ${PAGE_SIZE}`
        )
      );
      const filas = rowsOf(result);
      if (filas.length === 0) break;

      for (const row of filas) yield { table, row };

      if (filas.length < PAGE_SIZE) break;

      // El cursor de la página siguiente. Si la columna no vino —un `pk` mal
      // escrito en `PRIMARY_KEY`— se corta con un error claro en vez de
      // quedarse en un bucle infinito volcando la misma página para siempre,
      // que es la peor forma de fallar que puede tener un backup.
      const ultima = filas[filas.length - 1]!;
      const cursor = ultima[pk];
      if (typeof cursor !== "number" && typeof cursor !== "string") {
        throw new Error(
          `La tabla ${table} no devolvió la columna "${pk}" para paginar`
        );
      }
      desde = cursor;
    }
  }
}

/**
 * El dump entero como stream **comprimido**, listo para subir.
 *
 * Devuelve también las cantidades, que se resuelven recién cuando el stream
 * termina de consumirse — por eso es una promesa y no un número.
 */
export function dumpDatabase(executor?: Executor): {
  stream: Readable;
  stats: Promise<DumpStats>;
} {
  // Los `!` son honestos: el ejecutor de una promesa corre de forma síncrona,
  // así que las dos quedan asignadas antes de la línea siguiente. TypeScript
  // no lo sabe.
  let resolver!: (stats: DumpStats) => void;
  let rechazar!: (error: unknown) => void;
  const stats = new Promise<DumpStats>((resolve, reject) => {
    resolver = resolve;
    rechazar = reject;
  });

  const lineas = Readable.from(
    (async function* () {
      const connection = executor ? null : await getPool().getConnection();
      let completed = false;
      try {
        if (connection) {
          await connection.query(
            "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ"
          );
          await connection.query(
            "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"
          );
          const [engines] = await connection.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'"
          );
          if ((engines as unknown[]).length)
            throw new Error("El backup exige tablas InnoDB");
        }
        const tx =
          executor ?? drizzle(connection!, { schema, mode: "default" });
        const manifest = await backupManifest(tx);
        yield `${JSON.stringify(manifest)}\n`;
        const tablas = new Set<string>();
        // Las tablas del manifiesto, no las del código: ver
        // `backupTablesForMigration` (B4).
        const tables = manifest.tables as readonly BackupTable[];
        const counts = Object.fromEntries(tables.map((table) => [table, 0]));
        const digest = rowDigest();
        let filas = 0;
        for await (const { table, row } of dumpRows(tx, tables)) {
          tablas.add(table);
          filas += 1;
          counts[table]! += 1;
          const line = `${JSON.stringify({ table, row })}\n`;
          digest.update(line);
          yield line;
        }
        yield `${JSON.stringify({ type: "end", counts, rows: filas, sha256: digest.digest("hex") })}\n`;
        if (connection) await connection.commit();
        completed = true;
        resolver({ tables: tablas.size, rows: filas });
      } catch (error) {
        connection?.destroy();
        rechazar(error);
        throw error;
      } finally {
        if (!completed) connection?.destroy();
        connection?.release();
      }
    })()
  );

  // Sin esto, si la subida falla antes de que el dump termine, `stats` queda
  // rechazada y sin nadie escuchándola: Node lo reporta como unhandled
  // rejection y —según la versión— mata el proceso. Quien llama sigue viendo
  // el rechazo porque `runBackup` la espera.
  stats.catch(() => {});

  const stream = createGzip();
  // pipeline forwards failures both ways; attach handlers before consumption.
  void pipeline(lineas, stream, {
    signal: AbortSignal.timeout(20 * 60_000),
  }).catch((error) => {
    rechazar(error);
    stream.destroy(error);
  });
  return { stream, stats };
}

/** La fecha y hora **de Asunción**, que es la que el dueño lee: `2026-08-12T0300`. */
export function backupFecha(now: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: PY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  // `sv-SE` da `2026-08-12 03:00`; se normaliza a algo que sirva de nombre y
  // que ordene alfabéticamente igual que cronológicamente.
  return partes.replace(" ", "T").replace(":", "");
}

/**
 * El nombre del set: `backup-<fecha de Asunción>-<32 hex aleatorios>`. La
 * fecha para que se ordenen solos y el dueño encuentre el de anoche; el
 * aleatorio para que la clave no se adivine aunque alguien sepa la fecha.
 */
export function backupSetId(now: Date = new Date(), aleatorio = randomBytes(16).toString("hex")): string {
  return `backup-${backupFecha(now)}-${aleatorio}`;
}

/** `backup-2026-08-12T0300-<32 hex>`: lo único que la retención toca. */
export const BACKUP_SET_RE = /^backup-\d{4}-\d{2}-\d{2}T\d{4}-[0-9a-f]{32}$/;

/** Los nombres de los objetos de un set. */
export const MANIFIESTO_SET = "manifest.json";
export const objetoDeTabla = (table: string) => `${table}.jsonl.gz`;

/** Escribe un objeto del set (nombre relativo al set). */
export type SubirObjeto = (nombre: string, bytes: Uint8Array, contentType: string) => Promise<void>;

/** Un stream de texto → gzip → bytes, sin armar el texto entero en memoria. */
async function gzipDe(lineas: AsyncIterable<string>): Promise<Buffer> {
  const trozos: Buffer[] = [];
  // El último paso es un consumidor: `pipeline` termina recién cuando gzip
  // vació todo, cierre del stream incluido.
  await pipeline(Readable.from(lineas), createGzip(), async (comprimido: AsyncIterable<Buffer>) => {
    for await (const trozo of comprimido) trozos.push(trozo);
  });
  return Buffer.concat(trozos);
}

/**
 * El dump en formato 3: un objeto por tabla y el manifiesto **al final**.
 *
 * Todo sale del mismo snapshot consistente (una conexión, `REPEATABLE READ`
 * + `CONSISTENT SNAPSHOT`), así que las tablas son de un mismo instante
 * aunque se suban una por una. Cada tabla se comprime en memoria de a
 * páginas: lo que se guarda en RAM es el `.gz` de una tabla, no la tabla.
 */
export async function dumpSet(
  subir: SubirObjeto,
  executor?: Executor
): Promise<{ manifest: BackupSetManifest; bytes: number }> {
  const connection = executor ? null : await getPool().getConnection();
  let completed = false;
  try {
    if (connection) {
      await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      const [engines] = await connection.query(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'"
      );
      if ((engines as unknown[]).length) throw new Error("El backup exige tablas InnoDB");
    }
    const tx = executor ?? drizzle(connection!, { schema, mode: "default" });
    const base: BackupManifest = await backupManifest(tx);
    const tables = base.tables as readonly BackupTable[];
    const total = rowDigest();
    const objects: BackupSetObject[] = [];
    let rows = 0;
    let bytes = 0;

    for (const table of tables) {
      const digest = rowDigest();
      let filas = 0;
      const gz = await gzipDe(
        (async function* () {
          for await (const record of dumpRows(tx, [table])) {
            const line = `${JSON.stringify(record)}\n`;
            digest.update(line);
            total.update(line);
            filas += 1;
            yield line;
          }
        })()
      );
      const name = objetoDeTabla(table);
      await subir(name, gz, "application/gzip");
      objects.push({
        table,
        name,
        rows: filas,
        sha256: digest.digest("hex"),
        bytes: gz.byteLength,
        gzSha256: createHash("sha256").update(gz).digest("hex"),
      });
      rows += filas;
      bytes += gz.byteLength;
    }

    const manifest: BackupSetManifest = {
      ...base,
      type: "backup-set",
      format: 3,
      objects,
      rows,
      sha256: total.digest("hex"),
    };
    // Último, siempre: es lo que dice "este set está completo".
    const json = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await subir(MANIFIESTO_SET, json, "application/json");
    bytes += json.byteLength;

    if (connection) await connection.commit();
    completed = true;
    return { manifest, bytes };
  } catch (error) {
    connection?.destroy();
    throw error;
  } finally {
    if (!completed) connection?.destroy();
    connection?.release();
  }
}

/**
 * Borra los sets de más de `retainDays` días.
 *
 * Sin esto, el bucket crece para siempre — y la retención no es prolijidad:
 * es lo que hace que el backup siga siendo barato y ordenado dentro de un
 * año. Un set se considera viejo por su objeto **más nuevo**, así que un set
 * a medio subir de anoche no se borra antes de tiempo. Sólo toca prefijos con
 * la forma de un set (`BACKUP_SET_RE`): nada más bajo `backups/`.
 */
export async function pruneBackups(
  cliente: ClienteR2,
  retainDays = RETAIN_DAYS,
  now: Date = new Date()
): Promise<number> {
  const limite = now.getTime() - retainDays * 24 * 3600_000;
  const listado = await cliente.listarTodo(PREFIJO_BACKUPS);

  const sets = new Map<string, { keys: string[]; ultimo: number }>();
  for (const objeto of listado) {
    const resto = objeto.key.slice(PREFIJO_BACKUPS.length);
    const corte = resto.indexOf("/");
    if (corte < 0) continue;
    const id = resto.slice(0, corte);
    if (!BACKUP_SET_RE.test(id)) continue;
    const set = sets.get(id) ?? { keys: [], ultimo: 0 };
    set.keys.push(objeto.key);
    set.ultimo = Math.max(set.ultimo, objeto.lastModified?.getTime() ?? now.getTime());
    sets.set(id, set);
  }

  let borrados = 0;
  for (const set of sets.values()) {
    if (set.ultimo >= limite) continue;
    // El manifiesto primero: si el borrado se corta a mitad, lo que queda es
    // un set sin manifiesto, que `restore` ya rechaza por incompleto.
    const orden = [
      ...set.keys.filter((key) => key.endsWith(`/${MANIFIESTO_SET}`)),
      ...set.keys.filter((key) => !key.endsWith(`/${MANIFIESTO_SET}`)),
    ];
    for (const key of orden) await cliente.delete(key);
    borrados += 1;
  }
  return borrados;
}

export type BackupResult = {
  /** El nombre del set (no sale en la respuesta HTTP: ver la ruta del cron). */
  setId: string;
  bytes: number;
  tables: number;
  rows: number;
  pruned: number;
};

/** ¿Esta tienda puede sacar copias automáticas? Sin R2, no. */
export function backupsEnabled(): boolean {
  return r2Configurado();
}

/** El backup completo: dump en un set → manifiesto → retención. */
export async function runBackup(
  options: { now?: Date; cliente?: ClienteR2; executor?: Executor } = {}
): Promise<BackupResult> {
  if (!options.cliente && !backupsEnabled()) {
    throw new Error("R2 no está configurado: no hay dónde guardar la copia");
  }
  const cliente = options.cliente ?? clienteR2();

  const setId = backupSetId(options.now);
  const prefijo = `${PREFIJO_BACKUPS}${setId}/`;
  const { manifest, bytes } = await dumpSet(async (nombre, contenido, contentType) => {
    await cliente.put(`${prefijo}${nombre}`, contenido, {
      contentType,
      cacheControl: "private, no-store",
      soloSiNoExiste: true,
    });
  }, options.executor);

  // La retención va **después** de subir la de hoy, y su fallo no invalida el
  // backup: se prefiere un set de más que una corrida marcada como fallida
  // cuando la copia de hoy ya está guardada.
  let pruned = 0;
  try {
    pruned = await pruneBackups(cliente, RETAIN_DAYS, options.now);
  } catch (error) {
    log.warn("no se pudieron borrar los backups viejos", {
      error: safeError(error).message,
    });
  }

  return {
    setId,
    bytes,
    tables: manifest.objects.length,
    rows: manifest.rows,
    pruned,
  };
}

/**
 * La clave por la que se pagina cada tabla. `null` = traerla entera.
 *
 * Escrita a mano y no derivada del schema a propósito: es la decisión de "esta
 * tabla es chica y se puede traer de una", y esa decisión tiene que ser
 * explícita. El test de cobertura verifica que estén **todas** las de
 * `BACKUP_TABLES`.
 */
export const PRIMARY_KEY: Record<BackupTable, string | null> = {
  notification_outbox: "id",
  operation_keys: "id",
  counters: null,
  setup_state: null,
  job_runs: null,
  bank_details: null,
  store_settings: null,
  integration_settings: null,
  users: "id",
  customers: "id",
  categories: "id",
  coupons: "id",
  shipping_zones: "id",
  shipping_methods: "id",
  payment_events: "id",
  login_tokens: "id",
  products: "id",
  product_slug_redirects: "slug",
  product_images: "id",
  variants: "id",
  supplier_offers: "id",
  stock_alerts: "id",
  price_adjustments: "id",
  stock_adjustments: "id",
  orders: "id",
  order_items: "id",
  order_events: "id",
  order_notes: "id",
  product_reviews: "id",
  order_returns: "id",
  order_return_items: "id",
  payments: "id",
  refunds: "id",
  receipts: "id",
  stock_reservations: "id",
};

/**
 * El cursor de la paginación, escapado.
 *
 * Es lo único que se interpola en el SQL, y viene de una fila que **acaba de
 * salir de esta misma base**, no de un usuario. Aun así se escapa: un id
 * numérico se valida como número y una PK de texto va entre comillas con las
 * comillas escapadas. Una interpolación sin escapar en un archivo que arma SQL
 * a mano es exactamente el tipo de cosa que después nadie vuelve a mirar.
 */
function escapar(valor: number | string): string {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor))
      throw new Error("cursor de paginación inválido");
    return String(valor);
  }
  return `'${valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** mysql2 devuelve `[rows, fields]`; drizzle a veces pasa las filas peladas. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Array.isArray(candidate)
    ? (candidate as Array<Record<string, unknown>>)
    : [];
}
