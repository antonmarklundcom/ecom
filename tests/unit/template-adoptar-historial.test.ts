import { mkdtempSync, rmSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  completarPlan,
  esquemaDeFilas,
  esquemaDeSnapshot,
  evidenciaDeBackup,
  motorDeVersion,
  hashDeMigracion,
  normalizarDefault,
  normalizarTipo,
  parseArgs,
  planificarAdopcion,
  sentenciaCondicional,
  sentenciasDeDatos,
  type Esquema,
  type FilasDeEsquema,
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

type Col = {
  name: string;
  type: string;
  notNull?: boolean;
  default?: unknown;
  primaryKey?: boolean;
  autoincrement?: boolean;
  onUpdate?: boolean;
};

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
    expect(normalizarTipo("longtext", "mariadb", true)).toBe("json");
    // Sin el CHECK json_valid() es un longtext de verdad.
    expect(normalizarTipo("longtext", "mariadb")).toBe("longtext");
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

/**
 * Las filas de `information_schema` con la forma que devuelven de verdad
 * MariaDB 10.11 (la del job "Tests en MariaDB", run 43118996858) y MySQL 8.4
 * para las mismas columnas del template. Las dos tienen que dar el esquema
 * del snapshot de drizzle, clave por clave.
 */
describe("information_schema de MariaDB 10.11 y de MySQL 8 → el esquema del snapshot", () => {
  const ESTADOS = "enum('pending','paid','failed','refunded')";
  const ID_AI: Col = { name: "id", type: "int", notNull: true, autoincrement: true };
  const SNAP = snap("real", {
    payments: [
      ID_AI,
      { name: "status", type: ESTADOS, notNull: true, default: "'pending'" },
      { name: "raw_payload", type: "json" },
      { name: "created_at", type: "timestamp", notNull: true, default: "(now())" },
      { name: "updated_at", type: "timestamp", notNull: true, default: "(now())", onUpdate: true },
    ],
    orders: [
      ID_AI,
      { name: "customer_email", type: "varchar(200)" },
      { name: "times_used", type: "int unsigned", notNull: true, default: 0 },
      { name: "is_gift", type: "boolean", notNull: true, default: false },
      { name: "doc_type", type: "enum('RUC','CI','NINGUNO')", notNull: true, default: "'NINGUNO'" },
    ],
    shipping_zones: [ID_AI, { name: "cities", type: "json", notNull: true }],
  });

  type FilaCol = FilasDeEsquema["columnas"][number];
  const col = (t: string, c: string, tipo: string, nulo: "YES" | "NO", def: string | null, extra = ""): FilaCol => ({
    t,
    c,
    tipo,
    nulo,
    def,
    extra,
  });
  const comun = (): Omit<FilasDeEsquema, "columnas" | "checks" | "clausulas"> => ({
    tablas: [{ t: "payments" }, { t: "orders" }, { t: "shipping_zones" }, { t: "__drizzle_migrations" }],
    indices: ["payments", "orders", "shipping_zones"].map((t) => ({ t, i: "PRIMARY", nu: 0, c: "id", s: 1, ty: "BTREE" })),
    reglas: [],
    columnasFk: [],
  });

  const MARIADB: FilasDeEsquema = {
    ...comun(),
    columnas: [
      col("payments", "id", "int(11)", "NO", null, "auto_increment"),
      col("payments", "status", ESTADOS, "NO", "'pending'"),
      col("payments", "raw_payload", "longtext", "YES", "NULL"),
      col("payments", "created_at", "timestamp", "NO", "current_timestamp()"),
      col("payments", "updated_at", "timestamp", "NO", "current_timestamp()", "on update current_timestamp()"),
      col("orders", "id", "int(11)", "NO", null, "auto_increment"),
      col("orders", "customer_email", "varchar(200)", "YES", "NULL"),
      col("orders", "times_used", "int(10) unsigned", "NO", "0"),
      col("orders", "is_gift", "tinyint(1)", "NO", "0"),
      col("orders", "doc_type", "enum('RUC','CI','NINGUNO')", "NO", "'NINGUNO'"),
      col("shipping_zones", "id", "int(11)", "NO", null, "auto_increment"),
      col("shipping_zones", "cities", "longtext", "NO", null),
    ],
    // El CHECK que MariaDB le agrega a cada columna json: se llama como la columna.
    checks: [
      { t: "payments", n: "raw_payload" },
      { t: "shipping_zones", n: "cities" },
    ],
    clausulas: [
      { t: "payments", n: "raw_payload", cl: "json_valid(`raw_payload`)" },
      { t: "shipping_zones", n: "cities", cl: "json_valid(`cities`)" },
    ],
  };

  const MYSQL: FilasDeEsquema = {
    ...comun(),
    columnas: [
      col("payments", "id", "int", "NO", null, "auto_increment"),
      col("payments", "status", ESTADOS, "NO", "pending"),
      col("payments", "raw_payload", "json", "YES", null),
      col("payments", "created_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED"),
      col("payments", "updated_at", "timestamp", "NO", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"),
      col("orders", "id", "int", "NO", null, "auto_increment"),
      col("orders", "customer_email", "varchar(200)", "YES", null),
      col("orders", "times_used", "int unsigned", "NO", "0"),
      col("orders", "is_gift", "tinyint(1)", "NO", "0"),
      col("orders", "doc_type", "enum('RUC','CI','NINGUNO')", "NO", "NINGUNO"),
      col("shipping_zones", "id", "int", "NO", null, "auto_increment"),
      col("shipping_zones", "cities", "json", "NO", null),
    ],
    checks: [],
    clausulas: [],
  };

  const ordenado = (e: Esquema) => [...e].sort(([a], [b]) => a.localeCompare(b));
  const conColumnas = (f: FilasDeEsquema, cambios: Record<string, Partial<FilaCol>>): FilasDeEsquema => ({
    ...f,
    columnas: f.columnas.map((c) => ({ ...c, ...cambios[`${c.t}.${c.c}`] })),
  });

  it("las filas de MariaDB y las de MySQL dan el mismo esquema que el snapshot", () => {
    const esperado = ordenado(esquemaDeSnapshot(SNAP));
    expect(ordenado(esquemaDeFilas(MARIADB, "mariadb"))).toEqual(esperado);
    expect(ordenado(esquemaDeFilas(MYSQL, "mysql"))).toEqual(esperado);
    // Lo que daba antes leer MariaDB como si fuera MySQL (los tres grupos del run rojo).
    const comoMysql = esquemaDeFilas(MARIADB, "mysql");
    expect(comoMysql.get("columna orders.customer_email")).toBe("varchar(200) DEFAULT 'NULL'");
    expect(comoMysql.get("columna payments.status")).toBe(`${ESTADOS} NOT NULL DEFAULT '''pending'''`);
    expect(comoMysql.get("columna payments.raw_payload")).toBe("longtext DEFAULT 'NULL'");
  });

  it("grupo NULL: el texto 'NULL' de default no se confunde con no tener default", () => {
    const conTexto = conColumnas(MARIADB, { "orders.customer_email": { def: "'NULL'" } });
    expect(esquemaDeFilas(conTexto, "mariadb").get("columna orders.customer_email")).toBe("varchar(200) DEFAULT 'NULL'");
    // MySQL 8 da el texto sin comillas y la falta de default como NULL de SQL.
    const conTextoMysql = conColumnas(MYSQL, { "orders.customer_email": { def: "NULL" } });
    expect(esquemaDeFilas(conTextoMysql, "mysql").get("columna orders.customer_email")).toBe("varchar(200) DEFAULT 'NULL'");
    expect(normalizarDefault("'NULL'", "mariadb")).toBe("'NULL'");
    expect(normalizarDefault("NULL", "mysql")).toBe("'NULL'");
  });

  it("grupo comillas: el texto que trae comillas propias no se confunde con el que no", () => {
    expect(normalizarDefault("'''pending'''", "mariadb")).toBe("'''pending'''");
    expect(normalizarDefault("'''pending'''", "mariadb")).not.toBe(normalizarDefault("'pending'", "drizzle"));
    expect(normalizarDefault("'it''s'", "mariadb")).toBe(normalizarDefault("it's", "mysql"));
    // Un número de MariaDB va sin comillas; el texto '0' con ellas: los dos son '0', como en drizzle.
    expect(normalizarDefault("'0'", "mariadb")).toBe("'0'");
  });

  it("grupo json: sólo el longtext con su CHECK json_valid() es json", () => {
    const sinCheck: FilasDeEsquema = { ...MARIADB, checks: [], clausulas: [] };
    const e = esquemaDeFilas(sinCheck, "mariadb");
    expect(e.get("columna payments.raw_payload")).toBe("longtext");
    expect(e.get("columna shipping_zones.cities")).toBe("longtext NOT NULL");

    // El CHECK de otra columna no hace json a ésta.
    const otraColumna: FilasDeEsquema = {
      ...MARIADB,
      clausulas: [{ t: "payments", n: "raw_payload", cl: "json_valid(`otra`)" }],
    };
    expect(esquemaDeFilas(otraColumna, "mariadb").get("columna payments.raw_payload")).toBe("longtext");
    // Ni el de otra tabla.
    const otraTabla: FilasDeEsquema = {
      ...MARIADB,
      clausulas: [{ t: "orders", n: "raw_payload", cl: "json_valid(`raw_payload`)" }],
    };
    expect(esquemaDeFilas(otraTabla, "mariadb").get("columna payments.raw_payload")).toBe("longtext");
    // Un CHECK que no es exactamente json_valid(col) tampoco.
    const otraCondicion: FilasDeEsquema = {
      ...MARIADB,
      clausulas: [{ t: "payments", n: "raw_payload", cl: "json_valid(`raw_payload`) or `raw_payload` is null" }],
    };
    const conOtra = esquemaDeFilas(otraCondicion, "mariadb");
    expect(conOtra.get("columna payments.raw_payload")).toBe("longtext");
    expect(conOtra.get("check payments.raw_payload")).toBe("existe");

    // json_valid() sobre un text no lo hace json, y su CHECK queda como check.
    const sobreText = conColumnas(MARIADB, { "payments.raw_payload": { tipo: "text" } });
    const t = esquemaDeFilas(sobreText, "mariadb");
    expect(t.get("columna payments.raw_payload")).toBe("text");
    expect(t.get("check payments.raw_payload")).toBe("existe");

    // Un CHECK con nombre propio hace json a la columna pero sigue siendo un check de la tienda.
    const nombrado: FilasDeEsquema = {
      ...MARIADB,
      checks: [...MARIADB.checks.filter((c) => c.n !== "raw_payload"), { t: "payments", n: "pagos_json" }],
      clausulas: [
        ...MARIADB.clausulas.filter((c) => c.n !== "raw_payload"),
        { t: "payments", n: "pagos_json", cl: "json_valid(`raw_payload`)" },
      ],
    };
    const n = esquemaDeFilas(nombrado, "mariadb");
    expect(n.get("columna payments.raw_payload")).toBe("json");
    expect(n.get("check payments.pagos_json")).toBe("existe");
    expect(n.has("check payments.raw_payload")).toBe(false);

    // En MySQL un longtext es siempre longtext.
    const mysqlLongtext = conColumnas(MYSQL, { "payments.raw_payload": { tipo: "longtext" } });
    expect(esquemaDeFilas(mysqlLongtext, "mysql").get("columna payments.raw_payload")).toBe("longtext");
  });

  it("el motor sale de VERSION(); un MariaDB viejo o ilegible se niega", () => {
    expect(motorDeVersion("8.4.11")).toBe("mysql");
    expect(motorDeVersion("8.0.36-0ubuntu0.22.04.1")).toBe("mysql");
    expect(motorDeVersion("10.11.10-MariaDB-ubu2204")).toBe("mariadb");
    expect(motorDeVersion("10.6.21-MariaDB-log")).toBe("mariadb");
    expect(motorDeVersion("11.4.3-MariaDB")).toBe("mariadb");
    expect(motorDeVersion("5.5.5-10.11.6-MariaDB")).toBe("mariadb");
    expect(motorDeVersion("10.2.7-MariaDB")).toBe("mariadb");
    expect(() => motorDeVersion("10.2.6-MariaDB")).toThrow(/10\.2\.7/);
    expect(() => motorDeVersion("10.1.48-MariaDB-0ubuntu0.18.04.1")).toThrow(/10\.2\.7/);
    expect(() => motorDeVersion("MariaDB")).toThrow(/10\.2\.7/);
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
