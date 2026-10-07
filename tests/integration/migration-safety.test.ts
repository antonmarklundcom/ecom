import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getPool } from "@/db";
import { migrateWithBoundedLocks } from "@/db/migrate";
import { migrationStatus } from "@/db/migration-status";
import * as schema from "@/db/schema";
import { dumpDatabase } from "@/domain/backup";
import { tablesForMigration } from "@/domain/backup-format";
import { recordJobRun } from "@/domain/job-runs";
import { inspectBackup } from "@/domain/restore-backup";
import { resetRateLimits } from "@/lib/rate-limit";

import {
  TEST_DATABASE_URL,
  closeTestDb,
  getTestDb,
  hasTestDb,
  resetTables,
} from "../helpers/db";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md B2–B5: lo que un deploy necesita saber
 * de la base antes de servir código nuevo, y que un backup o una migración no
 * se cuelguen ni fallen en la ventana entre deploy y migración.
 */

type Journal = {
  version: string;
  dialect: string;
  entries: { idx: number; when: number; tag: string }[];
};

async function journal(): Promise<Journal> {
  return JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8")
  ) as Journal;
}

/** Una copia de `drizzle/` con las migraciones hasta `ultima` (incluida) y `extra` al final. */
async function carpetaDeMigraciones(
  ultima: number,
  extra?: { tag: string; sql: string }
): Promise<string> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "ecom-migraciones-test-"));
  await mkdir(path.join(carpeta, "meta"));
  const completo = await journal();
  const entries = completo.entries.slice(0, ultima + 1);
  for (const entry of entries) {
    await copyFile(
      path.join("drizzle", `${entry.tag}.sql`),
      path.join(carpeta, `${entry.tag}.sql`)
    );
  }
  if (extra) {
    await writeFile(path.join(carpeta, `${extra.tag}.sql`), extra.sql);
    entries.push({
      idx: entries.length,
      when: Date.now(),
      tag: extra.tag,
    } as never);
  }
  await writeFile(
    path.join(carpeta, "meta", "_journal.json"),
    JSON.stringify({
      ...completo,
      entries: entries.map((e) => ({ version: "5", breakpoints: true, ...e })),
    })
  );
  return carpeta;
}

async function conexionA(base: string): Promise<mysql.Connection> {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${base}`;
  return mysql.createConnection({
    uri: url.toString(),
    multipleStatements: true,
  });
}

describe.skipIf(!hasTestDb)("estado de las migraciones (B2)", () => {
  beforeEach(() => {
    getTestDb();
  });
  afterAll(closeTestDb);

  async function ultimaFila(): Promise<{
    id: number;
    hash: string;
    created_at: string;
  }> {
    const [rows] = await getPool().query(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 1"
    );
    return (rows as { id: number; hash: string; created_at: string }[])[0]!;
  }

  it("con todo aplicado no hay pendientes ni filas ajenas", async () => {
    const status = await migrationStatus();
    const { entries } = await journal();
    expect(status).toMatchObject({
      current: true,
      pending: [],
      skipped: [],
      foreign: 0,
      expected: entries.length,
    });
  });

  it("una migración sin aplicar figura pendiente en el estado, el health y /api/version", async () => {
    const fila = await ultimaFila();
    const { entries } = await journal();
    await getPool().query("DELETE FROM __drizzle_migrations WHERE id = ?", [
      fila.id,
    ]);
    try {
      const status = await migrationStatus();
      expect(status.current).toBe(false);
      expect(status.pending).toEqual([entries.at(-1)!.tag]);

      const { GET: health } = await import("../../src/app/api/health/route");
      const body = (await (await health()).json()) as Record<string, unknown>;
      expect(body.migrations).toBe(false);

      resetRateLimits();
      const secret = "secreto-de-cron-para-los-tests-1234567890";
      vi.stubEnv("CRON_SECRET", secret);
      const { GET: version } = await import("../../src/app/api/version/route");
      const respuesta = await version(
        new Request("http://localhost/api/version", {
          headers: { authorization: `Bearer ${secret}` },
        })
      );
      expect(await respuesta.json()).toMatchObject({
        migrations: { current: false, pending: [entries.at(-1)!.tag] },
      });
    } finally {
      vi.unstubAllEnvs();
      await getPool().query(
        "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)",
        [fila.id, fila.hash, fila.created_at]
      );
    }
    expect((await migrationStatus()).current).toBe(true);
  });

  it("una fila que no es de este journal se reporta, y una pendiente más vieja que la última aplicada se saltearía", async () => {
    const fila = await ultimaFila();
    const { entries } = await journal();
    const ultima = entries.at(-1)!;
    // La base aplicó algo ajeno *después* y le falta la última del journal:
    // drizzle compara contra el `created_at` más nuevo y no la correría nunca.
    await getPool().query("DELETE FROM __drizzle_migrations WHERE id = ?", [
      fila.id,
    ]);
    await getPool().query(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('ajena', ?)",
      [ultima.when + 1_000]
    );
    try {
      const status = await migrationStatus();
      expect(status.current).toBe(false);
      expect(status.foreign).toBe(1);
      expect(status.skipped).toEqual([ultima.tag]);
    } finally {
      await getPool().query(
        "DELETE FROM __drizzle_migrations WHERE hash = 'ajena'"
      );
      await getPool().query(
        "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)",
        [fila.id, fila.hash, fila.created_at]
      );
    }
  });
});

describe.skipIf(!hasTestDb)(
  "una migración no espera un año un lock (B3)",
  () => {
    afterAll(closeTestDb);

    it("con una transacción abierta sobre la tabla, falla rápido en vez de colgarse", async () => {
      getTestDb();
      const { entries } = await journal();
      const carpeta = await carpetaDeMigraciones(entries.length - 1, {
        tag: `${String(entries.length).padStart(4, "0")}_lock_probe`,
        sql: "ALTER TABLE `products` ADD `lock_probe` int;",
      });
      const base = new URL(TEST_DATABASE_URL!).pathname.slice(1);
      const bloqueo = await conexionA(base);
      const migrador = await conexionA(base);
      try {
        await bloqueo.query("START TRANSACTION");
        await bloqueo.query("SELECT id FROM products LIMIT 1");

        const inicio = Date.now();
        const error = await migrateWithBoundedLocks(migrador, {
          migrationsFolder: carpeta,
          lockWaitTimeoutSeconds: 2,
        }).then(
          () => null,
          (fallo: unknown) => fallo as { cause?: { code?: string } }
        );
        // drizzle envuelve el error de MySQL ("Failed query: …"); la causa
        // es la espera del lock, no otra cosa.
        expect(error?.cause?.code).toBe("ER_LOCK_WAIT_TIMEOUT");
        expect(Date.now() - inicio).toBeLessThan(20_000);
      } finally {
        await bloqueo.query("ROLLBACK").catch(() => {});
        await bloqueo.end();
        await migrador.end();
        await rm(carpeta, { recursive: true, force: true });
      }
      const [columnas] = await getPool().query(
        "SHOW COLUMNS FROM products LIKE 'lock_probe'"
      );
      expect(columnas).toHaveLength(0);
      expect((await migrationStatus()).current).toBe(true);
    });
  }
);

describe.skipIf(!hasTestDb)(
  "backup de una base todavía no migrada (B4)",
  () => {
    beforeEach(resetTables);
    afterAll(closeTestDb);

    it("vuelca las tablas de la migración aplicada, no las del código", async () => {
      const { entries } = await journal();
      const idx0022 = entries.findIndex((entry) =>
        entry.tag.startsWith("0022_")
      );
      expect(idx0022).toBeGreaterThan(0);
      const carpeta = await carpetaDeMigraciones(idx0022);
      const nombre = `ecom_b4_backup_test_${Date.now()}`;
      const admin = await conexionA(
        new URL(TEST_DATABASE_URL!).pathname.slice(1)
      );
      await admin.query(
        `CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      const vieja = await conexionA(nombre);
      const salida = await mkdtemp(path.join(tmpdir(), "ecom-b4-backup-test-"));
      try {
        await migrate(drizzle(vieja), { migrationsFolder: carpeta });

        const { stream, stats } = dumpDatabase(
          drizzle(vieja, { schema, mode: "default" })
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        await stats;

        const [manifest] = gunzipSync(Buffer.concat(chunks))
          .toString("utf8")
          .split("\n")
          .filter((line) => line !== "")
          .map(
            (line) =>
              JSON.parse(line) as {
                tables?: string[];
                migration?: { tag: string };
              }
          );
        expect(manifest?.migration?.tag).toBe(entries[idx0022]!.tag);
        expect([...(manifest?.tables ?? [])].sort()).toEqual(
          tablesForMigration(entries[idx0022]!.tag)
        );
        expect(manifest?.tables).not.toContain("product_slug_redirects");

        const archivo = path.join(salida, "backup.jsonl.gz");
        await writeFile(archivo, Buffer.concat(chunks));
        await expect(inspectBackup(archivo)).resolves.toBeDefined();
      } finally {
        await vieja.end();
        await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
        await admin.end();
        await rm(carpeta, { recursive: true, force: true });
        await rm(salida, { recursive: true, force: true });
      }
    });
  }
);

describe.skipIf(!hasTestDb)("el health ve un backup parado (B5)", () => {
  beforeEach(async () => {
    getTestDb();
    await resetTables();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(closeTestDb);

  function conCloudinary(configurado: boolean): void {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", configurado ? "fixture-cloud" : "");
    vi.stubEnv("CLOUDINARY_API_KEY", configurado ? "fixture-key" : "");
    vi.stubEnv("CLOUDINARY_API_SECRET", configurado ? "fixture-secret" : "");
  }

  async function health(): Promise<Record<string, unknown>> {
    const { GET } = await import("../../src/app/api/health/route");
    return (await (await GET()).json()) as Record<string, unknown>;
  }

  it("con backups configurados, uno de hace 30 horas es backup:false; uno de hoy, true", async () => {
    conCloudinary(true);
    const ahora = Date.now();
    await recordJobRun("backup", {
      ok: true,
      now: new Date(ahora - 30 * 3_600_000),
    });
    expect((await health()).backup).toBe(false);

    await recordJobRun("backup", {
      ok: true,
      now: new Date(ahora - 3_600_000),
    });
    expect((await health()).backup).toBe(true);
  });

  it("nunca corrió con backups configurados: false", async () => {
    conCloudinary(true);
    expect((await health()).backup).toBe(false);
  });

  it("sin backups configurados no hay nada que exigir: true", async () => {
    conCloudinary(false);
    expect((await health()).backup).toBe(true);
  });
});
