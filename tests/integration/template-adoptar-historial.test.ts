import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateWithBoundedLocks } from "@/db/migrate";
import {
  adoptarHistorial,
  CARPETA_PREVIA,
  CorteSimulado,
  esquemaDeSnapshot,
  gitEn,
  esquemaVivo,
  estadoDeFilas,
  historiaDeCarpeta,
  informe,
  leerFilasDeEsquema,
  motorDe,
  type Snapshot,
} from "../../scripts/template-adoptar-historial";

import { TEST_DATABASE_URL, hasTestDb } from "../helpers/db";

/**
 * `pnpm template:adoptar-historial` contra MySQL 8 y git de verdad (O24,
 * review F13).
 *
 * Cada caso arma una tienda temporal: un repo con el `drizzle/` del template
 * en un commit (el "template/main") y el de la tienda en otro, y una base
 * desechable migrada con el `drizzle/` de la tienda, con datos. Las dos
 * formas de tienda salen de las reales:
 *
 * - "Oeste": baseline `f9979ce` (0000–0010), y dos migraciones propias bajo
 *   los números del template que portaron a mano lo que hacen la 0011 y la
 *   0012 del template, más una columna que es sólo suya
 *   (`products.pais_origen`). Se puede adoptar.
 * - "Mascota": las dos propias de mascota tal cual (`login_tokens.attempts`,
 *   `customers.session_version` DEFAULT 0): pedazos de la 0018 del template,
 *   con otro default y sin las 0011–0017 antes. No se puede: se niega.
 */

type Journal = {
  version: string;
  dialect: string;
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
};

const RAIZ = process.cwd();
const COMPLETO = JSON.parse(readFileSync(join(RAIZ, "drizzle/meta/_journal.json"), "utf8")) as Journal;
// En una tienda que ya adoptó, su `NNNN_propias_de_la_tienda` no es del template.
const JOURNAL: Journal = {
  ...COMPLETO,
  entries: COMPLETO.entries.filter((e) => !e.tag.endsWith("_propias_de_la_tienda")),
};
const BASELINE = 10; // f9979ce termina en 0010_mean_monster_badoon

function snapshotDelTemplate(idx: number): Snapshot {
  return JSON.parse(
    readFileSync(join(RAIZ, "drizzle/meta", `${String(idx).padStart(4, "0")}_snapshot.json`), "utf8")
  ) as Snapshot;
}

function sqlDelTemplate(idx: number): string {
  return readFileSync(join(RAIZ, "drizzle", `${JOURNAL.entries[idx]!.tag}.sql`), "utf8");
}

type Propia = { tag: string; when: number; sql: string; snapshot: Snapshot };

function escribir(repo: string, ruta: string, contenido: string): void {
  const completa = join(repo, ...ruta.split("/"));
  mkdirSync(dirname(completa), { recursive: true });
  writeFileSync(completa, contenido);
}

function carpeta(dir: string): Map<string, string> {
  const archivos = new Map<string, string>();
  const recorrer = (d: string) => {
    for (const nombre of readdirSync(d, { withFileTypes: true })) {
      const ruta = join(d, nombre.name);
      if (nombre.isDirectory()) recorrer(ruta);
      else archivos.set(relative(dir, ruta).replace(/\\/g, "/"), readFileSync(ruta, "utf8"));
    }
  };
  recorrer(dir);
  return archivos;
}

/** El repo de la tienda: el commit del template (objetivo) y la tienda en `main`. */
function repoDeTienda(propias: Propia[]): { repo: string; objetivo: string } {
  const repo = mkdtempSync(join(tmpdir(), "ecom-adoptar-"));
  gitEn(repo, ["init", "-q", "-b", "main"]);
  gitEn(repo, ["config", "core.autocrlf", "false"]);
  gitEn(repo, ["config", "user.email", "test@example.com"]);
  gitEn(repo, ["config", "user.name", "Test"]);
  gitEn(repo, ["config", "commit.gpgsign", "false"]);

  // El template entero, en una rama aparte (lo que sería template/main).
  gitEn(repo, ["checkout", "-q", "--orphan", "template"]);
  for (const e of JOURNAL.entries) {
    escribir(repo, `drizzle/${e.tag}.sql`, sqlDelTemplate(e.idx));
    escribir(repo, `drizzle/meta/${String(e.idx).padStart(4, "0")}_snapshot.json`, JSON.stringify(snapshotDelTemplate(e.idx), null, 2));
  }
  escribir(repo, "drizzle/meta/_journal.json", JSON.stringify(JOURNAL, null, 2));
  gitEn(repo, ["add", "-A"]);
  gitEn(repo, ["commit", "-q", "-m", "template"]);
  const objetivo = gitEn(repo, ["rev-parse", "HEAD"]).trim();

  // La tienda: las del baseline idénticas, más las suyas.
  gitEn(repo, ["checkout", "-q", "--orphan", "main"]);
  gitEn(repo, ["rm", "-rq", "--cached", "."]);
  rmSync(join(repo, "drizzle"), { recursive: true, force: true });
  const entries = JOURNAL.entries.slice(0, BASELINE + 1).map((e) => ({ ...e }));
  for (const e of entries) {
    escribir(repo, `drizzle/${e.tag}.sql`, sqlDelTemplate(e.idx));
    escribir(
      repo,
      `drizzle/meta/${String(e.idx).padStart(4, "0")}_snapshot.json`,
      JSON.stringify(snapshotDelTemplate(e.idx), null, 2)
    );
  }
  for (const p of propias) {
    const idx = entries.length;
    entries.push({ idx, version: "5", when: p.when, tag: p.tag, breakpoints: true });
    escribir(repo, `drizzle/${p.tag}.sql`, p.sql);
    escribir(repo, `drizzle/meta/${String(idx).padStart(4, "0")}_snapshot.json`, JSON.stringify(p.snapshot, null, 2));
  }
  escribir(repo, "drizzle/meta/_journal.json", JSON.stringify({ ...JOURNAL, entries }, null, 2));
  escribir(repo, ".gitignore", "backups/\n");
  gitEn(repo, ["add", "-A"]);
  gitEn(repo, ["commit", "-q", "-m", "tienda"]);
  return { repo, objetivo };
}

function conColumna(snap: Snapshot, tabla: string, columna: Record<string, unknown>): Snapshot {
  const copia = JSON.parse(JSON.stringify(snap)) as Snapshot;
  copia.tables[tabla]!.columns[columna.name as string] = columna as never;
  copia.id = `${copia.id.slice(0, 30)}tienda${Object.keys(copia.tables[tabla]!.columns).length}`;
  return copia;
}

const PAIS_ORIGEN = { name: "pais_origen", type: "varchar(60)", primaryKey: false, notNull: false, autoincrement: false };

/** Oeste: portó la 0011 y la 0012 del template con `db:generate`, más una columna suya. */
function propiasDeOeste(): Propia[] {
  return [
    {
      tag: "0011_oeste_envios",
      when: JOURNAL.entries[11]!.when + 3_600_000,
      sql: sqlDelTemplate(11),
      snapshot: snapshotDelTemplate(11),
    },
    {
      tag: "0012_oeste_operacion",
      when: JOURNAL.entries[12]!.when + 3_600_000,
      sql: sqlDelTemplate(12) + "--> statement-breakpoint\nALTER TABLE `products` ADD `pais_origen` varchar(60);",
      snapshot: conColumna(snapshotDelTemplate(12), "products", PAIS_ORIGEN),
    },
  ];
}

/** Mascota, tal cual está en su repo: dos pedazos de la 0018 del template. */
function propiasDeMascota(): Propia[] {
  const attempts = { name: "attempts", type: "tinyint unsigned", primaryKey: false, notNull: true, autoincrement: false, default: 0 };
  const sessionVersion = { name: "session_version", type: "int unsigned", primaryKey: false, notNull: true, autoincrement: false, default: 0 };
  const s11 = conColumna(snapshotDelTemplate(10), "login_tokens", attempts);
  return [
    {
      tag: "0011_tiny_may_parker",
      when: 1_793_000_000_000,
      sql: "ALTER TABLE `login_tokens` ADD `attempts` tinyint unsigned DEFAULT 0 NOT NULL;",
      snapshot: s11,
    },
    {
      tag: "0012_old_puppet_master",
      when: 1_793_000_100_000,
      sql: "ALTER TABLE `customers` ADD `session_version` int unsigned DEFAULT 0 NOT NULL;",
      snapshot: conColumna(s11, "customers", sessionVersion),
    },
  ];
}

const bases: string[] = [];
const repos: string[] = [];
let admin: mysql.Connection;

function urlDe(base: string): string {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${base}`;
  return url.toString();
}

async function conectar(base: string): Promise<mysql.Connection> {
  return mysql.createConnection({ uri: urlDe(base), timezone: "Z" });
}

async function baseNueva(sufijo: string): Promise<string> {
  const nombre = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_adopt_${sufijo}`;
  if (!/test/i.test(nombre)) throw new Error(`base sin "test" en el nombre: ${nombre}`);
  await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
  await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  bases.push(nombre);
  return nombre;
}

/** Una tienda lista: repo + base migrada con su drizzle/ + datos. */
async function tienda(sufijo: string, propias: Propia[]) {
  const { repo, objetivo } = repoDeTienda(propias);
  repos.push(repo);
  const base = await baseNueva(sufijo);
  const con = await conectar(base);
  await migrateWithBoundedLocks(con, { migrationsFolder: join(repo, "drizzle") });
  await con.query("INSERT INTO categories (slug, name) VALUES ('cocina', 'Cocina'), ('patio', 'Patio')");
  await con.query(
    "INSERT INTO products (slug, name, category_id) SELECT 'olla', 'Olla de barro', id FROM categories WHERE slug = 'cocina'"
  );
  await con.query("INSERT INTO customers (phone, name) VALUES ('0981000001', 'Ana'), ('0981000002', 'Beto')");
  return { repo, objetivo, base, con };
}

function backupDe(repo: string, base: string): string {
  const archivo = join(repo, "backups", `${base}-2026-11-11_03-00-00.sql.gz`);
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(
    archivo,
    gzipSync(`-- MySQL dump 10.13  Distrib 8.4.11\n--\n-- Host: 127.0.0.1    Database: ${base}\n-- ---\n`)
  );
  return archivo;
}

/** Para el mensaje de un test que falla: la versión y las filas crudas de esas claves. */
async function crudoDe(con: mysql.Connection, clavesDistintas: string[]): Promise<string> {
  const [[{ v }]] = (await con.query("SELECT VERSION() AS v")) as unknown as [[{ v: string }]];
  const filas = await leerFilasDeEsquema(con, await motorDe(con));
  const tablas = new Set(clavesDistintas.map((clave) => clave.split(" ").at(-1)!.split(".")[0]!));
  const columnas = filas.columnas.filter((c) => tablas.has(c.t) && clavesDistintas.some((k) => k.endsWith(` ${c.t}.${c.c}`)));
  const checks = [...filas.checks, ...filas.clausulas].filter((c) => tablas.has(c.t));
  return `VERSION() ${v}\n${JSON.stringify({ columnas, checks }, null, 1)}`;
}

async function filasDe(con: mysql.Connection): Promise<string[]> {
  const [rows] = await con.query("SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id");
  return (rows as { id: number; hash: string; created_at: string }[]).map((r) => `${r.id}:${r.hash}:${r.created_at}`);
}

/** Huella de los datos (sin __drizzle_migrations), como snapshot.py. */
async function huella(con: mysql.Connection): Promise<string> {
  const [tablas] = await con.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations' ORDER BY table_name"
  );
  const partes: string[] = [];
  for (const { t } of tablas as { t: string }[]) {
    const [rows] = await con.query(`SELECT * FROM \`${t}\``);
    partes.push(`${t}:${JSON.stringify(rows)}`);
  }
  return partes.join("\n");
}

describe.skipIf(!hasTestDb)("template:adoptar-historial contra MySQL", () => {
  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = "/";
    admin = await mysql.createConnection({ uri: url.toString() });
  });

  afterAll(async () => {
    for (const base of bases) await admin.query(`DROP DATABASE IF EXISTS \`${base}\``);
    await admin.end();
    for (const repo of repos) rmSync(repo, { recursive: true, force: true });
  });

  it("el esquema leído de MySQL es el de los snapshots de drizzle (baseline y template de hoy)", async () => {
    const { repo } = repoDeTienda([]);
    repos.push(repo);
    for (const k of [BASELINE, JOURNAL.entries.length - 1]) {
      const base = await baseNueva(`fiel_${k}`);
      const con = await conectar(base);
      const carpetaK = mkdtempSync(join(tmpdir(), "ecom-adoptar-k-"));
      repos.push(carpetaK);
      const entries = JOURNAL.entries.slice(0, k + 1);
      for (const e of entries) escribir(carpetaK, `${e.tag}.sql`, sqlDelTemplate(e.idx));
      escribir(carpetaK, "meta/_journal.json", JSON.stringify({ ...JOURNAL, entries }));
      await migrateWithBoundedLocks(con, { migrationsFolder: carpetaK });
      const vivo = await esquemaVivo(con, await motorDe(con));
      const esperado = esquemaDeSnapshot(snapshotDelTemplate(k));
      const distintas = [...esperado].filter(([clave, def]) => vivo.get(clave) !== def);
      // Si falla, lo que devolvió el motor tal cual, para ver qué normalizar.
      const crudo = distintas.length ? await crudoDe(con, distintas.map(([clave]) => clave)) : "";
      expect(distintas.map(([clave, def]) => `${clave}: snapshot ${def} / base ${vivo.get(clave)}`), crudo).toEqual([]);
      await con.end();
    }
  });

  it("los casos que el motor podría confundir se leen como son (texto 'NULL', longtext que no es JSON, comillas)", async () => {
    const base = await baseNueva("sonda");
    const con = await conectar(base);
    await con.query(`CREATE TABLE sonda (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sin_default varchar(20),
      texto_null varchar(20) DEFAULT 'NULL',
      comilla varchar(20) NOT NULL DEFAULT 'it''s',
      estado enum('a','b') NOT NULL DEFAULT 'a',
      cero int NOT NULL DEFAULT 0,
      largo longtext,
      datos json,
      creado datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tocado timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    )`);
    const vivo = await esquemaVivo(con, await motorDe(con));
    const obtenido = Object.fromEntries([...vivo].filter(([clave]) => / sonda[.]|sonda$/.test(clave)));
    expect(obtenido, await crudoDe(con, Object.keys(obtenido))).toEqual({
      "tabla sonda": "existe",
      "clave primaria sonda": "(id)",
      "columna sonda.id": "int NOT NULL AUTO_INCREMENT",
      "columna sonda.sin_default": "varchar(20)",
      "columna sonda.texto_null": "varchar(20) DEFAULT 'NULL'",
      "columna sonda.comilla": "varchar(20) NOT NULL DEFAULT 'it''s'",
      "columna sonda.estado": "enum('a','b') NOT NULL DEFAULT 'a'",
      "columna sonda.cero": "int NOT NULL DEFAULT '0'",
      "columna sonda.largo": "longtext",
      "columna sonda.datos": "json",
      "columna sonda.creado": "datetime NOT NULL DEFAULT CURRENT_TIMESTAMP",
      "columna sonda.tocado": "timestamp ON UPDATE CURRENT_TIMESTAMP",
    });
    await con.end();
  });

  it("Oeste: el ensayo decide por el esquema real y no escribe nada", async () => {
    const { repo, objetivo, con } = await tienda("oeste_ensayo", propiasDeOeste());
    const antes = { archivos: carpeta(join(repo, "drizzle")), filas: await filasDe(con) };

    const r = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: false, backup: null });

    expect(r.decision.estado).toBe("plan");
    if (r.decision.estado !== "plan") return;
    expect(r.decision.comun).toBe(11);
    expect(r.decision.reemplazadas).toEqual(["0011_oeste_envios", "0012_oeste_operacion"]);
    const aplicadas = r.decision.template.filter((m) => m.estado === "aplicada").map((m) => m.tag);
    expect(aplicadas).toEqual([JOURNAL.entries[11]!.tag, JOURNAL.entries[12]!.tag]);
    expect(r.decision.template.filter((m) => m.estado === "pendiente")).toHaveLength(JOURNAL.entries.length - 13);
    expect(r.decision.propios).toEqual([{ clave: "columna products.pais_origen", definicion: "varchar(60)" }]);
    expect(r.decision.nueva?.entrada.tag).toBe(`${String(JOURNAL.entries.length).padStart(4, "0")}_propias_de_la_tienda`);
    // Con pendientes del template, la propia queda pendiente (si no, drizzle saltearía las anteriores).
    expect(r.decision.filas.map((f) => f.tag)).toEqual(JOURNAL.entries.slice(0, 13).map((e) => e.tag));
    expect(r.backup.ok).toBe(false);
    expect(r.aplicado).toBe(false);
    expect(informe(r, false)).toContain("Ensayo: no escribí nada");

    expect(carpeta(join(repo, "drizzle"))).toEqual(antes.archivos);
    expect(await filasDe(con)).toEqual(antes.filas);
    await con.end();
  });

  it("Oeste: sin backup de la última hora --aplicar se niega", async () => {
    const { repo, objetivo, base, con } = await tienda("oeste_sinbackup", propiasDeOeste());
    const antes = { archivos: carpeta(join(repo, "drizzle")), filas: await filasDe(con) };
    const viejo = backupDe(repo, base);

    const r = await adoptarHistorial({
      cwd: repo,
      con,
      objetivo,
      aplicar: true,
      backup: null,
      ahora: new Date(Date.now() + 61 * 60_000),
    });
    expect(r.backup.ok).toBe(false);
    expect(r.aplicado).toBe(false);
    expect(informe(r, true)).toContain("falta el backup");

    // Un archivo que no es un dump de esta base tampoco sirve.
    writeFileSync(viejo, gzipSync("-- MySQL dump\n-- Host: x    Database: otra_base\n"));
    const otro = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: true, backup: viejo });
    expect(otro.backup.ok).toBe(false);

    expect(carpeta(join(repo, "drizzle"))).toEqual(antes.archivos);
    expect(await filasDe(con)).toEqual(antes.filas);
    await con.end();
  });

  it("Oeste: --aplicar adopta sin tocar los datos, migra, queda como una base nueva, y repetirlo no hace nada", async () => {
    const { repo, objetivo, base, con } = await tienda("oeste_aplicar", propiasDeOeste());
    await con.query("UPDATE products SET pais_origen = 'Paraguay' WHERE slug = 'olla'");
    const datos = await huella(con);
    backupDe(repo, base);

    const r = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: true, backup: null });
    expect(informe(r, true)).toContain("✓ Adoptada");
    expect(r.aplicado).toBe(true);
    expect(await huella(con)).toBe(datos);
    expect(existsSync(join(repo, CARPETA_PREVIA))).toBe(false);

    // drizzle/ = el del template + la propia, numerada después de la última.
    const archivos = carpeta(join(repo, "drizzle"));
    for (const e of JOURNAL.entries) {
      expect(archivos.get(`${e.tag}.sql`), e.tag).toBe(sqlDelTemplate(e.idx));
    }
    const historia = historiaDeCarpeta(repo);
    expect(historia.migraciones.map((m) => m.entrada.tag)).toEqual([
      ...JOURNAL.entries.map((e) => e.tag),
      `${String(JOURNAL.entries.length).padStart(4, "0")}_propias_de_la_tienda`,
    ]);
    const propia = historia.migraciones.at(-1)!;
    expect(propia.snapshot?.prevId).toBe(snapshotDelTemplate(JOURNAL.entries.length - 1).id);
    expect(propia.snapshot?.tables.products?.columns.pais_origen).toEqual(PAIS_ORIGEN);
    expect(propia.entrada.when).toBeGreaterThan(JOURNAL.entries.at(-1)!.when);

    // Pendientes las del template y la propia; db:migrate las corre (la propia no hace nada acá).
    const pendientes = estadoDeFilas(
      (await filasDe(con)).map((f) => {
        const [id, hash, createdAt] = f.split(":");
        return { id: Number(id), hash: hash!, createdAt: Number(createdAt) };
      }),
      historia
    );
    expect(pendientes.ajenas).toBe(0);
    expect(pendientes.pendientes).toEqual(historia.migraciones.slice(13).map((m) => m.entrada.tag));
    await migrateWithBoundedLocks(con, { migrationsFolder: join(repo, "drizzle") });
    const final = await filasDe(con);
    expect(final).toHaveLength(historia.migraciones.length);
    const [[olla]] = (await con.query("SELECT pais_origen FROM products WHERE slug = 'olla'")) as unknown as [[{ pais_origen: string }]];
    expect(olla.pais_origen).toBe("Paraguay");

    // La misma forma que una base creada de cero con este drizzle/.
    const fresca = await baseNueva("oeste_fresca");
    const conFresca = await conectar(fresca);
    await migrateWithBoundedLocks(conFresca, { migrationsFolder: join(repo, "drizzle") });
    const motor = await motorDe(con);
    const [vivoAdoptada, vivoFresca] = [await esquemaVivo(con, motor), await esquemaVivo(conFresca, motor)];
    expect([...vivoAdoptada].sort()).toEqual([...vivoFresca].sort());
    await conFresca.end();

    // Repetirlo es un no-op: ni archivos ni filas.
    const adoptados = carpeta(join(repo, "drizzle"));
    const otra = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: true, backup: null });
    expect(otra.decision.estado).toBe("ya-adoptada");
    expect(carpeta(join(repo, "drizzle"))).toEqual(adoptados);
    expect(await filasDe(con)).toEqual(final);
    expect(informe(otra, true)).toContain("No hay nada que adoptar");
    await con.end();
  });

  it("Mascota: una base con otra definición se rechaza con las diferencias exactas y no se escribe nada", async () => {
    const { repo, objetivo, base, con } = await tienda("mascota", propiasDeMascota());
    backupDe(repo, base);
    const antes = { archivos: carpeta(join(repo, "drizzle")), filas: await filasDe(con), datos: await huella(con) };

    const r = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: true, backup: null });

    expect(r.decision.estado).toBe("rechazo");
    expect(r.aplicado).toBe(false);
    const texto = informe(r, true);
    expect(texto).toContain("No se puede adoptar. No escribí nada.");
    expect(texto).toContain(
      "columna customers.session_version: en la base `int unsigned NOT NULL DEFAULT '0'`; tras 0010_mean_monster_badoon sería no existe (0018_worthless_rage la deja `int unsigned NOT NULL DEFAULT '1'`)"
    );
    expect(texto).toContain("columna login_tokens.attempts: en la base `tinyint unsigned NOT NULL DEFAULT '0'`");
    expect(texto).toMatch(/0018_worthless_rage: a medias: 1 de 4 cambios ya están, 1 con otra definición/);
    expect(texto).toContain("0011_amazing_domino: no está");

    expect(carpeta(join(repo, "drizzle"))).toEqual(antes.archivos);
    expect(await filasDe(con)).toEqual(antes.filas);
    expect(await huella(con)).toBe(antes.datos);
    await con.end();
  });

  it("una base cambiada a mano (distinta de drizzle/ de la tienda) se rechaza", async () => {
    const { repo, objetivo, base, con } = await tienda("amano", propiasDeOeste());
    backupDe(repo, base);
    await con.query("ALTER TABLE products MODIFY pais_origen varchar(80)");
    const filas = await filasDe(con);

    const r = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: true, backup: null });
    expect(r.decision.estado).toBe("rechazo");
    expect(informe(r, true)).toContain(
      "columna products.pais_origen: drizzle/ de la tienda dice `varchar(60)`, la base tiene `varchar(80)`"
    );
    expect(await filasDe(con)).toEqual(filas);
    await con.end();
  });

  it("una corrida cortada a la mitad deja la tienda como estaba", async () => {
    const { repo, objetivo, base, con } = await tienda("corte", propiasDeOeste());
    backupDe(repo, base);
    const antes = { archivos: carpeta(join(repo, "drizzle")), filas: await filasDe(con) };

    // 1. Falla después de borrar las filas, dentro de la transacción: rollback y archivos de vuelta.
    await expect(
      adoptarHistorial({
        cwd: repo,
        con,
        objetivo,
        aplicar: true,
        backup: null,
        cortar: (etapa) => {
          if (etapa === "filas") throw new CorteSimulado(etapa, true);
        },
      })
    ).rejects.toThrow("corte simulado en filas");
    expect(carpeta(join(repo, "drizzle"))).toEqual(antes.archivos);
    expect(await filasDe(con)).toEqual(antes.filas);
    expect(existsSync(join(repo, CARPETA_PREVIA))).toBe(false);

    // 2. El proceso muere en el mismo punto (sin catch): la conexión se corta,
    //    MySQL deshace la transacción, y la próxima corrida vuelve drizzle/.
    const efimera = await conectar(base);
    await expect(
      adoptarHistorial({
        cwd: repo,
        con: efimera,
        objetivo,
        aplicar: true,
        backup: null,
        cortar: (etapa) => {
          if (etapa === "filas") throw new CorteSimulado(etapa, false);
        },
      })
    ).rejects.toThrow("corte simulado en filas");
    efimera.destroy();
    expect(existsSync(join(repo, CARPETA_PREVIA))).toBe(true);

    const despues = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: false, backup: null });
    expect(despues.recuperado).toBe(true);
    expect(informe(despues, false)).toContain("adopción cortada a la mitad");
    expect(carpeta(join(repo, "drizzle"))).toEqual(antes.archivos);
    expect(await filasDe(con)).toEqual(antes.filas);
    await con.end();
  });

  it("una corrida que muere después del COMMIT queda adoptada: la próxima no vuelve el drizzle/ viejo", async () => {
    const { repo, objetivo, base, con } = await tienda("corte_commit", propiasDeOeste());
    backupDe(repo, base);
    const antes = await filasDe(con);

    await expect(
      adoptarHistorial({
        cwd: repo,
        con,
        objetivo,
        aplicar: true,
        backup: null,
        cortar: (etapa) => {
          if (etapa === "confirmado") throw new CorteSimulado(etapa, false);
        },
      })
    ).rejects.toThrow("corte simulado en confirmado");
    expect(existsSync(join(repo, CARPETA_PREVIA))).toBe(true);
    const adoptados = carpeta(join(repo, "drizzle"));
    const filas = await filasDe(con);
    expect(filas).not.toEqual(antes);

    const despues = await adoptarHistorial({ cwd: repo, con, objetivo, aplicar: false, backup: null });
    expect(despues.recuperado).toBe(false);
    expect(despues.decision.estado).toBe("ya-adoptada");
    expect(existsSync(join(repo, CARPETA_PREVIA))).toBe(false);
    expect(carpeta(join(repo, "drizzle"))).toEqual(adoptados);
    expect(await filasDe(con)).toEqual(filas);
    await con.end();
  });
});
