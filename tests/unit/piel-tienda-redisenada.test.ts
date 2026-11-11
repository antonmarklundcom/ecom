import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TESTS_DE_PIEL } from "../../scripts/template-shared";

/**
 * La prueba de la política de tests de piel (docs/TEMPLATE-INHERITANCE.md
 * § "Tests que miran la piel"): una tienda que rediseñó su `product-card.tsx`
 * —con un color escrito a mano, el corazón adentro del link, sin la leyenda
 * de foto ilustrativa y mostrando el ₲0— corre los tests de piel del template
 * tal como llegan con `template:sync`, y pasan.
 *
 * El control: la misma tarjeta en el repo del template (con `tiendas.json`)
 * pone los tres tests en rojo. Así se ve que pasan por la política, no porque
 * el rediseño no rompa nada.
 *
 * Corre una vitest aparte sobre una copia de `src/` y de los tests de piel,
 * con los `node_modules` del repo enlazados (junction en Windows).
 */

const REPO = process.cwd();
const VITEST = path.join(REPO, "node_modules", "vitest", "vitest.mjs");

/** Los tres que una tarjeta rediseñada ponía en rojo antes de esta política. */
const TESTS = [
  "src/components/__tests__/catalogue-cards.test.tsx",
  "src/components/__tests__/zero-price-display.test.tsx",
  "tests/unit/piel-sin-colores.test.ts",
];

const TARJETA_DE_LA_TIENDA = `import Link from "next/link";

import { WishlistButton } from "@/components/wishlist-button";
import type { CatalogProduct } from "@/db/queries";
import { formatGs } from "@/lib/money";
import { TESTIDS } from "@/lib/testids";

/** La tarjeta de Norte: su color de marca, su orden, su corazón. */
export function ProductCard({ product }: { product: CatalogProduct; priority?: boolean; showRating?: boolean }) {
  const precio = product.variants[0]?.pricePyg ?? 0;
  return (
    <Link href={\`/producto/\${product.slug}\`} data-testid={TESTIDS.productCard} data-slug={product.slug} className="block rounded-none border p-2">
      <p className="text-amber-700 text-xs font-semibold uppercase">{product.brand ?? product.categoryName}</p>
      <h3 className="text-sm">{product.name}</h3>
      <p className="text-sm">{formatGs(precio)}</p>
      <WishlistButton slug={product.slug} name={product.name} />
    </Link>
  );
}

export function ProductCardSkeleton() {
  return <div className="bg-muted aspect-square" />;
}
`;

let tienda = "";

function copiar(ruta: string): void {
  cpSync(path.join(REPO, ruta), path.join(tienda, ruta), { recursive: true });
}

function correr(): { codigo: number; salida: string } {
  try {
    const salida = execFileSync(
      process.execPath,
      [VITEST, "run", "--reporter=verbose", ...TESTS],
      {
        cwd: tienda,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CI: "", FORCE_COLOR: "0", NO_COLOR: "1" },
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    return { codigo: 0, salida };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
  }
}

beforeAll(() => {
  tienda = mkdtempSync(path.join(tmpdir(), "tienda-redisenada-"));
  for (const ruta of [
    "src",
    "tests/helpers",
    "tests/setup",
    "tests/piel-del-template.json",
    "tests/unit/piel-sin-colores.test.ts",
    "scripts/template-shared.ts",
    "vitest.config.mts",
    "vitest.setup.ts",
    "tsconfig.json",
    "package.json",
  ]) {
    copiar(ruta);
  }
  symlinkSync(
    path.join(REPO, "node_modules"),
    path.join(tienda, "node_modules"),
    "junction"
  );
  mkdirSync(path.join(tienda, "src", "components"), { recursive: true });
  writeFileSync(
    path.join(tienda, "src", "components", "product-card.tsx"),
    TARJETA_DE_LA_TIENDA
  );
}, 120_000);

afterAll(() => {
  if (tienda) rmSync(tienda, { recursive: true, force: true });
});

describe("una tienda con su propia tarjeta corre los tests de piel del template", () => {
  it("los tres son tests de piel (TESTS_DE_PIEL)", () => {
    for (const test of TESTS) expect(TESTS_DE_PIEL).toContain(test);
  });

  it("en la tienda pasan: la tarjeta rediseñada sale skipped y el resto se revisa", () => {
    const { codigo, salida } = correr();
    expect(salida, salida).toMatch(/Test Files\s+3 passed/);
    expect(codigo, salida).toBe(0);
    // La tarjeta propia no se revisa…
    expect(salida).toMatch(/↓.*tarjeta de producto/);
    // …pero lo que la tienda no tocó, sí: los vistos recientemente y PriceTag.
    expect(salida).toMatch(/✓.*vistos recientemente/);
    expect(salida).toMatch(/✓.*PriceTag no dibuja un precio/);
    expect(salida).toMatch(/✓.*ningún componente de la tienda tiene un color/);
  });

  it("control: la misma tarjeta en el template pone los tres en rojo", () => {
    writeFileSync(path.join(tienda, "tiendas.json"), "[]\n");
    try {
      const { codigo, salida } = correr();
      expect(codigo, salida).not.toBe(0);
      expect(salida).toMatch(/Test Files\s+3 failed/);
      expect(salida).toMatch(
        /src\/components\/product-card\.tsx: clase de la paleta de Tailwind \\?"text-amber-700/
      );
      expect(salida).toMatch(/FAIL.*catalogue-cards.*el corazón no está adentro del link/);
      expect(salida).toMatch(/FAIL.*zero-price-display.*la tarjeta de producto omite el precio/);
    } finally {
      rmSync(path.join(tienda, "tiendas.json"), { force: true });
    }
  });
});
