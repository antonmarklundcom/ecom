import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DIRECTORIO_GUIAS,
  leerCarpetaDeGuias,
  problemasDeGuias,
} from "@/lib/guias";

/**
 * El test de contenido de las guías (O34, docs/GUIAS.md § "Lo que el test
 * exige"). **Viaja a las tiendas** y mira `src/content/guias/` de la tienda:
 * en el template no hay ninguna guía y pasa vacío.
 *
 * Lo que frena un PR: un archivo que no se lee, slug distinto del nombre del
 * archivo, `titulo` de más de 70 caracteres, `descripcion` fuera de 110–160,
 * fechas inválidas, títulos repetidos, links que no son `https://` ni `/…`,
 * una guía sin categoría ni producto, `[COMPLETAR]` en una publicada.
 *
 * Lo que sólo informa (al final, en la salida del test): los slugs de
 * categoría y producto que nombra cada guía. Si alguno no existe en el
 * catálogo, la página lo saltea; quien escribe la guía lo confirma contra
 * `/admin` o el sitemap de la tienda.
 */

const carpeta = join(process.cwd(), DIRECTORIO_GUIAS);
const { guias, rotos } = leerCarpetaDeGuias(carpeta);

describe(`guías de la tienda (${DIRECTORIO_GUIAS})`, () => {
  it("todos los archivos se leen", () => {
    expect(rotos, JSON.stringify(rotos, null, 2)).toEqual([]);
  });

  it("cada guía cumple las reglas de docs/GUIAS.md", () => {
    const problemas = Object.fromEntries(problemasDeGuias(guias));
    expect(problemas).toEqual({});
  });

  it("informe: slugs del catálogo que nombran las guías", () => {
    const informe = guias.map((guia) => ({
      guia: guia.slug,
      borrador: guia.borrador,
      categorias: guia.categorias,
      productos: guia.productos,
    }));
    if (informe.length > 0) {
      console.info(
        `guías: ${informe.length} (${informe.filter((g) => !g.borrador).length} publicadas). ` +
          "Slugs a confirmar en el catálogo (la página saltea los que no existen):\n" +
          JSON.stringify(informe, null, 2)
      );
    }
    expect(Array.isArray(informe)).toBe(true);
  });
});
