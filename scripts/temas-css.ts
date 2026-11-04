import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TEMA_BASE } from "../src/themes/base";
import { cssDeTemas, sincronizarLegado } from "../src/themes/css";
import { TEMAS } from "../src/themes/presets";

/**
 * `pnpm temas:css` — escribe el CSS de los temas desde sus datos.
 *
 * Los temas viven en `src/themes/presets/*.ts` (colores, radio, escala,
 * header, pie y orden de la home). El navegador no lee TypeScript y Tailwind
 * v4 necesita el CSS estático, así que esto genera:
 *
 *   - `src/themes/temas.css`, con todos los temas (cada uno bajo su
 *     `<html data-tema>`), que importa `globals.css`;
 *   - los bloques `:root`/`.dark` de `src/styles/temas/<legado>.css`, el
 *     formato de antes del kit, para las tiendas cuyo `globals.css` todavía
 *     importa uno de esos archivos.
 *
 *   pnpm temas:css            # escribe
 *   pnpm temas:css --check    # no escribe: sale con 1 si algo está desactualizado
 *
 * Corrélo cada vez que tocás un preset y commiteá lo que cambie.
 * `tests/unit/temas.test.ts` falla si te olvidás.
 */

type Salida = { archivo: string; contenido: string };

export function archivosDeTemas(
  leer: (archivo: string) => string | null
): Salida[] {
  const temas = Object.values(TEMAS);
  const salidas: Salida[] = [
    {
      archivo: path.join("src", "themes", "temas.css"),
      contenido: cssDeTemas(temas, TEMA_BASE),
    },
  ];
  for (const tema of temas) {
    if (!tema.legado) continue;
    const archivo = path.join("src", "styles", "temas", `${tema.legado}.css`);
    const actual = leer(archivo);
    if (actual === null) continue;
    const nuevo = sincronizarLegado(actual, tema);
    if (nuevo === null) {
      throw new Error(
        `${archivo} no tiene un bloque \`:root {\`: arreglalo a mano.`
      );
    }
    salidas.push({ archivo, contenido: nuevo });
  }
  return salidas;
}

function main(): void {
  const check = process.argv.includes("--check");
  const leer = (archivo: string): string | null =>
    existsSync(archivo) ? readFileSync(archivo, "utf8") : null;

  const desactualizados: string[] = [];
  for (const { archivo, contenido } of archivosDeTemas(leer)) {
    if (leer(archivo) === contenido) continue;
    desactualizados.push(archivo);
    if (!check) writeFileSync(archivo, contenido);
  }

  if (desactualizados.length === 0) {
    console.log("temas: el CSS ya está al día.");
    return;
  }
  if (check) {
    console.error(
      `temas: desactualizado — ${desactualizados.join(", ")}. Corré \`pnpm temas:css\`.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`temas: escrito ${desactualizados.join(", ")}.`);
}

if (process.argv[1] && /temas-css\.ts$/.test(process.argv[1])) {
  main();
}
