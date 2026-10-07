import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  JOURNAL_PATH,
  leerJournal,
  problemasDeMigraciones,
  snapshotPath,
  sqlPath,
  type JournalEntry,
  type LadoMigraciones,
} from "../../scripts/template-migrations";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md B1: la historia de migraciones se decide
 * antes de escribir. Los lados se arman a mano —journal + identidad de cada
 * archivo— igual que los lee `template-sync.ts` de git.
 */

function entrada(idx: number, tag: string, when: number): JournalEntry {
  return { idx, version: "5", when, tag, breakpoints: true };
}

function lado(
  entradas: JournalEntry[],
  contenido: Record<string, string> = {}
): LadoMigraciones {
  const archivos = new Map<string, string>();
  for (const e of entradas) {
    archivos.set(sqlPath(e.tag), contenido[e.tag] ?? `sql:${e.tag}`);
    archivos.set(snapshotPath(e.idx), `snap:${e.tag}`);
  }
  archivos.set(JOURNAL_PATH, "journal");
  return {
    journal: JSON.stringify({
      version: "7",
      dialect: "mysql",
      entries: entradas,
    }),
    archivos,
  };
}

const PUBLICADAS = [
  entrada(0, "0000_inicio", 1_000),
  entrada(1, "0001_pedidos", 2_000),
];

describe("problemasDeMigraciones", () => {
  it("una tienda sin migraciones propias recibe las nuevas del template", () => {
    expect(
      problemasDeMigraciones({
        base: lado(PUBLICADAS),
        tienda: lado(PUBLICADAS),
        template: lado([...PUBLICADAS, entrada(2, "0002_tpl", 3_000)]),
      })
    ).toEqual([]);
  });

  it("una tienda con migraciones propias sincroniza mientras el template no traiga otras", () => {
    expect(
      problemasDeMigraciones({
        base: lado(PUBLICADAS),
        tienda: lado([...PUBLICADAS, entrada(2, "0002_tienda", 3_000)]),
        template: lado(PUBLICADAS),
      })
    ).toEqual([]);
  });

  it("si la tienda ya trajo la misma migración del template, no es un choque", () => {
    const nueva = entrada(2, "0002_tpl", 3_000);
    expect(
      problemasDeMigraciones({
        base: lado(PUBLICADAS),
        tienda: lado([...PUBLICADAS, nueva]),
        template: lado([...PUBLICADAS, nueva, entrada(3, "0003_tpl", 4_000)]),
      })
    ).toEqual([]);
  });

  it("mismo índice en los dos lados: choque, con el motivo", () => {
    const problemas = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado([...PUBLICADAS, entrada(2, "0002_tienda", 3_500)]),
      template: lado([...PUBLICADAS, entrada(2, "0002_tpl", 4_000)]),
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ tipo: "choque" });
    expect(problemas[0]?.detalle).toContain("0002_tienda");
    expect(problemas[0]?.detalle).toContain("mismo índice");
  });

  it("una del template anterior a la última de la tienda se saltearía: choque", () => {
    // La forma real de una tienda hecha desde este template: su 0023 y 0024
    // propias, y un 0023 del template con un `when` entre las dos.
    const problemas = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado([
        ...PUBLICADAS,
        entrada(2, "0002_propia", 3_000),
        entrada(3, "0003_propia", 5_000),
      ]),
      template: lado([...PUBLICADAS, entrada(2, "0002_tpl", 4_000)]),
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]?.detalle).toMatch(/saltearía/);
  });

  it("el template reescribió una migración publicada: SQL, fecha o borrado", () => {
    const reescrita = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado(PUBLICADAS),
      template: lado(PUBLICADAS, { "0001_pedidos": "sql:otro" }),
    });
    expect(reescrita).toEqual([
      expect.objectContaining({ tipo: "reescrita-en-template" }),
    ]);

    const otraFecha = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado(PUBLICADAS),
      template: lado([PUBLICADAS[0]!, entrada(1, "0001_pedidos", 2_500)]),
    });
    expect(otraFecha[0]?.tipo).toBe("reescrita-en-template");

    const borrada = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado(PUBLICADAS),
      template: lado([PUBLICADAS[0]!]),
    });
    expect(borrada[0]?.detalle).toMatch(/borró/);
  });

  it("la tienda editó una migración publicada", () => {
    const problemas = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: lado(PUBLICADAS, { "0000_inicio": "sql:editado" }),
      template: lado(PUBLICADAS),
    });
    expect(problemas).toEqual([
      expect.objectContaining({ tipo: "editada-en-tienda" }),
    ]);
  });

  it("un journal con marcadores de conflicto no se fusiona", () => {
    const tienda = lado(PUBLICADAS);
    const problemas = problemasDeMigraciones({
      base: lado(PUBLICADAS),
      tienda: {
        ...tienda,
        journal: `{\n<<<<<<< tienda\n"entries": []\n=======\n>>>>>>> template\n}`,
      },
      template: lado(PUBLICADAS),
    });
    expect(problemas).toEqual([
      expect.objectContaining({ tipo: "journal-invalido" }),
    ]);
  });
});

describe("leerJournal", () => {
  it("rechaza índices salteados, tags repetidos y fechas que no crecen", () => {
    const journal = (entries: JournalEntry[]) =>
      JSON.stringify({ version: "7", dialect: "mysql", entries });
    expect(
      leerJournal(journal([entrada(0, "a", 1), entrada(2, "b", 2)]))
    ).toHaveProperty("error");
    expect(
      leerJournal(journal([entrada(0, "a", 1), entrada(1, "a", 2)]))
    ).toHaveProperty("error");
    expect(
      leerJournal(journal([entrada(0, "a", 2), entrada(1, "b", 2)]))
    ).toHaveProperty("error");
  });

  it("el journal de este repo es contiguo, creciente y cada migración tiene su SQL y su snapshot", () => {
    const leido = leerJournal(readFileSync(JOURNAL_PATH, "utf8"));
    if ("error" in leido) throw new Error(leido.error);
    expect(leido.entradas.length).toBeGreaterThan(0);
    for (const e of leido.entradas) {
      expect(existsSync(sqlPath(e.tag)), sqlPath(e.tag)).toBe(true);
      expect(existsSync(snapshotPath(e.idx)), snapshotPath(e.idx)).toBe(true);
    }
  });
});
