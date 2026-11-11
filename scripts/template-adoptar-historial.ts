import "../src/lib/load-env";

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { constants as zlib, gunzipSync } from "node:zlib";

import mysql from "mysql2/promise";

import {
  JOURNAL_PATH,
  leerJournal,
  type JournalEntry,
} from "./template-migrations";
import { envSinGit } from "./ci/entorno-sin-git.mjs";

/**
 * git sobre el repo de `cwd`, sin las variables `GIT_*` del proceso: corrido
 * desde un hook (que exporta `GIT_DIR`), `-C` no alcanza y git escribiría en
 * otro repo.
 */
export function gitEn(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: envSinGit(),
  });
}

function remotoExiste(cwd: string, remoto: string): boolean {
  try {
    gitEn(cwd, ["remote", "get-url", remoto]);
    return true;
  } catch {
    return false;
  }
}

/**
 * `pnpm template:adoptar-historial` — una tienda adopta la historia de
 * migraciones del template sin tocar sus datos (review F13, plan §5.6).
 *
 * El caso: la tienda portó a mano un arreglo del template con `pnpm
 * db:generate` y quedó con migraciones propias bajo números que el template
 * también usa (mascota `0011_tiny_may_parker`, lenceria `0017_bent_robin_chapel`).
 * Ya corrieron en producción, así que no se pueden sacar y regenerar (caso 1
 * de NEW-STORE.md), y `template:sync` se frena en la guardia, con razón.
 *
 * Qué hace, mirando el **esquema real** de la base (`information_schema`) y
 * los snapshots de drizzle de los dos lados:
 *
 * - por cada migración del template que la tienda no tiene, decide si su
 *   efecto ya está en la base (se marca aplicada), si no está (queda
 *   pendiente para `pnpm db:migrate`) o si está con otra definición (se
 *   niega y muestra la diferencia). Como drizzle aplica sólo lo posterior a
 *   la última fila, lo aplicado tiene que ser un prefijo: busca cuántas
 *   migraciones del template explican exactamente la base;
 * - lo que la tienda tiene y el template no (columnas, tablas, índices
 *   propios) va a **una** migración nueva de la tienda, numerada después de
 *   la última del template, con SQL que no hace nada donde el objeto ya
 *   existe (en esta base) y lo crea en una base nueva;
 * - con `--aplicar`, reemplaza `drizzle/` por el del template más esa
 *   migración y reescribe `__drizzle_migrations` en una transacción. Si algo
 *   falla en el medio, vuelve todo como estaba. Correrlo otra vez no hace nada.
 *
 * Nunca corre DDL sobre la base: sólo lee el esquema y reescribe las filas de
 * `__drizzle_migrations`. Las pendientes las aplica `pnpm db:migrate` después.
 *
 *   pnpm template:adoptar-historial                 # ensayo: qué haría, no escribe nada
 *   pnpm template:adoptar-historial --aplicar       # lo hace (pide backup de la última hora)
 *   pnpm template:adoptar-historial --hasta <sha>   # contra ese commit del template
 *   pnpm template:adoptar-historial --backup <archivo.sql.gz>
 *
 * Una tienda que todavía no tiene el script lo corre desde un checkout del
 * template, parada en la tienda (NEW-STORE.md § "Migraciones propias de una
 * tienda"). Por eso acá no hay imports `@/`: resolverían al `src/` de la tienda.
 */

// ---------------------------------------------------------------------------
// Historias: el journal, el SQL y los snapshots de cada lado
// ---------------------------------------------------------------------------

type SnapColumna = {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  autoincrement?: boolean;
  default?: unknown;
  onUpdate?: boolean;
};
type SnapIndice = { name: string; columns: string[]; isUnique?: boolean };
type SnapFk = {
  name: string;
  tableFrom: string;
  tableTo: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete?: string;
  onUpdate?: string;
};
type SnapTabla = {
  name: string;
  columns: Record<string, SnapColumna>;
  indexes?: Record<string, SnapIndice>;
  foreignKeys?: Record<string, SnapFk>;
  compositePrimaryKeys?: Record<string, { name: string; columns: string[] }>;
  uniqueConstraints?: Record<string, { name: string; columns: string[] }>;
  checkConstraint?: Record<string, { name: string; value?: string }>;
};
export type Snapshot = {
  id: string;
  prevId: string;
  tables: Record<string, SnapTabla>;
  [clave: string]: unknown;
};

export type Migracion = {
  entrada: JournalEntry;
  /** El `.sql` tal cual: su sha256 es el hash que guarda drizzle. */
  sql: string;
  hash: string;
  snapshot: Snapshot | null;
};

export type Historia = {
  /** Contenido de `_journal.json`. */
  journal: string;
  migraciones: Migracion[];
};

/** El hash que drizzle guarda en `__drizzle_migrations` (`readMigrationFiles`). */
export function hashDeMigracion(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function pad(idx: number): string {
  return String(idx).padStart(4, "0");
}

function armarHistoria(
  journal: string | null,
  leer: (ruta: string) => string | null,
  origen: string
): Historia {
  if (journal === null) throw new Error(`${origen}: no hay ${JOURNAL_PATH}`);
  const leido = leerJournal(journal);
  if ("error" in leido) {
    throw new Error(`${origen}: el journal ${leido.error}`);
  }
  const migraciones = leido.entradas.map((entrada) => {
    const sql = leer(`drizzle/${entrada.tag}.sql`);
    if (sql === null) {
      throw new Error(`${origen}: falta drizzle/${entrada.tag}.sql`);
    }
    const snap = leer(`drizzle/meta/${pad(entrada.idx)}_snapshot.json`);
    return {
      entrada,
      sql,
      hash: hashDeMigracion(sql),
      snapshot: snap === null ? null : (JSON.parse(snap) as Snapshot),
    };
  });
  return { journal, migraciones };
}

/**
 * La historia del working tree (`drizzle/` de la tienda, como la deployó).
 * `carpeta`: otra carpeta con la forma de `drizzle/` (la copia de una
 * adopción cortada).
 */
export function historiaDeCarpeta(cwd: string, carpeta: string = join(cwd, "drizzle")): Historia {
  const leer = (ruta: string) => {
    const completa = join(carpeta, ...ruta.split("/").slice(1));
    return existsSync(completa) ? readFileSync(completa, "utf8") : null;
  };
  return armarHistoria(leer(JOURNAL_PATH), leer, "la tienda");
}

/** La historia de un commit (el template), leída de git sin tocar el working tree. */
export function historiaDeGit(cwd: string, ref: string): Historia {
  const blobs = new Map<string, string>();
  const salida = gitEn(cwd, ["ls-tree", "-r", "-z", "--full-tree", ref, "--", "drizzle"]);
  for (const linea of salida.split("\0")) {
    if (linea === "") continue;
    const tab = linea.indexOf("\t");
    const [, tipo, blob] = linea.slice(0, tab).split(" ");
    if (tipo === "blob" && blob) blobs.set(linea.slice(tab + 1), blob);
  }
  const leer = (ruta: string) => {
    const blob = blobs.get(ruta);
    return blob ? gitEn(cwd, ["cat-file", "blob", blob]) : null;
  };
  return armarHistoria(leer(JOURNAL_PATH), leer, `el template (${ref})`);
}

// ---------------------------------------------------------------------------
// El esquema como un mapa clave → definición, igual para drizzle y para MySQL
// ---------------------------------------------------------------------------

/**
 * Cada objeto del esquema con una definición normalizada, comparable por
 * igualdad: `columna orders.tracking_code` → `varchar(120)`, `índice
 * orders.orders_status_idx` → `(status)`, etc. La misma clave sale de un
 * snapshot de drizzle y de `information_schema`, así que comparar el
 * esquema real con "el template después de la migración N" es comparar dos
 * mapas.
 */
export type Esquema = Map<string, string>;

export type Motor = "mysql" | "mariadb";

const TIPOS_ENTEROS = /^(tinyint|smallint|mediumint|int|integer|bigint)\((\d+)\)/;

/**
 * `boolean` = `tinyint(1)`; sin el ancho de los enteros (MySQL 8 no lo muestra, MariaDB sí).
 *
 * MariaDB no tiene un tipo `json`: guarda la columna como `longtext` y le
 * agrega un CHECK `json_valid(col)`. Sólo ese par es `json`
 * (`validadoComoJson`, lo decide `esquemaDeFilas` con el CHECK de la base);
 * un `longtext` sin ese CHECK es un `longtext` de verdad y no se confunde.
 */
export function normalizarTipo(tipo: string, motor: Motor = "mysql", validadoComoJson = false): string {
  const crudo = tipo.trim().replace(/\s+/g, " ");
  const enumOSet = /^(enum|set)\(/i.exec(crudo);
  if (enumOSet) return enumOSet[1]!.toLowerCase() + crudo.slice(enumOSet[1]!.length);
  let t = crudo.toLowerCase();
  if (t === "boolean" || t === "bool") return "tinyint(1)";
  if (t === "serial") return "bigint unsigned";
  t = t.replace(TIPOS_ENTEROS, (completo, base: string, ancho: string) =>
    base === "tinyint" && ancho === "1" ? completo : base
  );
  if (t.startsWith("integer")) t = "int" + t.slice("integer".length);
  // Un `longtext` con CHECK json_valid() hecho a mano es indistinguible de un
  // `json` (en MariaDB son la misma cosa, y se comportan igual): se lee `json`.
  if (motor === "mariadb" && t === "longtext" && validadoComoJson) return "json";
  return t;
}

function normalizarExpresion(expresion: string): string {
  let e = expresion.trim().toLowerCase().replace(/\s+/g, "");
  while (e.startsWith("(") && e.endsWith(")")) e = e.slice(1, -1);
  const ahora = /^(now|current_timestamp|localtimestamp)(\((\d*)\))?$/.exec(e);
  if (ahora) return ahora[3] ? `CURRENT_TIMESTAMP(${ahora[3]})` : "CURRENT_TIMESTAMP";
  return `(${e})`;
}

function literal(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

/**
 * El default como texto comparable: literales siempre entre comillas
 * (`'0'`, `'pending'`), expresiones sin ellas (`CURRENT_TIMESTAMP`,
 * `(json_array())`), `null` si no hay.
 */
export function normalizarDefault(
  valor: unknown,
  origen: "drizzle" | Motor,
  generado = false
): string | null {
  if (valor === undefined || valor === null) return null;
  if (origen === "drizzle") {
    if (typeof valor === "boolean") return literal(valor ? "1" : "0");
    if (typeof valor === "number" || typeof valor === "bigint") return literal(String(valor));
    const s = String(valor).trim();
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return literal(s.slice(1, -1).replace(/''/g, "'"));
    if (/^-?\d+(\.\d+)?$/.test(s)) return literal(s);
    if (s === "true" || s === "false") return literal(s === "true" ? "1" : "0");
    return normalizarExpresion(s);
  }
  const s = String(valor);
  if (origen === "mariadb") {
    // Desde 10.2.7 MariaDB escribe `column_default` como SQL: `NULL` sin
    // comillas es "sin default" (o DEFAULT NULL, que es lo mismo), un texto
    // viene entre comillas (`'NULL'` es el texto NULL), un número sin ellas y
    // una expresión tal cual (`current_timestamp()`). Antes de 10.2.7 el
    // texto NULL y la falta de default no se distinguen: `motorDeVersion`
    // se niega a leer esas versiones.
    if (s === "NULL") return null;
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return literal(s.slice(1, -1).replace(/''/g, "'"));
    if (/^-?\d+(\.\d+)?$/.test(s)) return literal(s);
    return normalizarExpresion(s);
  }
  // MySQL 8: un default con expresión trae DEFAULT_GENERATED en `extra`;
  // `CURRENT_TIMESTAMP` sin paréntesis también, pero por las dudas.
  if (generado || /^(now\(|current_timestamp)/i.test(s)) return normalizarExpresion(s);
  return literal(s);
}

export function definicionDeColumna(c: {
  tipo: string;
  notNull: boolean;
  porDefecto: string | null;
  autoincrement: boolean;
  onUpdate: boolean;
}): string {
  return (
    c.tipo +
    (c.notNull ? " NOT NULL" : "") +
    (c.porDefecto !== null ? ` DEFAULT ${c.porDefecto}` : "") +
    (c.autoincrement ? " AUTO_INCREMENT" : "") +
    (c.onUpdate ? " ON UPDATE CURRENT_TIMESTAMP" : "")
  );
}

function regla(valor: string | undefined | null): string {
  const r = (valor ?? "no action").toLowerCase();
  // En InnoDB son lo mismo, y cada motor reporta el que se le ocurre.
  return r === "restrict" ? "no action" : r;
}

function definicionDeFk(f: {
  columnas: string[];
  tabla: string;
  referidas: string[];
  onDelete?: string | null;
  onUpdate?: string | null;
}): string {
  return `(${f.columnas.join(", ")}) → ${f.tabla}(${f.referidas.join(", ")}) ON DELETE ${regla(f.onDelete)} ON UPDATE ${regla(f.onUpdate)}`;
}

export const claves = {
  tabla: (t: string) => `tabla ${t}`,
  columna: (t: string, c: string) => `columna ${t}.${c}`,
  pk: (t: string) => `clave primaria ${t}`,
  indice: (t: string, i: string) => `índice ${t}.${i}`,
  fk: (t: string, f: string) => `clave foránea ${t}.${f}`,
  check: (t: string, c: string) => `check ${t}.${c}`,
};

export function esquemaDeSnapshot(snapshot: Snapshot | null): Esquema {
  const esquema: Esquema = new Map();
  if (!snapshot) return esquema;
  for (const tabla of Object.values(snapshot.tables)) {
    const t = tabla.name;
    esquema.set(claves.tabla(t), "existe");
    const pk: string[] = [];
    const compuesta = Object.values(tabla.compositePrimaryKeys ?? {})[0];
    // MySQL fuerza NOT NULL en toda columna de la clave primaria.
    const enPk = new Set(compuesta?.columns ?? []);
    for (const columna of Object.values(tabla.columns)) {
      if (columna.primaryKey) pk.push(columna.name);
      esquema.set(
        claves.columna(t, columna.name),
        definicionDeColumna({
          tipo: normalizarTipo(columna.type),
          notNull: Boolean(
            columna.notNull || columna.primaryKey || enPk.has(columna.name) || columna.type === "serial"
          ),
          porDefecto: normalizarDefault(columna.default, "drizzle"),
          autoincrement: Boolean(columna.autoincrement || columna.type === "serial"),
          onUpdate: Boolean(columna.onUpdate),
        })
      );
    }
    const columnasPk = compuesta ? compuesta.columns : pk;
    if (columnasPk.length > 0) esquema.set(claves.pk(t), `(${columnasPk.join(", ")})`);
    for (const indice of Object.values(tabla.indexes ?? {})) {
      esquema.set(
        claves.indice(t, indice.name),
        `${indice.isUnique ? "UNIQUE " : ""}(${indice.columns.join(", ")})`
      );
    }
    for (const unico of Object.values(tabla.uniqueConstraints ?? {})) {
      esquema.set(claves.indice(t, unico.name), `UNIQUE (${unico.columns.join(", ")})`);
    }
    for (const fk of Object.values(tabla.foreignKeys ?? {})) {
      esquema.set(
        claves.fk(t, fk.name),
        definicionDeFk({
          columnas: fk.columnsFrom,
          tabla: fk.tableTo,
          referidas: fk.columnsTo,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        })
      );
    }
    for (const check of Object.values(tabla.checkConstraint ?? {})) {
      esquema.set(claves.check(t, check.name), "existe");
    }
  }
  return esquema;
}

type Consultable = {
  query: (sql: string, valores?: unknown[]) => Promise<unknown>;
};

async function filas<T>(con: Consultable, sql: string, valores?: unknown[]): Promise<T[]> {
  const [resultado] = (await con.query(sql, valores)) as [T[], unknown];
  return resultado;
}

/**
 * El motor sale de `SELECT VERSION()`, nunca de cómo se ven los valores:
 * `8.4.11` → mysql, `10.11.10-MariaDB-ubu2204` / `10.6.21-MariaDB-log` →
 * mariadb. Un MariaDB anterior a 10.2.7 escribe `column_default` sin
 * comillas, y ahí un default de texto `'NULL'` y "sin default" se leen igual:
 * no se puede decidir sin riesgo, así que se niega (igual que una versión de
 * MariaDB que no se entiende).
 */
export function motorDeVersion(version: string): Motor {
  if (!/mariadb/i.test(version)) return "mysql";
  const v = /(\d+)\.(\d+)\.(\d+)-mariadb/i.exec(version);
  const numero = v ? [Number(v[1]), Number(v[2]), Number(v[3])] : null;
  const viejo = (n: number[]) => n[0]! < 10 || (n[0] === 10 && (n[1]! < 2 || (n[1] === 2 && n[2]! < 7)));
  if (!numero || viejo(numero)) {
    throw new Error(
      `MariaDB ${version}: antes de 10.2.7 information_schema no distingue un default de texto 'NULL' de una columna sin default, y no adopto sobre una lectura dudosa. Actualizá MariaDB (Hostinger usa 10.6+).`
    );
  }
  return "mariadb";
}

export async function motorDe(con: Consultable): Promise<Motor> {
  const [fila] = await filas<{ v: string }>(con, "SELECT VERSION() AS v");
  return motorDeVersion(String(fila?.v ?? ""));
}

/** Las filas de `information_schema` que hacen falta, tal cual las devuelve el motor. */
export type FilasDeEsquema = {
  tablas: { t: string }[];
  columnas: { t: string; c: string; tipo: string; nulo: string; def: string | null; extra: string | null }[];
  indices: { t: string; i: string; nu: number | string; c: string | null; s: number; ty: string }[];
  reglas: { t: string; n: string; rt: string; ur: string; dr: string }[];
  columnasFk: { t: string; n: string; c: string; rc: string }[];
  checks: { t: string; n: string }[];
  /** Sólo MariaDB (`check_constraints` con `table_name`): de acá sale qué `longtext` es `json`. */
  clausulas: { t: string; n: string; cl: string | null }[];
};

export async function leerFilasDeEsquema(con: Consultable, motor: Motor): Promise<FilasDeEsquema> {
  return {
    tablas: await filas(
      con,
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
    ),
    columnas: await filas(
      con,
      `SELECT table_name AS t, column_name AS c, column_type AS tipo, is_nullable AS nulo,
              column_default AS def, extra AS extra
         FROM information_schema.columns WHERE table_schema = DATABASE()`
    ),
    indices: await filas(
      con,
      `SELECT table_name AS t, index_name AS i, non_unique AS nu, column_name AS c,
              seq_in_index AS s, index_type AS ty
         FROM information_schema.statistics WHERE table_schema = DATABASE()
        ORDER BY table_name, index_name, seq_in_index`
    ),
    reglas: await filas(
      con,
      `SELECT table_name AS t, constraint_name AS n, referenced_table_name AS rt,
              update_rule AS ur, delete_rule AS dr
         FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE()`
    ),
    columnasFk: await filas(
      con,
      `SELECT table_name AS t, constraint_name AS n, column_name AS c, referenced_column_name AS rc
         FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
        ORDER BY table_name, constraint_name, ordinal_position`
    ),
    checks: await filas(
      con,
      `SELECT table_name AS t, constraint_name AS n FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND constraint_type = 'CHECK'`
    ),
    clausulas:
      motor === "mariadb"
        ? await filas(
            con,
            `SELECT table_name AS t, constraint_name AS n, check_clause AS cl
               FROM information_schema.check_constraints WHERE constraint_schema = DATABASE()`
          )
        : [],
  };
}

/** `json_valid(\`payload\`)` → `json_valid(payload)`, para comparar. */
function clausulaNormalizada(clausula: string): string {
  let e = clausula.toLowerCase().replace(/[`\s]/g, "");
  while (e.startsWith("(") && e.endsWith(")")) e = e.slice(1, -1);
  return e;
}

/**
 * Las filas de `information_schema` como un `Esquema`, con las mismas claves
 * que un snapshot. Pura: los tests le pasan filas con la forma exacta de
 * MySQL 8 y de MariaDB.
 */
export function esquemaDeFilas(f: FilasDeEsquema, motor: Motor): Esquema {
  const esquema: Esquema = new Map();
  const propias = new Set(f.tablas.map((fila) => fila.t).filter((t) => t !== "__drizzle_migrations"));
  for (const t of propias) esquema.set(claves.tabla(t), "existe");

  // MariaDB: el CHECK que agrega a una columna `json` se llama como la
  // columna y dice `json_valid(col)`. Ese CHECK es parte del tipo, no un
  // check de la tienda: no va como `check t.col`.
  const columnasJson = new Set<string>();
  const checksDeJson = new Set<string>();
  if (motor === "mariadb") {
    const longtext = new Set(
      f.columnas
        .filter((col) => String(col.tipo).trim().toLowerCase() === "longtext")
        .map((col) => `${col.t}\0${col.c.toLowerCase()}`)
    );
    for (const cl of f.clausulas) {
      const m = /^json_valid\(([^(),]+)\)$/.exec(clausulaNormalizada(String(cl.cl ?? "")));
      if (!m || !longtext.has(`${cl.t}\0${m[1]}`)) continue;
      columnasJson.add(`${cl.t}\0${m[1]}`);
      if (cl.n.toLowerCase() === m[1]) checksDeJson.add(`${cl.t}\0${m[1]}`);
    }
  }

  for (const col of f.columnas) {
    if (!propias.has(col.t)) continue;
    const extra = (col.extra ?? "").toLowerCase();
    esquema.set(
      claves.columna(col.t, col.c),
      definicionDeColumna({
        tipo: normalizarTipo(String(col.tipo), motor, columnasJson.has(`${col.t}\0${col.c.toLowerCase()}`)),
        notNull: col.nulo === "NO",
        porDefecto: normalizarDefault(col.def, motor, extra.includes("default_generated")),
        autoincrement: extra.includes("auto_increment"),
        onUpdate: /on update (current_timestamp|now)/.test(extra),
      })
    );
  }

  const porIndice = new Map<string, { t: string; i: string; unico: boolean; tipo: string; columnas: string[] }>();
  for (const fila of f.indices) {
    if (!propias.has(fila.t)) continue;
    const clave = `${fila.t}\0${fila.i}`;
    const actual =
      porIndice.get(clave) ??
      { t: fila.t, i: fila.i, unico: Number(fila.nu) === 0, tipo: String(fila.ty), columnas: [] };
    actual.columnas.push(fila.c ?? "(expresión)");
    porIndice.set(clave, actual);
  }
  for (const ind of porIndice.values()) {
    if (ind.i === "PRIMARY") {
      esquema.set(claves.pk(ind.t), `(${ind.columnas.join(", ")})`);
      continue;
    }
    const tipo = ind.tipo.toUpperCase() === "BTREE" ? "" : `${ind.tipo.toUpperCase()} `;
    esquema.set(
      claves.indice(ind.t, ind.i),
      `${tipo}${ind.unico ? "UNIQUE " : ""}(${ind.columnas.join(", ")})`
    );
  }

  for (const r of f.reglas) {
    if (!propias.has(r.t)) continue;
    const cols = f.columnasFk.filter((c) => c.t === r.t && c.n === r.n);
    esquema.set(
      claves.fk(r.t, r.n),
      definicionDeFk({
        columnas: cols.map((c) => c.c),
        tabla: r.rt,
        referidas: cols.map((c) => c.rc),
        onDelete: r.dr,
        onUpdate: r.ur,
      })
    );
  }

  for (const c of f.checks) {
    if (propias.has(c.t) && !checksDeJson.has(`${c.t}\0${c.n.toLowerCase()}`)) {
      esquema.set(claves.check(c.t, c.n), "existe");
    }
  }
  return esquema;
}

/** El esquema real de la base de la conexión, con las mismas claves que un snapshot. */
export async function esquemaVivo(con: Consultable, motor: Motor): Promise<Esquema> {
  return esquemaDeFilas(await leerFilasDeEsquema(con, motor), motor);
}

// ---------------------------------------------------------------------------
// La decisión: pura, para poder probarla sola
// ---------------------------------------------------------------------------

export type Fila = { id: number; hash: string; createdAt: number };
export type FilaNueva = { hash: string; createdAt: number; tag: string };

export type EstadoMigracion = {
  tag: string;
  estado: "aplicada" | "pendiente";
  /** Sentencias que no son de esquema (UPDATE, INSERT…): marcada aplicada, no van a correr acá. */
  datos: string[];
};

export type ObjetoPropio = { clave: string; definicion: string };

export type Plan = {
  estado: "plan";
  /** Migraciones que la tienda y el template comparten, idénticas. */
  comun: number;
  /** Las migraciones de la tienda que se reemplazan (sus filas salen). */
  reemplazadas: string[];
  template: EstadoMigracion[];
  propios: ObjetoPropio[];
  /** Objetos que la base tiene y ningún snapshot conoce (extras, índices de FK). */
  fueraDeDrizzle: string[];
  filas: FilaNueva[];
  nueva: { entrada: JournalEntry; sql: string; snapshot: Snapshot } | null;
  avisos: string[];
};

export type Rechazo = { estado: "rechazo"; motivos: string[] };

export type YaAdoptada = {
  estado: "ya-adoptada";
  comun: number;
  propias: string[];
  pendientes: string[];
  ajenas: number;
};

export type Decision = Plan | Rechazo | YaAdoptada;

function misma(a: Migracion, b: Migracion): boolean {
  return a.entrada.tag === b.entrada.tag && a.entrada.when === b.entrada.when && a.hash === b.hash;
}

function prefijoComun(a: Historia, b: Historia): number {
  let n = 0;
  while (n < a.migraciones.length && n < b.migraciones.length && misma(a.migraciones[n]!, b.migraciones[n]!)) n += 1;
  return n;
}

/** ¿Las filas aplicadas son exactamente las de esta historia? (como `compareMigrations`) */
export function estadoDeFilas(
  filasAplicadas: readonly Fila[],
  historia: Historia
): { pendientes: string[]; ajenas: number } {
  const porHash = new Map(historia.migraciones.map((m) => [m.hash, m]));
  const aplicados = new Set(filasAplicadas.map((f) => f.hash));
  return {
    pendientes: historia.migraciones.filter((m) => !aplicados.has(m.hash)).map((m) => m.entrada.tag),
    ajenas: filasAplicadas.filter((f) => porHash.get(f.hash)?.entrada.when !== f.createdAt).length,
  };
}

const SENTENCIA_DE_DATOS = /^\s*(insert|update|delete|replace)\b/i;

export function sentenciasDeDatos(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => SENTENCIA_DE_DATOS.test(s));
}

function mostrar(valor: string | undefined): string {
  return valor === undefined ? "no existe" : valor === "existe" ? "existe" : `\`${valor}\``;
}

function clavesCambiadas(antes: Esquema, despues: Esquema): string[] {
  const todas = new Set([...antes.keys(), ...despues.keys()]);
  return [...todas].filter((clave) => antes.get(clave) !== despues.get(clave));
}

export function planificarAdopcion(entrada: {
  tienda: Historia;
  template: Historia;
  filas: readonly Fila[];
  vivo: Esquema;
}): Omit<Plan, "nueva"> | Rechazo | YaAdoptada {
  const { tienda, template, filas: aplicadas, vivo } = entrada;
  const P = prefijoComun(tienda, template);
  const T = template.migraciones.length;

  // 0. Ya tiene toda la historia del template (adoptada, o al día): nada que hacer.
  if (P === T) {
    const estado = estadoDeFilas(aplicadas, tienda);
    return {
      estado: "ya-adoptada",
      comun: P,
      propias: tienda.migraciones.slice(P).map((m) => m.entrada.tag),
      pendientes: estado.pendientes,
      ajenas: estado.ajenas,
    };
  }
  if (tienda.migraciones.length === 0) {
    return { estado: "rechazo", motivos: ["La tienda no tiene migraciones: no hay historia que adoptar (sincronizá directo)."] };
  }

  // 1. La base tiene que tener exactamente las migraciones de la tienda.
  const estado = estadoDeFilas(aplicadas, tienda);
  if (estado.pendientes.length > 0 || estado.ajenas > 0) {
    return {
      estado: "rechazo",
      motivos: [
        "La base no tiene exactamente las migraciones de drizzle/ de la tienda" +
          (estado.pendientes.length ? ` (pendientes: ${estado.pendientes.join(", ")})` : "") +
          (estado.ajenas ? ` (${estado.ajenas} fila(s) que no son de este journal)` : "") +
          ". Adoptar parte de lo que la tienda aplicó: primero `pnpm db:migrate` con el drizzle/ de la tienda, o revisá a mano la historia (`pnpm db:check`).",
      ],
    };
  }

  const ultimaTienda = tienda.migraciones.at(-1)!;
  if (!ultimaTienda.snapshot) {
    return {
      estado: "rechazo",
      motivos: [`Falta el snapshot de la última migración de la tienda (drizzle/meta/${pad(ultimaTienda.entrada.idx)}_snapshot.json).`],
    };
  }
  for (let i = Math.max(P - 1, 0); i < T; i += 1) {
    if (!template.migraciones[i]!.snapshot) {
      return {
        estado: "rechazo",
        motivos: [`Al template le falta el snapshot de ${template.migraciones[i]!.entrada.tag}: no puedo saber qué hace.`],
      };
    }
  }

  // 2. La base es la que dice drizzle/ de la tienda.
  const S = esquemaDeSnapshot(ultimaTienda.snapshot);
  const distintasDeLaTienda = [...S.entries()]
    .filter(([clave, def]) => vivo.get(clave) !== def)
    .map(([clave, def]) => `  - ${clave}: drizzle/ de la tienda dice ${mostrar(def)}, la base tiene ${mostrar(vivo.get(clave))}`);
  if (distintasDeLaTienda.length > 0) {
    return {
      estado: "rechazo",
      motivos: [
        "El esquema de la base no es el que describe drizzle/ de la tienda (¿un cambio hecho a mano en el hPanel?). No adopto sobre algo que no sé qué es:\n" +
          distintasDeLaTienda.join("\n"),
      ],
    };
  }

  // 3. El template después de cada una de sus migraciones nuevas.
  const estados: Esquema[] = []; // estados[i] = esquema tras la migración i del template
  const tras = (i: number): Esquema =>
    i < 0 ? new Map() : (estados[i] ??= esquemaDeSnapshot(template.migraciones[i]!.snapshot));
  const base = tras(P - 1);
  const tocadas = new Set<string>();
  const cambios = new Map<number, string[]>();
  for (let i = P; i < T; i += 1) {
    const c = clavesCambiadas(tras(i - 1), tras(i));
    cambios.set(i, c);
    for (const clave of c) tocadas.add(clave);
  }

  // 4. Lo del template que la tienda cambió o borró por su cuenta (y que el
  //    template no vuelve a tocar): adoptarla lo dejaría distinto.
  const cambiadasPorLaTienda = [...base.entries()]
    .filter(([clave, def]) => !tocadas.has(clave) && S.get(clave) !== def)
    .map(([clave, def]) => `  - ${clave}: el template la tiene como ${mostrar(def)}, la tienda como ${mostrar(S.get(clave))}`);
  if (cambiadasPorLaTienda.length > 0) {
    return {
      estado: "rechazo",
      motivos: [
        "La tienda cambió objetos del template que el template no vuelve a tocar. Adoptar su historia dejaría a esta base distinta de la que describe:\n" +
          cambiadasPorLaTienda.join("\n"),
      ],
    };
  }

  // 5. ¿Cuántas migraciones del template explican la base? Tiene que ser un
  //    prefijo: drizzle sólo aplica lo posterior a la última fila.
  const diferencias = (k: number) =>
    [...tocadas].filter((clave) => vivo.get(clave) !== tras(k).get(clave)).sort();
  let elegida: number | null = null;
  let cercana = { k: P - 1, difs: diferencias(P - 1) };
  for (let k = P - 1; k < T; k += 1) {
    const difs = diferencias(k);
    if (difs.length === 0) {
      elegida = k;
      break;
    }
    if (difs.length < cercana.difs.length) cercana = { k, difs };
  }

  if (elegida === null) {
    const tagHasta = (k: number) => (k < 0 ? "ninguna" : template.migraciones[k]!.entrada.tag);
    const detalle = cercana.difs.map((clave) => {
      const quienes = [...cambios.entries()]
        .filter(([, c]) => c.includes(clave))
        .map(([i]) => `${template.migraciones[i]!.entrada.tag} la deja ${mostrar(tras(i).get(clave))}`);
      return `  - ${clave}: en la base ${mostrar(vivo.get(clave))}; tras ${tagHasta(cercana.k)} sería ${mostrar(tras(cercana.k).get(clave))}${quienes.length ? ` (${quienes.join("; ")})` : ""}`;
    });
    const resumen = [...cambios.entries()].map(([i, c]) => {
      const antes = tras(i - 1);
      const despues = tras(i);
      const hechas = c.filter((clave) => vivo.get(clave) === despues.get(clave)).length;
      const faltan = c.filter((clave) => vivo.get(clave) === antes.get(clave)).length;
      const otras = c.length - hechas - faltan;
      const estadoMig =
        c.length === 0
          ? "sin cambios de esquema"
          : hechas === c.length
            ? "ya está"
            : faltan === c.length
              ? "no está"
              : `a medias: ${hechas} de ${c.length} cambios ya están${otras ? `, ${otras} con otra definición` : ""}`;
      return `  ${template.migraciones[i]!.entrada.tag}: ${estadoMig}`;
    });
    return {
      estado: "rechazo",
      motivos: [
        `Ninguna cantidad de migraciones del template explica el esquema de esta base: está con otra definición, o tiene parte de una migración del template sin las anteriores (drizzle sólo aplica lo posterior a la última aplicada). Lo más cercano es "aplicadas hasta ${tagHasta(cercana.k)}", con ${cercana.difs.length} diferencia(s):\n` +
          detalle.join("\n"),
        "Migración por migración del template, contra la base:\n" + resumen.join("\n"),
      ],
    };
  }

  // 6. Lo que es sólo de la tienda: va a una migración propia nueva.
  const final = tras(T - 1);
  const propios = [...S.entries()]
    .filter(([clave]) => !base.has(clave) && !tocadas.has(clave))
    .map(([clave, definicion]) => ({ clave, definicion }))
    .sort((a, b) => a.clave.localeCompare(b.clave));
  const conocidas = new Set([...final.keys(), ...S.keys(), ...tocadas]);
  const fueraDeDrizzle = [...vivo.keys()].filter((clave) => !conocidas.has(clave)).sort();

  const plantilla: EstadoMigracion[] = template.migraciones.slice(P).map((m, j) => ({
    tag: m.entrada.tag,
    estado: P + j <= elegida! ? "aplicada" : "pendiente",
    datos: P + j <= elegida! ? sentenciasDeDatos(m.sql) : [],
  }));
  const avisos = plantilla
    .filter((m) => m.datos.length > 0)
    .map(
      (m) =>
        `${m.tag} se marca aplicada pero tiene SQL de datos que acá no va a correr (un port con db:generate sólo trae el esquema, así que probablemente nunca corrió). Revisalo y, si hace falta, correlo a mano:\n` +
        m.datos.map((s) => `      ${s.replace(/\s+/g, " ")}`).join("\n")
    );

  return {
    estado: "plan",
    comun: P,
    reemplazadas: tienda.migraciones.slice(P).map((m) => m.entrada.tag),
    template: plantilla,
    propios,
    fueraDeDrizzle,
    filas: template.migraciones
      .slice(0, elegida + 1)
      .map((m) => ({ hash: m.hash, createdAt: m.entrada.when, tag: m.entrada.tag })),
    avisos,
  };
}

// ---------------------------------------------------------------------------
// La migración propia: snapshot del template + lo de la tienda, y SQL que no
// hace nada donde ya existe
// ---------------------------------------------------------------------------

type Grupo = {
  clave: string;
  /** Cuenta filas de information_schema: 0 = hay que crearlo. */
  existe: string;
  agregar: (snap: Snapshot) => void;
};

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function sqlLiteral(valor: string): string {
  return `'${valor.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Los objetos propios, en unidades que drizzle-kit escribe con una sentencia cada una. */
export function gruposPropios(propios: readonly ObjetoPropio[], tienda: Snapshot): Grupo[] {
  const pendientes = new Set(propios.map((p) => p.clave));
  const grupos: Grupo[] = [];
  const tablas = Object.values(tienda.tables);
  const q = (s: string) => sqlLiteral(s);

  for (const tabla of tablas) {
    const t = tabla.name;
    if (!pendientes.has(claves.tabla(t))) continue;
    // La tabla entera en un CREATE TABLE (columnas, PK, únicos y checks van
    // adentro); sus índices y FKs, aparte.
    for (const c of Object.keys(tabla.columns)) pendientes.delete(claves.columna(t, tabla.columns[c]!.name));
    pendientes.delete(claves.tabla(t));
    pendientes.delete(claves.pk(t));
    for (const u of Object.values(tabla.uniqueConstraints ?? {})) pendientes.delete(claves.indice(t, u.name));
    for (const c of Object.values(tabla.checkConstraint ?? {})) pendientes.delete(claves.check(t, c.name));
    grupos.push({
      clave: claves.tabla(t),
      existe: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${q(t)}`,
      agregar: (snap) => {
        snap.tables[t] = { ...clonar(tabla), indexes: {}, foreignKeys: {} };
      },
    });
  }
  for (const tabla of tablas) {
    const t = tabla.name;
    for (const col of Object.values(tabla.columns)) {
      const clave = claves.columna(t, col.name);
      if (!pendientes.delete(clave)) continue;
      grupos.push({
        clave,
        existe: `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${q(t)} AND column_name = ${q(col.name)}`,
        agregar: (snap) => {
          snap.tables[t]!.columns[col.name] = clonar(col);
        },
      });
    }
  }
  for (const tabla of tablas) {
    const t = tabla.name;
    const indices: Array<[string, () => (snap: Snapshot) => void]> = [
      ...Object.values(tabla.indexes ?? {}).map(
        (i) => [i.name, () => (snap: Snapshot) => {
          (snap.tables[t]!.indexes ??= {})[i.name] = clonar(i);
        }] as [string, () => (snap: Snapshot) => void]
      ),
      ...Object.values(tabla.uniqueConstraints ?? {}).map(
        (u) => [u.name, () => (snap: Snapshot) => {
          (snap.tables[t]!.uniqueConstraints ??= {})[u.name] = clonar(u);
        }] as [string, () => (snap: Snapshot) => void]
      ),
    ];
    for (const [nombre, hacer] of indices) {
      const clave = claves.indice(t, nombre);
      if (!pendientes.delete(clave)) continue;
      grupos.push({
        clave,
        existe: `SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ${q(t)} AND index_name = ${q(nombre)}`,
        agregar: hacer(),
      });
    }
    for (const fk of Object.values(tabla.foreignKeys ?? {})) {
      const clave = claves.fk(t, fk.name);
      if (!pendientes.delete(clave)) continue;
      grupos.push({
        clave,
        existe: `SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ${q(t)} AND constraint_name = ${q(fk.name)} AND constraint_type = 'FOREIGN KEY'`,
        agregar: (snap) => {
          (snap.tables[t]!.foreignKeys ??= {})[fk.name] = clonar(fk);
        },
      });
    }
    for (const check of Object.values(tabla.checkConstraint ?? {})) {
      const clave = claves.check(t, check.name);
      if (!pendientes.delete(clave)) continue;
      grupos.push({
        clave,
        existe: `SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ${q(t)} AND constraint_name = ${q(check.name)} AND constraint_type = 'CHECK'`,
        agregar: (snap) => {
          (snap.tables[t]!.checkConstraint ??= {})[check.name] = clonar(check);
        },
      });
    }
  }
  if (pendientes.size > 0) {
    throw new Error(
      `No sé escribir como migración propia: ${[...pendientes].join(", ")} (¿la tienda cambió la clave primaria de una tabla del template?).`
    );
  }
  return grupos;
}

export type GenerarSql = (antes: Snapshot, despues: Snapshot) => Promise<string[]>;

/** El generador de drizzle-kit, el mismo que usa `pnpm db:generate`. Se carga sólo si hace falta. */
export const generarConDrizzleKit: GenerarSql = async (antes, despues) => {
  const { generateMySQLMigration } = await import("drizzle-kit/api");
  return generateMySQLMigration(antes as never, despues as never);
};

/**
 * Cada sentencia, envuelta: corre sólo si el objeto no existe. En esta base
 * (que ya lo tiene) no hace nada; en una base nueva lo crea. MySQL no tiene
 * `ADD COLUMN IF NOT EXISTS`, así que va por un PREPARE.
 */
export function sentenciaCondicional(existe: string, sentencia: string): string[] {
  const limpia = sentencia.trim().replace(/;\s*$/, "");
  return [
    `SET @adoptar_sql := IF((${existe}) = 0, ${sqlLiteral(limpia)}, 'DO 0');`,
    "PREPARE adoptar_stmt FROM @adoptar_sql;",
    "EXECUTE adoptar_stmt;",
    "DEALLOCATE PREPARE adoptar_stmt;",
  ];
}

export const SUFIJO_PROPIAS = "propias_de_la_tienda";

export async function migracionPropia(entrada: {
  template: Historia;
  tienda: Historia;
  propios: readonly ObjetoPropio[];
  ahora: number;
  id?: string;
  generar?: GenerarSql;
}): Promise<{ entrada: JournalEntry; sql: string; snapshot: Snapshot }> {
  const ultima = entrada.template.migraciones.at(-1)!;
  const snapTienda = entrada.tienda.migraciones.at(-1)!.snapshot!;
  const generar = entrada.generar ?? generarConDrizzleKit;
  const grupos = gruposPropios(entrada.propios, snapTienda);

  let actual = clonar(ultima.snapshot!);
  const sentencias: string[] = [
    `-- Objetos propios de la tienda, adoptados sobre la historia del template hasta ${ultima.entrada.tag}`,
    "-- (pnpm template:adoptar-historial). Cada uno se crea sólo si no existe: en la base",
    "-- donde se adoptó ya estaban; en una base nueva se crean acá.",
  ];
  const cuerpo: string[] = [];
  for (const grupo of grupos) {
    const siguiente = clonar(actual);
    grupo.agregar(siguiente);
    const generadas = (await generar(actual, siguiente)).filter((s) => s.trim() !== "");
    if (generadas.length !== 1) {
      throw new Error(
        `drizzle-kit escribió ${generadas.length} sentencias para ${grupo.clave}; esperaba una.`
      );
    }
    cuerpo.push(...sentenciaCondicional(grupo.existe, generadas[0]!));
    actual = siguiente;
  }
  const idx = ultima.entrada.idx + 1;
  const snapshot: Snapshot = { ...actual, id: entrada.id ?? randomUUID(), prevId: ultima.snapshot!.id };
  return {
    entrada: {
      idx,
      version: ultima.entrada.version,
      when: Math.max(entrada.ahora, ultima.entrada.when + 1),
      tag: `${pad(idx)}_${SUFIJO_PROPIAS}`,
      breakpoints: true,
    },
    // La primera sentencia lleva los comentarios: drizzle corta por
    // `--> statement-breakpoint` y manda cada pedazo tal cual.
    sql: sentencias.join("\n") + "\n" + cuerpo.join("--> statement-breakpoint\n"),
    snapshot,
  };
}

export async function completarPlan(
  plan: Omit<Plan, "nueva">,
  entrada: { template: Historia; tienda: Historia; ahora: number; id?: string; generar?: GenerarSql }
): Promise<Plan> {
  if (plan.propios.length === 0) return { ...plan, nueva: null };
  const nueva = await migracionPropia({ ...entrada, propios: plan.propios });
  const pendientes = plan.template.some((m) => m.estado === "pendiente");
  return {
    ...plan,
    nueva,
    // Sin pendientes del template, la propia se marca aplicada (sus objetos
    // ya están). Con pendientes, queda pendiente también: si se marcara,
    // drizzle saltearía las del template, que son anteriores. Su SQL no hace
    // nada en esta base.
    filas: pendientes
      ? plan.filas
      : [...plan.filas, { hash: hashDeMigracion(nueva.sql), createdAt: nueva.entrada.when, tag: nueva.entrada.tag }],
  };
}

// ---------------------------------------------------------------------------
// El backup de la última hora
// ---------------------------------------------------------------------------

export const BACKUP_MINUTOS = 60;

export type Evidencia = { ok: true; detalle: string } | { ok: false; motivo: string };

/** ¿Este `.sql.gz` es un dump de esta base? Lee sólo el encabezado. */
export function esDumpDe(archivo: string, base: string): boolean {
  try {
    const crudo = readFileSync(archivo).subarray(0, 64 * 1024);
    const texto = gunzipSync(crudo, { finishFlush: zlib.Z_SYNC_FLUSH }).toString("utf8", 0, 8192);
    return /-- (MySQL|MariaDB) dump/i.test(texto) && new RegExp(`Database: ${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`).test(texto);
  } catch {
    return false;
  }
}

/**
 * Un backup de **esta** base hecho hace menos de una hora: el `.sql.gz` que
 * deja `pnpm backup` (en `backups/` o el que se pase con `--backup`), o la
 * corrida OK del cron de backup a R2 (`job_runs`).
 */
export function evidenciaDeBackup(entrada: {
  cwd: string;
  base: string;
  archivo: string | null;
  ahora: Date;
  cronOk: Date | null;
}): Evidencia {
  const limite = entrada.ahora.getTime() - BACKUP_MINUTOS * 60_000;
  const minutos = (t: number) => Math.max(0, Math.round((entrada.ahora.getTime() - t) / 60_000));
  if (entrada.cronOk && entrada.cronOk.getTime() >= limite && !entrada.archivo) {
    return { ok: true, detalle: `backup del cron (job_runs) OK hace ${minutos(entrada.cronOk.getTime())} min` };
  }
  let candidatos: string[];
  if (entrada.archivo) {
    candidatos = [entrada.archivo];
  } else {
    const carpeta = join(entrada.cwd, "backups");
    candidatos = existsSync(carpeta)
      ? readdirSync(carpeta)
          .filter((n) => n.startsWith(`${entrada.base}-`) && n.endsWith(".sql.gz"))
          .map((n) => join(carpeta, n))
      : [];
  }
  const recientes = candidatos
    .filter((a) => existsSync(a))
    .map((a) => ({ a, st: statSync(a) }))
    .filter(({ st }) => st.isFile() && st.size > 0 && st.mtimeMs >= limite)
    .sort((x, y) => y.st.mtimeMs - x.st.mtimeMs);
  const valido = recientes.find(({ a }) => esDumpDe(a, entrada.base));
  if (valido) {
    return { ok: true, detalle: `${valido.a} (hace ${minutos(valido.st.mtimeMs)} min)` };
  }
  return {
    ok: false,
    motivo:
      `No encontré un backup de "${entrada.base}" de los últimos ${BACKUP_MINUTOS} minutos` +
      (entrada.archivo ? ` en ${entrada.archivo} (tiene que ser un dump de esa base, de la última hora)` : " (ni en backups/ ni del cron)") +
      ". Hacelo primero: `pnpm backup` (DEPLOY.md §7).",
  };
}

// ---------------------------------------------------------------------------
// Aplicar: archivos y filas juntos, o nada
// ---------------------------------------------------------------------------

export const CARPETA_PREVIA = ".drizzle-adopcion-previa";
export const CARPETA_NUEVA = ".drizzle-adopcion-nueva";

/**
 * Si una corrida anterior murió en el medio (quedó la copia de `drizzle/`
 * de antes), deciden las filas de `__drizzle_migrations`. Antes del COMMIT
 * son siempre exactamente las del `drizzle/` de antes (si no, no se adopta),
 * y si la transacción no llegó al COMMIT MySQL ya la deshizo al cortarse la
 * conexión: vuelve la copia a su lugar. Si ya no son esas pero encajan con el
 * `drizzle/` nuevo, el COMMIT llegó (murió limpiando): la adopción está hecha
 * y sólo sobra la copia. Devuelve `true` sólo si volvió el `drizzle/` de antes.
 */
export function recuperarCorte(cwd: string, filasAplicadas: readonly Fila[]): boolean {
  const previa = join(cwd, CARPETA_PREVIA);
  rmSync(join(cwd, CARPETA_NUEVA), { recursive: true, force: true });
  if (!existsSync(previa)) return false;
  const estado = (carpeta: string) => {
    try {
      return estadoDeFilas(filasAplicadas, historiaDeCarpeta(cwd, carpeta));
    } catch {
      return null;
    }
  };
  const antes = estado(previa);
  const deAntes = antes !== null && antes.ajenas === 0 && antes.pendientes.length === 0;
  const nueva = deAntes ? null : estado(join(cwd, "drizzle"));
  if (nueva !== null && nueva.ajenas === 0) {
    rmSync(previa, { recursive: true, force: true });
    return false;
  }
  rmSync(join(cwd, "drizzle"), { recursive: true, force: true });
  renameSync(previa, join(cwd, "drizzle"));
  return true;
}

/** Los archivos del `drizzle/` nuevo: el del template tal cual, más la propia. */
export function archivosNuevos(
  cwd: string,
  ref: string,
  template: Historia,
  nueva: Plan["nueva"]
): Map<string, string> {
  const archivos = new Map<string, string>();
  const salida = gitEn(cwd, ["ls-tree", "-r", "-z", "--full-tree", ref, "--", "drizzle"]);
  for (const linea of salida.split("\0")) {
    if (linea === "") continue;
    const tab = linea.indexOf("\t");
    const [, tipo, blob] = linea.slice(0, tab).split(" ");
    if (tipo === "blob" && blob) archivos.set(linea.slice(tab + 1), gitEn(cwd, ["cat-file", "blob", blob]));
  }
  if (nueva) {
    const journal = JSON.parse(template.journal) as { entries: JournalEntry[] };
    journal.entries.push(nueva.entrada);
    archivos.set(JOURNAL_PATH, JSON.stringify(journal, null, 2));
    archivos.set(`drizzle/${nueva.entrada.tag}.sql`, nueva.sql);
    archivos.set(`drizzle/meta/${pad(nueva.entrada.idx)}_snapshot.json`, JSON.stringify(nueva.snapshot, null, 2));
  }
  return archivos;
}

export type Corte = "archivos" | "filas" | "confirmado";

/** Un corte simulado (tests): `limpiar: false` imita un proceso que muere sin llegar al catch. */
export class CorteSimulado extends Error {
  constructor(
    public etapa: Corte,
    public limpiar: boolean
  ) {
    super(`corte simulado en ${etapa}`);
  }
}

export async function aplicarAdopcion(entrada: {
  cwd: string;
  con: mysql.Connection;
  archivos: Map<string, string>;
  filasLeidas: readonly Fila[];
  filasNuevas: readonly FilaNueva[];
  cortar?: (etapa: Corte) => void;
}): Promise<void> {
  const { cwd, con } = entrada;
  const drizzleDir = join(cwd, "drizzle");
  const previa = join(cwd, CARPETA_PREVIA);
  const nueva = join(cwd, CARPETA_NUEVA);

  rmSync(nueva, { recursive: true, force: true });
  for (const [ruta, contenido] of entrada.archivos) {
    const destino = join(nueva, ...ruta.split("/").slice(1));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }

  let cambiado = false;
  let abierta = false;
  try {
    renameSync(drizzleDir, previa);
    renameSync(nueva, drizzleDir);
    cambiado = true;
    entrada.cortar?.("archivos");

    await con.beginTransaction();
    abierta = true;
    const actuales = await filas<{ id: number; hash: string; created_at: number | string }>(
      con,
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY id FOR UPDATE"
    );
    const igual =
      actuales.length === entrada.filasLeidas.length &&
      actuales.every(
        (f, i) =>
          Number(f.id) === entrada.filasLeidas[i]!.id &&
          f.hash === entrada.filasLeidas[i]!.hash &&
          Number(f.created_at) === entrada.filasLeidas[i]!.createdAt
      );
    if (!igual) {
      throw new Error("__drizzle_migrations cambió mientras planificaba (¿alguien migró?). No toqué nada; volvé a correrlo.");
    }
    if (actuales.length > 0) {
      await con.query("DELETE FROM `__drizzle_migrations` WHERE id IN (?)", [actuales.map((f) => f.id)]);
    }
    entrada.cortar?.("filas");
    for (const fila of entrada.filasNuevas) {
      await con.query("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [
        fila.hash,
        fila.createdAt,
      ]);
    }
    await con.commit();
    abierta = false;
  } catch (error) {
    if (error instanceof CorteSimulado && !error.limpiar) throw error;
    if (abierta) await con.rollback().catch(() => {});
    if (cambiado) {
      rmSync(drizzleDir, { recursive: true, force: true });
      renameSync(previa, drizzleDir);
    } else if (existsSync(previa) && !existsSync(drizzleDir)) {
      renameSync(previa, drizzleDir);
    }
    rmSync(nueva, { recursive: true, force: true });
    throw error;
  }
  // Después del COMMIT ya no se vuelve atrás: si muere acá, la próxima corrida
  // ve las filas nuevas y sólo borra la copia (`recuperarCorte`).
  entrada.cortar?.("confirmado");
  rmSync(previa, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// De punta a punta: lo que llaman el CLI y los tests de integración
// ---------------------------------------------------------------------------

export type Opciones = {
  aplicar: boolean;
  remoto: string;
  rama: string;
  hasta: string | null;
  backup: string | null;
};

export function parseArgs(entrada: string[]): Opciones {
  const argv = entrada.filter((arg) => arg !== "--");
  const opciones: Opciones = { aplicar: false, remoto: "template", rama: "main", hasta: null, backup: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--aplicar") {
      opciones.aplicar = true;
      continue;
    }
    if (flag === "--hasta" || flag === "--remoto" || flag === "--rama" || flag === "--backup") {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith("--")) throw new Error(`${flag} espera un valor`);
      if (flag === "--hasta") opciones.hasta = valor;
      else if (flag === "--remoto") opciones.remoto = valor;
      else if (flag === "--rama") opciones.rama = valor;
      else opciones.backup = valor;
      i += 1;
      continue;
    }
    throw new Error(`no conozco la opción "${flag}"`);
  }
  return opciones;
}

export type Resultado = {
  decision: Plan | Rechazo | YaAdoptada;
  backup: Evidencia;
  /** Hubo que volver `drizzle/` de una corrida cortada. */
  recuperado: boolean;
  aplicado: boolean;
  objetivo: string;
};

async function leerFilas(con: Consultable): Promise<Fila[]> {
  try {
    const crudas = await filas<{ id: number; hash: string; created_at: number | string }>(
      con,
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY id"
    );
    return crudas.map((f) => ({ id: Number(f.id), hash: f.hash, createdAt: Number(f.created_at) }));
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

async function cronDeBackupOk(con: Consultable): Promise<Date | null> {
  try {
    const [fila] = await filas<{ ok: Date | null }>(con, "SELECT last_ok_at AS ok FROM `job_runs` WHERE job = 'backup'");
    return fila?.ok ? new Date(fila.ok) : null;
  } catch {
    return null;
  }
}

/**
 * El corazón del comando: lee los dos lados y la base, decide, y con
 * `aplicar` escribe. No imprime ni llama a `process.exit`.
 */
export async function adoptarHistorial(entrada: {
  cwd: string;
  con: mysql.Connection;
  objetivo: string;
  aplicar: boolean;
  backup: string | null;
  ahora?: Date;
  generar?: GenerarSql;
  cortar?: (etapa: Corte) => void;
}): Promise<Resultado> {
  const { cwd, con } = entrada;
  const ahora = entrada.ahora ?? new Date();
  // Primero el motor: uno que no sabemos leer se niega antes de tocar nada.
  const motor = await motorDe(con);
  const filasLeidas = await leerFilas(con);
  const recuperado = recuperarCorte(cwd, filasLeidas);

  const tienda = historiaDeCarpeta(cwd);
  const template = historiaDeGit(cwd, entrada.objetivo);
  const vivo = await esquemaVivo(con, motor);
  const [base] = await filas<{ db: string }>(con, "SELECT DATABASE() AS db");
  const backup = evidenciaDeBackup({
    cwd,
    base: base?.db ?? "",
    archivo: entrada.backup,
    ahora,
    cronOk: await cronDeBackupOk(con),
  });

  const previa = planificarAdopcion({ tienda, template, filas: filasLeidas, vivo });
  let decision: Decision;
  if (previa.estado !== "plan") {
    decision = previa;
  } else {
    try {
      decision = await completarPlan(previa, { template, tienda, ahora: ahora.getTime(), generar: entrada.generar });
    } catch (error) {
      decision = { estado: "rechazo", motivos: [(error as Error).message] };
    }
  }

  if (decision.estado === "plan") {
    const [motorTabla] = await filas<{ e: string | null }>(
      con,
      "SELECT engine AS e FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'"
    );
    if (motorTabla && String(motorTabla.e).toLowerCase() !== "innodb") {
      decision = {
        estado: "rechazo",
        motivos: [`__drizzle_migrations es ${motorTabla.e}, no InnoDB: no puedo reescribirla en una transacción.`],
      };
    }
  }

  let aplicado = false;
  if (entrada.aplicar && decision.estado === "plan" && backup.ok) {
    const sucio = gitEn(cwd, ["status", "--porcelain", "--", "drizzle"]).trim();
    if (sucio !== "") {
      decision = {
        estado: "rechazo",
        motivos: ["drizzle/ tiene cambios sin commitear. Commitealos o descartalos antes de adoptar: este comando lo reemplaza entero."],
      };
    } else {
      await aplicarAdopcion({
        cwd,
        con,
        archivos: archivosNuevos(cwd, entrada.objetivo, template, decision.nueva),
        filasLeidas,
        filasNuevas: decision.filas,
        cortar: entrada.cortar,
      });
      aplicado = true;
    }
  }
  return { decision, backup, recuperado, aplicado, objetivo: entrada.objetivo };
}

// ---------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------

export function informe(r: Resultado, aplicar: boolean): string {
  const l: string[] = [];
  const d = r.decision;
  l.push(`Historia de migraciones de esta tienda contra el template (${r.objetivo.slice(0, 12)})`, "");
  if (r.recuperado) {
    l.push("⚠ Había una adopción cortada a la mitad: volví drizzle/ como estaba antes de esa corrida.", "");
  }
  if (d.estado === "ya-adoptada") {
    l.push(
      `✓ Ya tiene toda la historia del template (${d.comun} migraciones)` +
        (d.propias.length ? ` más ${d.propias.length} propia(s): ${d.propias.join(", ")}` : "") +
        ". No hay nada que adoptar."
    );
    if (d.pendientes.length || d.ajenas) {
      l.push(
        `  En la base: ${d.pendientes.length} pendiente(s)${d.pendientes.length ? ` (${d.pendientes.join(", ")})` : ""}` +
          (d.ajenas ? `, ${d.ajenas} fila(s) ajenas` : "") +
          ". Siguiente paso: `pnpm db:migrate`, después `pnpm db:check`."
      );
    }
    return l.join("\n");
  }
  if (d.estado === "rechazo") {
    l.push("✗ No se puede adoptar. No escribí nada.", "");
    for (const motivo of d.motivos) l.push(motivo, "");
    l.push('Qué hacer: NEW-STORE.md § "Migraciones propias de una tienda".');
    return l.join("\n");
  }
  l.push(`En común con el template: ${d.comun} migraciones (hasta ${d.comun ? pad(d.comun - 1) : "—"}).`);
  if (d.reemplazadas.length) {
    l.push(`Propias de la tienda que se reemplazan por las del template: ${d.reemplazadas.join(", ")}.`);
  }
  l.push("", "Del template, según el esquema real de la base:");
  for (const m of d.template) {
    l.push(
      m.estado === "aplicada"
        ? `  ✓ ${m.tag} — ya está: se marca aplicada`
        : `  · ${m.tag} — no está: queda pendiente para \`pnpm db:migrate\``
    );
  }
  l.push("");
  if (d.nueva) {
    l.push(`Objetos sólo de la tienda (van a ${d.nueva.entrada.tag}, que en esta base no hace nada):`);
    for (const p of d.propios) l.push(`  + ${p.clave} — ${p.definicion}`);
  } else {
    l.push("La tienda no tiene objetos propios: drizzle/ queda igual al del template.");
  }
  if (d.fueraDeDrizzle.length) {
    l.push("", `En la base y en ningún snapshot (extras de applySchemaExtras, índices de FK): ${d.fueraDeDrizzle.length}. No los toco.`);
  }
  for (const aviso of d.avisos) l.push("", `⚠ ${aviso}`);
  l.push("", r.backup.ok ? `Backup: ✓ ${r.backup.detalle}` : `Backup: ✗ ${r.backup.motivo}`);
  l.push("");
  if (r.aplicado) {
    l.push(
      `✓ Adoptada: drizzle/ es el del template${d.nueva ? ` + ${d.nueva.entrada.tag}` : ""}, y __drizzle_migrations tiene ${d.filas.length} fila(s).`,
      "  Siguiente: commiteá drizzle/ (git add drizzle && git commit), `pnpm template:sync`,",
      "  y en la base `pnpm db:migrate` y `pnpm db:check` (NEW-STORE.md § \"Migraciones propias de una tienda\")."
    );
  } else if (aplicar) {
    l.push("✗ No apliqué nada: falta el backup.");
  } else {
    l.push("Ensayo: no escribí nada. Para hacerlo: `pnpm template:adoptar-historial --aplicar`.");
  }
  return l.join("\n");
}

function salioBien(r: Resultado, aplicar: boolean): boolean {
  if (r.decision.estado === "rechazo") return false;
  if (r.decision.estado === "ya-adoptada") return true;
  return aplicar ? r.aplicado : r.backup.ok;
}

async function main(): Promise<void> {
  const opciones = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL no está definida.");
    process.exitCode = 1;
    return;
  }
  let objetivo: string;
  try {
    if (!opciones.hasta) {
      if (!remotoExiste(cwd, opciones.remoto)) {
        throw new Error(
          `no hay un remoto "${opciones.remoto}". Agregalo: git remote add ${opciones.remoto} https://github.com/antonmarklundcom/ecom.git`
        );
      }
      gitEn(cwd, ["fetch", opciones.remoto, opciones.rama]);
    }
    objetivo = gitEn(cwd, ["rev-parse", "--verify", `${opciones.hasta ?? `${opciones.remoto}/${opciones.rama}`}^{commit}`]).trim();
  } catch (error) {
    console.error(`✗ No pude leer el template: ${(error as Error).message.split("\n")[0]}`);
    process.exitCode = 1;
    return;
  }

  const con = await mysql.createConnection({ uri: url, timezone: "Z", connectTimeout: 15_000 });
  try {
    const resultado = await adoptarHistorial({ cwd, con, objetivo, aplicar: opciones.aplicar, backup: opciones.backup });
    console.log(informe(resultado, opciones.aplicar));
    if (!salioBien(resultado, opciones.aplicar)) process.exitCode = 1;
  } finally {
    await con.end();
  }
}

if (process.argv[1] && /template-adoptar-historial\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
