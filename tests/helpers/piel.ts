import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  esRutaDePiel,
  HUELLAS_PIEL,
  huellaPiel,
  RAICES_PIEL,
} from "../../scripts/template-shared";

/**
 * ¿Este archivo de piel sigue siendo el del template? (docs/TEMPLATE-INHERITANCE.md
 * § "Tests que miran la piel", `TESTS_DE_PIEL` en scripts/template-shared.ts).
 *
 * Los tests de piel del template lo preguntan antes de revisar un archivo: una
 * tienda que rediseñó `product-card.tsx` es dueña de su tarjeta, y un test que
 * mira cómo la dibuja el template no la pone en rojo. En el repo del template
 * (tiene `tiendas.json`, que nunca viaja a una tienda) toda la piel es del
 * template y los tests corren enteros; ahí `piel-del-template.test.ts` exige
 * que las huellas estén al día.
 *
 *   pnpm exec tsx tests/helpers/piel.ts --escribir   # en el template, después de tocar piel
 */

export function esRepoDelTemplate(raiz = process.cwd()): boolean {
  return existsSync(path.join(raiz, "tiendas.json"));
}

/** Rutas de piel (posix, ordenadas) que hay en `raiz`. */
export function archivosDePiel(raiz = process.cwd()): string[] {
  const salida: string[] = [];
  const recorrer = (relativa: string) => {
    const absoluta = path.join(raiz, relativa);
    if (!existsSync(absoluta)) return;
    for (const entrada of readdirSync(absoluta, { withFileTypes: true })) {
      const hija = `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) recorrer(hija);
      else if (esRutaDePiel(hija)) salida.push(hija);
    }
  };
  for (const r of RAICES_PIEL) recorrer(r);
  return salida.sort();
}

export function calcularHuellas(raiz = process.cwd()): Record<string, string> {
  return Object.fromEntries(
    archivosDePiel(raiz).map((ruta) => [
      ruta,
      huellaPiel(readFileSync(path.join(raiz, ruta))),
    ])
  );
}

export function leerHuellas(raiz = process.cwd()): Record<string, string> | null {
  const ruta = path.join(raiz, HUELLAS_PIEL);
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8")) as Record<string, string>;
}

export function contenidoHuellas(huellas: Record<string, string>): string {
  const ordenadas = Object.fromEntries(
    Object.keys(huellas)
      .sort()
      .map((ruta) => [ruta, huellas[ruta]])
  );
  return `${JSON.stringify(ordenadas, null, 2)}\n`;
}

const cache = new Map<string, Record<string, string> | null>();

/**
 * `true` si `ruta` (posix, relativa a la raíz) es el archivo que publica el
 * template; `false` si la tienda lo rediseñó, lo borró o no hay huellas.
 */
export function esPielDelTemplate(ruta: string, raiz = process.cwd()): boolean {
  if (esRepoDelTemplate(raiz)) return true;
  if (!cache.has(raiz)) cache.set(raiz, leerHuellas(raiz));
  const esperada = cache.get(raiz)?.[ruta];
  const absoluta = path.join(raiz, ruta);
  if (!esperada || !existsSync(absoluta)) return false;
  return huellaPiel(readFileSync(absoluta)) === esperada;
}

/**
 * Para `it.runIf(...)`: el caso corre sólo si todos los archivos que dibuja
 * siguen siendo los del template. En una tienda que rediseñó uno, sale
 * "skipped" en el reporte, no rojo.
 */
export function pielDelTemplate(...rutas: string[]): boolean {
  return rutas.every((ruta) => esPielDelTemplate(ruta));
}

if (process.argv[1] && /tests[\\/]helpers[\\/]piel\.ts$/.test(process.argv[1])) {
  if (!process.argv.includes("--escribir")) {
    console.error("uso: pnpm exec tsx tests/helpers/piel.ts --escribir");
    process.exit(1);
  }
  if (!esRepoDelTemplate()) {
    console.error(
      "Esto es una tienda: las huellas las escribe el template y llegan con template:sync."
    );
    process.exit(1);
  }
  const huellas = calcularHuellas();
  writeFileSync(HUELLAS_PIEL, contenidoHuellas(huellas));
  console.log(`${HUELLAS_PIEL}: ${Object.keys(huellas).length} archivos de piel`);
}
