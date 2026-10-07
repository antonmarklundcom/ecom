import { describe, expect, it } from "vitest";

import { compareMigrations } from "@/db/migration-status";

import { describirMigraciones } from "../../scripts/db-check";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md B2: la comparación entre
 * `__drizzle_migrations` y el journal, sin base. La versión contra MySQL de
 * verdad está en tests/integration/migration-safety.test.ts.
 */
const JOURNAL = [
  { tag: "0000_a", hash: "h0", when: 1_000 },
  { tag: "0001_b", hash: "h1", when: 2_000 },
  { tag: "0002_c", hash: "h2", when: 3_000 },
];

describe("compareMigrations", () => {
  it("todo aplicado: al día", () => {
    expect(
      compareMigrations(
        JOURNAL.map((m) => ({ hash: m.hash, createdAt: m.when })),
        JOURNAL
      )
    ).toEqual({
      current: true,
      applied: 3,
      expected: 3,
      pending: [],
      skipped: [],
      foreign: 0,
    });
  });

  it("base nueva: todo pendiente, nada salteado", () => {
    expect(compareMigrations([], JOURNAL)).toMatchObject({
      current: false,
      pending: ["0000_a", "0001_b", "0002_c"],
      skipped: [],
    });
  });

  it("una pendiente más vieja que la última aplicada se saltearía", () => {
    const status = compareMigrations(
      [
        { hash: "h0", createdAt: 1_000 },
        { hash: "propia", createdAt: 2_500 },
      ],
      JOURNAL
    );
    expect(status).toMatchObject({
      current: false,
      pending: ["0001_b", "0002_c"],
      skipped: ["0001_b"],
      foreign: 1,
    });
  });

  it("el mismo hash con otra fecha también es ajeno", () => {
    expect(
      compareMigrations(
        [
          { hash: "h0", createdAt: 1_000 },
          { hash: "h1", createdAt: 9_999 },
          { hash: "h2", createdAt: 3_000 },
        ],
        JOURNAL
      ).foreign
    ).toBe(1);
  });
});

describe("describirMigraciones (pnpm db:check)", () => {
  it("al día es una sola línea", () => {
    expect(
      describirMigraciones(
        compareMigrations(
          JOURNAL.map((m) => ({ hash: m.hash, createdAt: m.when })),
          JOURNAL
        )
      )
    ).toEqual(["✓ migraciones al día (3/3)"]);
  });

  it("con salteadas no manda a migrar: manda a revisar", () => {
    const lineas = describirMigraciones(
      compareMigrations(
        [
          { hash: "h0", createdAt: 1_000 },
          { hash: "propia", createdAt: 2_500 },
        ],
        JOURNAL
      )
    ).join("\n");
    expect(lineas).toContain("saltearía 0001_b");
    expect(lineas).toContain("Migraciones propias de una tienda");
    expect(lineas).not.toContain("pnpm db:migrate");
  });
});
