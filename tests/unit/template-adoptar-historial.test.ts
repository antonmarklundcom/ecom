import { mkdtempSync, rmSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  completarPlan,
  esquemaDeSnapshot,
  evidenciaDeBackup,
  hashDeMigracion,
  normalizarDefault,
  normalizarTipo,
  parseArgs,
  planificarAdopcion,
  sentenciaCondicional,
  sentenciasDeDatos,
  type Esquema,
  type Historia,
  type Migracion,
  type Snapshot,
} from "../../scripts/template-adoptar-historial";
import { journalSinChoque } from "../../scripts/template-migrations";

/**
 * La parte pura de `template:adoptar-historial` (O24): normalizar el esquema
 * de drizzle y de MySQL/MariaDB al mismo texto, y decidir con historias y
 * esquemas armados a mano. Contra MySQL de verdad:
 * tests/integration/template-adoptar-historial.test.ts.
 */

type Col = { name: string; type: string; notNull?: boolean; default?: unknown; primaryKey?: boolean };

function snap(id: string, tablas: Record<string, Col[]>): Snapshot {
  return {
    id,
    prevId: "",
    tables: Object.fromEntries(
      Object.entries(tablas).map(([t, cols]) => [
        t,
        {
          name: t,
          columns: Object.fromEntries(cols.map((c) => [c.name, { primaryKey: false, notNull: false, ...c }])),
          indexes: {},
          foreignKeys: {},
          compositePrimaryKeys: { [`${t}_id`]: { name: `${t}_id`, columns: ["id"] } },
          uniqueConstraints: {},
          checkConstraint: {},
        },
      ])
    ),
  };
}

const ID: Col = { name: "id", type: "int", notNull: true };

function mig(idx: number, tag: string, when: number, snapshot: Snapshot, sql = `-- ${tag}`): Migracion {
  return {
    entrada: { idx, version: "5", when, tag, breakpoints: true },
    sql,
    hash: hashDeMigracion(sql),
    snapshot,
  };
}

function historia(migraciones: Migracion[]): Historia {
  return {
    journal: JSON.stringify({ version: "7", dialect: "mysql", entries: migraciones.map((m) => m.entrada) }),
    migraciones,
  };
}

const S0 = snap("s0", { orders: [ID] });
const S1 = snap("s1", { orders: [ID, { name: "tracking", type: "varchar(120)" }] });
const S2 = snap("s2", { orders: [ID, { name: "tracking", type: "varchar(120)" }, { name: "notes", type: "text" }] });
const S3 = snap("s3", {
  orders: [ID, { name: "tracking", type: "varchar(120)" }, { name: "notes", type: "text" }],
  job_runs: [ID],
});

const BASE = mig(0, "0000_inicio", 1_000, S0);
const TEMPLATE = historia([
  BASE,
  mig(1, "0001_tracking", 2_000, S1),
  mig(2, "0002_notas", 3_000, S2, "ALTER TABLE `orders` ADD `notes` text;--> statement-breakpoint\nUPDATE `orders` SET `notes` = '';"),
  mig(3, "0003_jobs", 4_000, S3),
]);

function filasDe(h: Historia) {
  return h.migraciones.map((m, i) => ({ id: i + 1, hash: m.hash, createdAt: m.entrada.when }));
}

function vivoDe(s: Snapshot, extra: Record<string, string> = {}): Esquema {
  const e = esquemaDeSnapshot(s);
  for (const [k, v] of Object.entries(extra)) e.set(k, v);
  return e;
}

describe("normalizar el esquema", () => {
  it("tipos de drizzle, MySQL 8 y MariaDB al mismo texto", () => {
    expect(normalizarTipo("boolean")).toBe("tinyint(1)");
    expect(normalizarTipo("tinyint(1)")).toBe("tinyint(1)");
    expect(normalizarTipo("int(11)", "mariadb")).toBe("int");
    expect(normalizarTipo("bigint(20) unsigned", "mariadb")).toBe("bigint unsigned");
    expect(normalizarTipo("tinyint(3) unsigned", "mariadb")).toBe("tinyint unsigned");
    expect(normalizarTipo("longtext", "mariadb")).toBe("json");
    expect(normalizarTipo("longtext", "mysql")).toBe("longtext");
    expect(normalizarTipo("enum('RUC','CI')")).toBe("enum('RUC','CI')");
    expect(normalizarTipo("VARCHAR(120)")).toBe("varchar(120)");
  });

  it("defaults: literales entre comillas, expresiones sin, igual de los tres lados", () => {
    expect(normalizarDefault(0, "drizzle")).toBe("'0'");
    expect(normalizarDefault("0", "mysql")).toBe("'0'");
    expect(normalizarDefault("0", "mariadb")).toBe("'0'");
    expect(normalizarDefault(true, "drizzle")).toBe("'1'");
    expect(normalizarDefault("1", "mysql")).toBe("'1'");
    expect(normalizarDefault("'pending'", "drizzle")).toBe("'pending'");
    expect(normalizarDefault("pending", "mysql")).toBe("'pending'");
    expect(normalizarDefault("'pending'", "mariadb")).toBe("'pending'");
    expect(normalizarDefault("(now())", "drizzle")).toBe("CURRENT_TIMESTAMP");
    expect(normalizarDefault("CURRENT_TIMESTAMP", "mysql", true)).toBe("CURRENT_TIMESTAMP");
    expect(normalizarDefault("current_timestamp()", "mariadb")).toBe("CURRENT_TIMESTAMP");
    expect(normalizarDefault("CURRENT_TIMESTAMP(3)", "mysql", true)).toBe("CURRENT_TIMESTAMP(3)");
    expect(normalizarDefault("NULL", "mariadb")).toBeNull();
    expect(normalizarDefault(null, "mysql")).toBeNull();
    expect(normalizarDefault(undefined, "drizzle")).toBeNull();
  });
});

describe("planificarAdopcion", () => {
  it("la tienda portó la 0001 a mano: se marca aplicada, el resto queda pendiente", () => {
    const tienda = historia([BASE, mig(1, "0001_tienda_tracking", 2_500, S1)]);
    const plan = planificarAdopcion({ tienda, template: TEMPLATE, filas: filasDe(tienda), vivo: vivoDe(S1) });
    expect(plan.estado).toBe("plan");
    if (plan.estado !== "plan") return;
    expect(plan.comun).toBe(1);
    expect(plan.reemplazadas).toEqual(["0001_tienda_tracking"]);
    expect(plan.template.map((m) => `${m.tag}:${m.estado}`)).toEqual([
      "0001_tracking:aplicada",
      "0002_notas:pendiente",
      "0003_jobs:pendiente",
    ]);
    expect(plan.filas.map((f) => f.tag)).toEqual(["0000_inicio", "0001_tracking"]);
    expect(plan.propios).toEqual([]);
  });

  it("lo que es sólo de la tienda queda como objeto propio; lo de fuera de drizzle se lista aparte", () => {
    const S2t = snap("s2t", {
      orders: [ID, { name: "tracking", type: "varchar(120)" }, { name: "notes", type: "text" }, { name: "pais", type: "varchar(60)" }],
    });
    const tienda = historia([BASE, mig(1, "0001_tienda", 2_500, S2t)]);
    const plan = planificarAdopcion({
      tienda,
      template: TEMPLATE,
      filas: filasDe(tienda),
      vivo: vivoDe(S2t, { "índice orders.ft_orders": "FULLTEXT (notes)" }),
    });
    expect(plan.estado).toBe("plan");
    if (plan.estado !== "plan") return;
    expect(plan.template.map((m) => m.estado)).toEqual(["aplicada", "aplicada", "pendiente"]);
    expect(plan.propios).toEqual([{ clave: "columna orders.pais", definicion: "varchar(60)" }]);
    expect(plan.fueraDeDrizzle).toEqual(["índice orders.ft_orders"]);
    // La 0002 trae un UPDATE que en esta base nunca corrió: se avisa.
    expect(plan.avisos.join("\n")).toContain("UPDATE `orders` SET `notes` = ''");
  });

  it("una migración del template a medias, o con otra definición, se rechaza con la diferencia", () => {
    const S1raro = snap("s1r", { orders: [ID, { name: "tracking", type: "varchar(80)" }] });
    const tienda = historia([BASE, mig(1, "0001_tienda", 2_500, S1raro)]);
    const r = planificarAdopcion({ tienda, template: TEMPLATE, filas: filasDe(tienda), vivo: vivoDe(S1raro) });
    expect(r.estado).toBe("rechazo");
    if (r.estado !== "rechazo") return;
    expect(r.motivos.join("\n")).toContain(
      "columna orders.tracking: en la base `varchar(80)`; tras 0000_inicio sería no existe (0001_tracking la deja `varchar(120)`)"
    );

    // Tiene la 0003 sin la 0002: drizzle no podría aplicar la 0002 después.
    const S3sin2 = snap("s3s", { orders: [ID, { name: "tracking", type: "varchar(120)" }], job_runs: [ID] });
    const saltada = historia([BASE, mig(1, "0001_tienda", 2_500, S3sin2)]);
    const r2 = planificarAdopcion({ tienda: saltada, template: TEMPLATE, filas: filasDe(saltada), vivo: vivoDe(S3sin2) });
    expect(r2.estado).toBe("rechazo");
    if (r2.estado !== "rechazo") return;
    expect(r2.motivos.join("\n")).toMatch(/0002_notas: no está/);
    expect(r2.motivos.join("\n")).toMatch(/0003_jobs: ya está/);
  });

  it("se niega si la base no tiene exactamente las migraciones de la tienda o no es su esquema", () => {
    const tienda = historia([BASE, mig(1, "0001_tienda", 2_500, S1)]);
    const pendiente = planificarAdopcion({ tienda, template: TEMPLATE, filas: filasDe(tienda).slice(0, 1), vivo: vivoDe(S1) });
    expect(pendiente.estado === "rechazo" && pendiente.motivos[0]).toMatch(/pendientes: 0001_tienda/);

    const aMano = planificarAdopcion({
      tienda,
      template: TEMPLATE,
      filas: filasDe(tienda),
      vivo: vivoDe(S1, { "columna orders.tracking": "varchar(200)" }),
    });
    expect(aMano.estado === "rechazo" && aMano.motivos[0]).toContain(
      "columna orders.tracking: drizzle/ de la tienda dice `varchar(120)`, la base tiene `varchar(200)`"
    );
  });

  it("una tienda que cambió un objeto del template que el template no vuelve a tocar se rechaza", () => {
    const S1id = snap("s1i", { orders: [{ name: "id", type: "bigint", notNull: true }, { name: "tracking", type: "varchar(120)" }] });
    const tienda = historia([BASE, mig(1, "0001_tienda", 2_500, S1id)]);
    const r = planificarAdopcion({ tienda, template: TEMPLATE, filas: filasDe(tienda), vivo: vivoDe(S1id) });
    expect(r.estado === "rechazo" && r.motivos[0]).toContain("columna orders.id: el template la tiene como `int NOT NULL`");
  });

  it("con toda la historia del template ya adentro no hay nada que hacer", () => {
    const adoptada = historia([...TEMPLATE.migraciones, mig(4, "0004_propias_de_la_tienda", 5_000, S3)]);
    const r = planificarAdopcion({ tienda: adoptada, template: TEMPLATE, filas: filasDe(TEMPLATE), vivo: vivoDe(S3) });
    expect(r).toMatchObject({ estado: "ya-adoptada", comun: 4, propias: ["0004_propias_de_la_tienda"], pendientes: ["0004_propias_de_la_tienda"] });
  });

  it("sin pendientes del template, la migración propia se marca aplicada; con pendientes, no", async () => {
    const S3t = snap("s3t", {
      orders: [ID, { name: "tracking", type: "varchar(120)" }, { name: "notes", type: "text" }, { name: "pais", type: "varchar(60)" }],
      job_runs: [ID],
    });
    const tienda = historia([BASE, mig(1, "0001_tienda", 2_500, S3t)]);
    const previa = planificarAdopcion({ tienda, template: TEMPLATE, filas: filasDe(tienda), vivo: vivoDe(S3t) });
    expect(previa.estado).toBe("plan");
    if (previa.estado !== "plan") return;
    const generar = async () => ["ALTER TABLE `orders` ADD `pais` varchar(60);"];
    const plan = await completarPlan(previa, { template: TEMPLATE, tienda, ahora: 10_000, id: "nuevo", generar });
    expect(plan.nueva?.entrada).toMatchObject({ idx: 4, tag: "0004_propias_de_la_tienda", when: 10_000 });
    expect(plan.nueva?.snapshot).toMatchObject({ id: "nuevo", prevId: "s3" });
    expect(plan.nueva?.snapshot.tables.orders?.columns.pais).toMatchObject({ type: "varchar(60)" });
    expect(plan.filas.map((f) => f.tag)).toEqual([...TEMPLATE.migraciones.map((m) => m.entrada.tag), "0004_propias_de_la_tienda"]);
    expect(plan.filas.at(-1)?.hash).toBe(hashDeMigracion(plan.nueva!.sql));

    // El `when` de la propia nunca queda antes del último del template.
    const vieja = await completarPlan(previa, { template: TEMPLATE, tienda, ahora: 1, id: "x", generar });
    expect(vieja.nueva?.entrada.when).toBe(4_001);
  });
});

describe("el SQL de la migración propia", () => {
  it("cada sentencia corre sólo si el objeto no existe, con comillas escapadas", () => {
    const partes = sentenciaCondicional(
      "SELECT COUNT(*) FROM information_schema.columns WHERE column_name = 'kind'",
      "ALTER TABLE `t` ADD `kind` enum('a','b') DEFAULT 'a';"
    );
    expect(partes[0]).toBe(
      "SET @adoptar_sql := IF((SELECT COUNT(*) FROM information_schema.columns WHERE column_name = 'kind') = 0, 'ALTER TABLE `t` ADD `kind` enum(''a'',''b'') DEFAULT ''a''', 'DO 0');"
    );
    expect(partes.slice(1)).toEqual(["PREPARE adoptar_stmt FROM @adoptar_sql;", "EXECUTE adoptar_stmt;", "DEALLOCATE PREPARE adoptar_stmt;"]);
  });

  it("las sentencias de datos de una migración se reconocen", () => {
    expect(sentenciasDeDatos("ALTER TABLE x ADD y int;--> statement-breakpoint\n UPDATE x SET y = 1;")).toEqual([
      "UPDATE x SET y = 1;",
    ]);
  });
});

describe("el backup de la última hora", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function dump(dir: string, nombre: string, base: string, hace: number, ahora: Date): string {
    mkdirSync(join(dir, "backups"), { recursive: true });
    const archivo = join(dir, "backups", nombre);
    writeFileSync(archivo, gzipSync(`-- MySQL dump 10.13\n-- Host: localhost    Database: ${base}\n`));
    const t = new Date(ahora.getTime() - hace * 60_000);
    utimesSync(archivo, t, t);
    return archivo;
  }

  it("vale un dump de esta base de hace menos de una hora; uno viejo o de otra base, no", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecom-backup-"));
    dirs.push(dir);
    const ahora = new Date("2026-11-11T06:00:00Z");
    expect(evidenciaDeBackup({ cwd: dir, base: "u1_tienda", archivo: null, ahora, cronOk: null }).ok).toBe(false);

    dump(dir, "u1_tienda-viejo.sql.gz", "u1_tienda", 90, ahora);
    expect(evidenciaDeBackup({ cwd: dir, base: "u1_tienda", archivo: null, ahora, cronOk: null }).ok).toBe(false);

    const otra = dump(dir, "otra.sql.gz", "u1_otra", 5, ahora);
    expect(evidenciaDeBackup({ cwd: dir, base: "u1_tienda", archivo: otra, ahora, cronOk: null }).ok).toBe(false);

    dump(dir, "u1_tienda-nuevo.sql.gz", "u1_tienda", 10, ahora);
    const ok = evidenciaDeBackup({ cwd: dir, base: "u1_tienda", archivo: null, ahora, cronOk: null });
    expect(ok).toMatchObject({ ok: true });
    expect(ok.ok && ok.detalle).toContain("hace 10 min");
  });

  it("vale también la corrida OK del cron de backup de la última hora", () => {
    const dir = mkdtempSync(join(tmpdir(), "ecom-backup-"));
    dirs.push(dir);
    const ahora = new Date("2026-11-11T06:00:00Z");
    const hace = (m: number) => new Date(ahora.getTime() - m * 60_000);
    expect(evidenciaDeBackup({ cwd: dir, base: "b", archivo: null, ahora, cronOk: hace(20) }).ok).toBe(true);
    expect(evidenciaDeBackup({ cwd: dir, base: "b", archivo: null, ahora, cronOk: hace(61) }).ok).toBe(false);
  });
});

describe("journalSinChoque (template:sync en una tienda que adoptó)", () => {
  const j = (tags: string[]) =>
    JSON.stringify({
      version: "7",
      dialect: "mysql",
      entries: tags.map((tag, idx) => ({ idx, version: "5", when: (idx + 1) * 1000, tag, breakpoints: true })),
    });

  it("si uno es el otro más entradas al final, gana el más largo", () => {
    const template = j(["0000_a", "0001_b"]);
    const tienda = j(["0000_a", "0001_b", "0002_propias_de_la_tienda"]);
    expect(journalSinChoque(tienda, template)).toBe(tienda);
    expect(journalSinChoque(j(["0000_a"]), template)).toBe(template);
  });

  it("si divergen, no decide: queda el merge de siempre", () => {
    expect(journalSinChoque(j(["0000_a", "0001_tienda"]), j(["0000_a", "0001_b"]))).toBeNull();
    expect(journalSinChoque("<<<<<<< roto", j(["0000_a"]))).toBeNull();
  });
});

describe("parseArgs", () => {
  it("ensayo por defecto; --aplicar, --hasta, --backup", () => {
    expect(parseArgs([])).toMatchObject({ aplicar: false, remoto: "template", rama: "main" });
    expect(parseArgs(["--", "--aplicar", "--hasta", "abc", "--backup", "x.sql.gz"])).toMatchObject({
      aplicar: true,
      hasta: "abc",
      backup: "x.sql.gz",
    });
    expect(() => parseArgs(["--forzar"])).toThrow("no conozco");
  });
});
