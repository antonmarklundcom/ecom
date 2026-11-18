import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listSourceFiles, stripComments } from "../helpers/source";

/**
 * `src/config/tienda.ts` es de la tienda: `template:sync` nunca lo pisa, así
 * que el tipo `Tienda` de una tienda vieja no gana los campos que el template
 * agrega después. Un campo nuevo se lee con su lector (que acepta un `TIENDA`
 * sin él), nunca como `TIENDA.<campo>`: así una tienda de antes compila
 * después del sync (O36, tienda "Norte" del arnés, desde v2.0.1).
 *
 * Al agregar un campo opcional a `Tienda`, sumalo acá con su lector.
 */
const CAMPOS_NUEVOS: Record<string, string> = {
  modoVenta: "modoVentaDeFabrica() de src/domain/modo-venta.ts",
  marcaBuscable: "marcaBuscable() de tests/helpers/marca-buscable.ts",
};

describe("campos nuevos de TIENDA", () => {
  it("nadie fuera de tienda.ts lee un campo nuevo como TIENDA.<campo>", async () => {
    const archivos = await listSourceFiles(["src", "scripts", "tests"]);
    const hallazgos: string[] = [];
    for (const archivo of archivos) {
      if (archivo.split(path.sep).join("/") === "src/config/tienda.ts") continue;
      const codigo = stripComments(readFileSync(archivo, "utf8"));
      for (const [campo, lector] of Object.entries(CAMPOS_NUEVOS)) {
        if (new RegExp(`\\bTIENDA\\??\\.${campo}\\b`).test(codigo))
          hallazgos.push(`${archivo}: TIENDA.${campo} → usá ${lector}`);
      }
    }
    expect(hallazgos).toEqual([]);
  });
});
