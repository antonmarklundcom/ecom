import { gunzipSync, gzipSync } from "node:zlib";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BACKUP_SET_RE,
  MANIFIESTO_SET,
  dumpRows,
  pruneBackups,
  runBackup,
} from "@/domain/backup";
import type { BackupSetManifest } from "@/domain/backup-format";
import {
  descargarSet,
  inspectBackup,
  ultimoSetCompleto,
  verificarSet,
} from "@/domain/restore-backup";
import { crearClienteR2 } from "@/lib/r2";

import { restaurar } from "../../scripts/restore-backup";
import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createOrder, createProduct, createVariant } from "../helpers/factories";
import { CONFIG_FALSA, crearR2Falso, type R2Falso } from "../helpers/r2-falso";

/**
 * El backup en R2 (formato 3): un objeto por tabla y el manifiesto **al
 * final**, contra un R2 de mentira. Lo que se fija acá es lo que KNOWN-ISSUES
 * pedía para partirlo: que un set a medias no pase nunca por uno completo.
 */

async function volcar(): Promise<Array<{ table: string; row: Record<string, unknown> }>> {
  const filas: Array<{ table: string; row: Record<string, unknown> }> = [];
  for await (const fila of dumpRows(getTestDb())) filas.push(fila);
  return filas;
}

describe.skipIf(!hasTestDb)("backup en R2: un set por tabla con manifiesto", () => {
  let r2: R2Falso;
  let dir: string;

  beforeEach(async () => {
    await resetTables();
    r2 = crearR2Falso();
    dir = await mkdtemp(path.join(tmpdir(), "ecom-backup-set-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  afterAll(closeTestDb);

  const cliente = () => crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch });

  async function sacarBackup(now = new Date()) {
    const resultado = await runBackup({ cliente: cliente(), now });
    await descargarSet(cliente(), resultado.setId, dir);
    return resultado;
  }

  it("sube un objeto privado por tabla y el manifiesto último; restaura igual", async () => {
    const productId = await createProduct();
    await createVariant({ onHand: 7, pricePyg: 123_000, productId });
    await createOrder({ status: "pagado", totalPyg: 150_000 });
    const antes = await volcar();

    const resultado = await sacarBackup();
    expect(resultado.setId).toMatch(BACKUP_SET_RE);
    expect(resultado.rows).toBe(antes.length);

    const puts = r2.pedidos.filter((p) => p.method === "PUT").map((p) => new URL(p.url).pathname);
    expect(puts.at(-1)).toMatch(new RegExp(`/backups/${resultado.setId}/${MANIFIESTO_SET}$`));
    expect(puts.slice(0, -1).every((p) => p.endsWith(".jsonl.gz"))).toBe(true);
    for (const [key, objeto] of r2.objetos) {
      expect(key.startsWith(`backups/${resultado.setId}/`)).toBe(true);
      expect(objeto.cacheControl).toBe("private, no-store");
    }

    const manifest = JSON.parse(await readFile(path.join(dir, MANIFIESTO_SET), "utf8")) as BackupSetManifest;
    expect(manifest.format).toBe(3);
    expect(manifest.objects.map((o) => o.table)).toEqual(manifest.tables);
    expect(manifest.objects.find((o) => o.table === "variants")?.rows).toBe(1);
    expect(puts).toHaveLength(manifest.tables.length + 1);

    // La misma verificación que hace restore, sobre el set bajado.
    const info = await inspectBackup(dir);
    expect(info.rows).toBe(antes.length);

    await resetTables();
    const reporte = await restaurar({ archivo: dir, vaciar: true });
    expect(reporte.filas).toBe(antes.length);
    expect(await volcar()).toEqual(antes);
  });

  it("sin manifiesto (la corrida no terminó) se rechaza", async () => {
    await sacarBackup();
    await unlink(path.join(dir, MANIFIESTO_SET));
    await expect(verificarSet(dir)).rejects.toThrow(/Backup incompleto: falta manifest\.json/);
    await expect(restaurar({ archivo: dir, vaciar: true })).rejects.toThrow(/Backup incompleto/);
  });

  it("un objeto de menos se rechaza, nombrándolo", async () => {
    await sacarBackup();
    await unlink(path.join(dir, "orders.jsonl.gz"));
    await expect(verificarSet(dir)).rejects.toThrow("Backup incompleto: falta orders.jsonl.gz");
  });

  it("un objeto cambiado o truncado se rechaza aunque descomprima", async () => {
    await createVariant({ onHand: 3 });
    await sacarBackup();
    const archivo = path.join(dir, "variants.jsonl.gz");
    const lineas = gunzipSync(await readFile(archivo)).toString("utf8");
    await writeFile(archivo, gzipSync(lineas.replace('"on_hand":3', '"on_hand":300')));
    await expect(verificarSet(dir)).rejects.toThrow("El objeto variants.jsonl.gz no coincide con el manifiesto");
  });

  it("un manifiesto con conteos o hashes que no coinciden se rechaza", async () => {
    await createVariant({ onHand: 3 });
    await sacarBackup();
    const ruta = path.join(dir, MANIFIESTO_SET);
    const manifest = JSON.parse(await readFile(ruta, "utf8")) as BackupSetManifest;

    const conteo = structuredClone(manifest);
    conteo.objects.find((o) => o.table === "variants")!.rows += 1;
    await writeFile(ruta, JSON.stringify(conteo));
    await expect(verificarSet(dir)).rejects.toThrow("Los conteos o el checksum de variants.jsonl.gz no coinciden");

    const total = structuredClone(manifest);
    total.rows += 1;
    await writeFile(ruta, JSON.stringify(total));
    await expect(verificarSet(dir)).rejects.toThrow("Backup incompleto o checksum inválido");

    const sinTabla = structuredClone(manifest);
    sinTabla.objects = sinTabla.objects.filter((o) => o.table !== "orders");
    await writeFile(ruta, JSON.stringify(sinTabla));
    await expect(verificarSet(dir)).rejects.toThrow("Manifiesto inválido");
  });

  it("el último set completo ignora uno sin manifiesto, y la retención borra sólo los viejos", async () => {
    const viejo = await runBackup({ cliente: cliente(), now: new Date("2026-10-01T06:00:00Z") });
    const nuevo = await runBackup({ cliente: cliente(), now: new Date("2026-11-03T06:00:00Z") });
    // Uno a medias de hoy: sin manifiesto no cuenta como "el último".
    r2.objetos.set(`backups/backup-2026-11-04T0300-${"e".repeat(32)}/orders.jsonl.gz`, {
      bytes: new Uint8Array([1]),
      contentType: "application/gzip",
      cacheControl: "private, no-store",
      fecha: new Date(),
    });
    // Algo bajo backups/ que no es un set: la retención no lo toca.
    r2.objetos.set("backups/nota.txt", {
      bytes: new Uint8Array([1]),
      contentType: "text/plain",
      cacheControl: null,
      fecha: new Date("2020-01-01T00:00:00Z"),
    });
    expect(await ultimoSetCompleto(cliente())).toBe(nuevo.setId);

    // Las fechas de los objetos del R2 falso son "ahora": se envejece el viejo.
    for (const [key, objeto] of r2.objetos) {
      if (key.includes(viejo.setId)) objeto.fecha = new Date("2026-10-01T06:00:00Z");
    }
    const borrados = await pruneBackups(cliente(), 14, new Date("2026-11-04T06:00:00Z"));
    expect(borrados).toBe(1);
    const claves = [...r2.objetos.keys()];
    expect(claves.some((k) => k.includes(viejo.setId))).toBe(false);
    expect(claves.some((k) => k.includes(nuevo.setId))).toBe(true);
    expect(claves).toContain("backups/nota.txt");
  });
});
