import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/consulta/route";
import { enquiryDaily, products, searchDaily, variants } from "@/db/schema";
import { dumpDatabase } from "@/domain/backup";
import {
  MAX_TERMINOS_POR_DIA,
  consultasCsv,
  podarConteos,
  registrarBusqueda,
  registrarConsulta,
  resumenConsultas,
} from "@/domain/consultas";
import { buildDailyDigest, digestBody } from "@/domain/daily-digest";
import { runMaintenance } from "@/domain/maintenance";
import { restoreBackup } from "@/domain/restore-backup";
import { resetRateLimits } from "@/lib/rate-limit";

import { closeTestDb, getTestDb, hasTestDb, resetTables } from "../helpers/db";
import { createProduct, createVariant } from "../helpers/factories";

/**
 * O33 — consultas por WhatsApp y búsquedas, contadas por día
 * (`fable/plan-trafico.md` §2.2, §5.2).
 */

/** 13:00 en Asunción del 12/08/2026. */
const HOY = new Date("2026-08-12T16:00:00Z");
const NAVEGADOR = new Headers({
  "user-agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
});

async function filasConsulta() {
  return getTestDb().select().from(enquiryDaily).orderBy(enquiryDaily.id);
}
async function filasBusqueda() {
  return getTestDb().select().from(searchDaily).orderBy(searchDaily.id);
}

describe.skipIf(!hasTestDb)("O33 · registrarConsulta", () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it("suma con upsert en la clave (día, producto, variante, origen)", async () => {
    const productId = await createProduct();
    const variantId = await createVariant({ onHand: 0, productId });
    const consulta = { origin: "producto" as const, productId, variantId };

    expect(await registrarConsulta(consulta, HOY)).toBe(true);
    expect(await registrarConsulta(consulta, HOY)).toBe(true);
    expect(await registrarConsulta({ ...consulta, origin: "tarjeta" }, HOY)).toBe(true);
    expect(await registrarConsulta({ ...consulta, variantId: 0 }, HOY)).toBe(true);
    // Otro día paraguayo: 02:00 UTC del 13 sigue siendo el 12 en Asunción.
    expect(await registrarConsulta(consulta, new Date("2026-08-13T02:00:00Z"))).toBe(true);
    expect(await registrarConsulta(consulta, new Date("2026-08-13T04:00:00Z"))).toBe(true);

    const filas = await filasConsulta();
    expect(filas.map((f) => [f.day, f.origin, f.variantId, f.count])).toEqual([
      ["2026-08-12", "producto", variantId, 3],
      ["2026-08-12", "tarjeta", variantId, 1],
      ["2026-08-12", "producto", 0, 1],
      ["2026-08-13", "producto", variantId, 1],
    ]);
  });

  it("sin producto (botón flotante) también suma en una sola fila", async () => {
    for (let i = 0; i < 3; i += 1)
      await registrarConsulta({ origin: "flotante", productId: 0, variantId: 0 }, HOY);
    const filas = await filasConsulta();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.count).toBe(3);
  });

  it("no cuenta un producto inexistente, despublicado o una variante ajena", async () => {
    const productId = await createProduct();
    const ajena = await createVariant({ onHand: 0 });
    expect(
      await registrarConsulta({ origin: "producto", productId: 999_999, variantId: 0 }, HOY)
    ).toBe(false);
    expect(
      await registrarConsulta({ origin: "producto", productId, variantId: ajena }, HOY)
    ).toBe(false);
    await getTestDb().update(products).set({ publishedAt: null }).where(eq(products.id, productId));
    expect(await registrarConsulta({ origin: "producto", productId, variantId: 0 }, HOY)).toBe(
      false
    );
    const otro = await createProduct();
    const inactiva = await createVariant({ onHand: 0, productId: otro });
    await getTestDb().update(variants).set({ isActive: false }).where(eq(variants.id, inactiva));
    expect(
      await registrarConsulta({ origin: "producto", productId: otro, variantId: inactiva }, HOY)
    ).toBe(false);
    expect(await filasConsulta()).toHaveLength(0);
  });
});

describe.skipIf(!hasTestDb)("O33 · POST /api/consulta", () => {
  beforeEach(async () => {
    await resetTables();
    resetRateLimits();
  });

  function pedido(body: string, headers: Record<string, string> = {}) {
    return new Request("http://tienda.test/api/consulta", {
      method: "POST",
      body,
      headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": "10.0.0.1", ...headers },
    });
  }

  it("contesta 204 siempre y sólo cuenta lo válido y del mismo origen", async () => {
    const productId = await createProduct();
    const casos = [
      pedido(JSON.stringify({ o: "producto", p: productId })),
      pedido(JSON.stringify({ o: "producto", p: productId }), { "sec-fetch-site": "cross-site" }),
      pedido("no es json"),
      pedido(JSON.stringify({ o: "inventado", p: productId })),
      pedido(JSON.stringify({ o: "producto", p: 999_999 })),
      pedido(""),
      pedido("x".repeat(2000)),
    ];
    for (const caso of casos) {
      const respuesta = await POST(caso);
      expect(respuesta.status).toBe(204);
    }
    // Sin Sec-Fetch-Site: decide el Origin contra el Host.
    await POST(
      new Request("http://tienda.test/api/consulta", {
        method: "POST",
        body: JSON.stringify({ o: "flotante" }),
        headers: { origin: "http://tienda.test", host: "tienda.test" },
      })
    );
    await POST(
      new Request("http://tienda.test/api/consulta", {
        method: "POST",
        body: JSON.stringify({ o: "flotante" }),
        headers: { origin: "https://otro.example", host: "tienda.test" },
      })
    );
    const filas = await filasConsulta();
    expect(filas.map((f) => [f.origin, f.productId, f.count])).toEqual([
      ["producto", productId, 1],
      ["flotante", 0, 1],
    ]);
  });

  it("pasado el límite por IP no cuenta, y sigue contestando 204", async () => {
    for (let i = 0; i < 40; i += 1) {
      const respuesta = await POST(pedido(JSON.stringify({ o: "flotante" })));
      expect(respuesta.status).toBe(204);
    }
    const filas = await filasConsulta();
    expect(filas[0]!.count).toBe(30);
  });

  it("con la base rota igual contesta 204", async () => {
    await getTestDb().execute(sql`RENAME TABLE enquiry_daily TO enquiry_daily_tmp`);
    try {
      const productId = 1;
      const respuesta = await POST(pedido(JSON.stringify({ o: "flotante", p: productId })));
      expect(respuesta.status).toBe(204);
    } finally {
      await getTestDb().execute(sql`RENAME TABLE enquiry_daily_tmp TO enquiry_daily`);
    }
  });
});

describe.skipIf(!hasTestDb)("O33 · registrarBusqueda", () => {
  beforeEach(resetTables);

  it("normaliza, suma por (día, término, sin resultado) y separa los ceros", async () => {
    await registrarBusqueda({ termino: "Anillo  Oro", resultados: 3, headers: NAVEGADOR }, HOY);
    await registrarBusqueda({ termino: "anillo oro", resultados: 2, headers: NAVEGADOR }, HOY);
    await registrarBusqueda({ termino: "unicornio", resultados: 0, headers: NAVEGADOR }, HOY);
    const filas = await filasBusqueda();
    expect(filas.map((f) => [f.term, f.zeroResults, f.count])).toEqual([
      ["anillo oro", false, 2],
      ["unicornio", true, 1],
    ]);
  });

  it("ni robots, ni prefetch, ni teléfonos, ni e-mails", async () => {
    const bot = new Headers({ "user-agent": "Googlebot/2.1" });
    const prefetch = new Headers({ ...Object.fromEntries(NAVEGADOR), "next-router-prefetch": "1" });
    expect(await registrarBusqueda({ termino: "mesa", resultados: 1, headers: bot }, HOY)).toBe(false);
    expect(
      await registrarBusqueda({ termino: "mesa", resultados: 1, headers: prefetch }, HOY)
    ).toBe(false);
    expect(
      await registrarBusqueda({ termino: "0981 123 456", resultados: 0, headers: NAVEGADOR }, HOY)
    ).toBe(false);
    expect(
      await registrarBusqueda({ termino: "ana@mail.com", resultados: 0, headers: NAVEGADOR }, HOY)
    ).toBe(false);
    expect(await filasBusqueda()).toHaveLength(0);
  });

  it(`a lo sumo ${MAX_TERMINOS_POR_DIA} términos nuevos por día; los ya vistos siguen sumando`, async () => {
    const valores = Array.from({ length: MAX_TERMINOS_POR_DIA }, (_, i) => ({
      day: "2026-08-12",
      term: `termino ${i}`,
      zeroResults: false,
      count: 1,
    }));
    await getTestDb().insert(searchDaily).values(valores);
    expect(
      await registrarBusqueda({ termino: "uno nuevo", resultados: 1, headers: NAVEGADOR }, HOY)
    ).toBe(false);
    expect(
      await registrarBusqueda({ termino: "termino 7", resultados: 1, headers: NAVEGADOR }, HOY)
    ).toBe(true);
    // Al día siguiente, el tope vuelve a empezar.
    expect(
      await registrarBusqueda(
        { termino: "uno nuevo", resultados: 1, headers: NAVEGADOR },
        new Date("2026-08-13T16:00:00Z")
      )
    ).toBe(true);
    const [fila] = await getTestDb()
      .select()
      .from(searchDaily)
      .where(eq(searchDaily.term, "termino 7"));
    expect(fila!.count).toBe(2);
    expect(await filasBusqueda()).toHaveLength(MAX_TERMINOS_POR_DIA + 1);
  });
});

describe.skipIf(!hasTestDb)("O33 · panel, CSV, resumen diario, poda, backup", () => {
  beforeEach(resetTables);

  async function sembrar() {
    const productId = await createProduct();
    const db = getTestDb();
    await db.insert(enquiryDaily).values([
      { day: "2026-08-12", productId, variantId: 0, origin: "producto", count: 2 },
      { day: "2026-08-11", productId, variantId: 0, origin: "tarjeta", count: 3 },
      { day: "2026-07-20", productId, variantId: 0, origin: "producto", count: 5 },
      { day: "2026-05-20", productId, variantId: 0, origin: "producto", count: 7 },
      { day: "2026-08-11", productId: 0, variantId: 0, origin: "flotante", count: 4 },
      { day: "2025-06-30", productId, variantId: 0, origin: "producto", count: 9 },
    ]);
    await db.insert(searchDaily).values([
      { day: "2026-08-12", term: "mesa", zeroResults: false, count: 6 },
      { day: "2026-08-11", term: "sillon", zeroResults: true, count: 2 },
      { day: "2025-06-30", term: "viejo", zeroResults: true, count: 1 },
    ]);
    return productId;
  }

  it("el panel suma 7, 30 y 90 días, por origen y por término", async () => {
    const productId = await sembrar();
    const resumen = await resumenConsultas(HOY);
    expect(resumen.productos).toEqual([
      expect.objectContaining({ productId, d7: 5, d30: 10, d90: 17 }),
    ]);
    expect(resumen.sinProducto).toEqual({ d7: 4, d30: 4, d90: 4 });
    expect(resumen.porOrigen.find((o) => o.origin === "producto")?.total).toBe(7);
    expect(resumen.porOrigen.find((o) => o.origin === "flotante")?.total).toBe(4);
    expect(resumen.terminos).toEqual([
      { term: "mesa", total: 6 },
      { term: "sillon", total: 2 },
    ]);
    expect(resumen.sinResultado).toEqual([{ term: "sillon", total: 2 }]);
  });

  it("el CSV trae 90 días y nada más", async () => {
    await sembrar();
    const csv = await consultasCsv(HOY);
    const lineas = csv.trim().split(/\r?\n/);
    expect(lineas[0]).toContain("tipo;dia;producto");
    expect(lineas.filter((l) => l.startsWith("consulta;"))).toHaveLength(5);
    expect(lineas.filter((l) => l.startsWith("busqueda;"))).toHaveLength(2);
    expect(csv).not.toContain("viejo");
  });

  it("el resumen diario suma una línea con las consultas de ayer", async () => {
    await sembrar();
    const digest = await buildDailyDigest(HOY);
    expect(digest.consultasAyer).toBe(7);
    expect(digest.sinNovedades).toBe(false);
    expect(digestBody(digest)).toContain("Consultas por WhatsApp ayer: 7");
  });

  it("la poda borra lo de hace más de 13 meses, también desde el cron de mantenimiento", async () => {
    await sembrar();
    expect(await podarConteos(HOY)).toBe(2);
    expect((await filasConsulta()).map((f) => f.day)).not.toContain("2025-06-30");
    await getTestDb()
      .insert(searchDaily)
      .values({ day: "2020-01-01", term: "antiguo", zeroResults: false, count: 1 });
    const reporte = await runMaintenance(HOY);
    expect(reporte.conteosPodados).toBe(1);
    expect(await filasBusqueda()).toHaveLength(2);
  });

  it("backup y restore a una base vacía conservan las dos tablas (filas y suma)", async () => {
    await sembrar();
    const antes = await totales();
    const carpeta = await mkdtemp(path.join(tmpdir(), "ecom-consultas-backup-"));
    try {
      const archivo = path.join(carpeta, "backup.gz");
      const { stream, stats } = dumpDatabase();
      const partes: Buffer[] = [];
      for await (const parte of stream) partes.push(Buffer.from(parte));
      await stats;
      await writeFile(archivo, Buffer.concat(partes));
      await resetTables();
      expect(await totales()).toEqual({ e: 0, es: 0, s: 0, ss: 0 });
      await restoreBackup({ archivo });
      expect(await totales()).toEqual(antes);
      expect(antes).toEqual({ e: 6, es: 30, s: 3, ss: 9 });
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });
});

async function totales() {
  const [[e], [s]] = await Promise.all([
    getTestDb()
      .select({
        n: sql<number>`COUNT(*)`,
        suma: sql<string | number>`COALESCE(SUM(${enquiryDaily.count}), 0)`,
      })
      .from(enquiryDaily),
    getTestDb()
      .select({
        n: sql<number>`COUNT(*)`,
        suma: sql<string | number>`COALESCE(SUM(${searchDaily.count}), 0)`,
      })
      .from(searchDaily),
  ]);
  return { e: Number(e!.n), es: Number(e!.suma), s: Number(s!.n), ss: Number(s!.suma) };
}
