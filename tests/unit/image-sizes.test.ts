import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { IMAGE_SIZES } from "@/lib/image-sizes";

/**
 * Toda foto de la vidriera sale con `sizes`.
 *
 * Sin `sizes`, el navegador asume que la imagen ocupa la pantalla entera
 * (`100vw`) y del `srcset` baja la versión más grande: en una grilla de dos
 * columnas en el celular eso es el doble de bytes por tarjeta, en la red
 * donde más duele. No se nota mirando la página —se ve igual de bien— y por
 * eso lo cuida un test y no una revisión a ojo.
 *
 * Es una lectura del código, no un render: cada `<Image` (de `next/image`) y
 * cada `<img` con `srcSet` de `src/app` y `src/components` tiene que traer el
 * atributo. El panel (`/admin`), el setup y las pantallas de desarrollo no
 * cuentan: no son vidriera ni las mide Lighthouse.
 */

const RAICES = [path.join("src", "app"), path.join("src", "components")];

const FUERA = [
  path.join("src", "app", "admin"),
  path.join("src", "app", "setup"),
  path.join("src", "app", "dev"),
  path.join("src", "components", "admin"),
  // La imagen de Open Graph se dibuja en el servidor con `ImageResponse`: es
  // un PNG, no HTML que baje un navegador.
  path.join("src", "app", "opengraph-image.tsx"),
];

function archivos(dir: string): string[] {
  if (FUERA.some((fuera) => dir === fuera)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (FUERA.includes(completo)) continue;
    if (statSync(completo).isDirectory()) {
      if (entrada === "__tests__") continue;
      salida.push(...archivos(completo));
    } else if (completo.endsWith(".tsx")) {
      salida.push(completo);
    }
  }
  return salida;
}

/**
 * Las etiquetas de apertura `<Image …>` / `<img …>` de un archivo, con sus
 * props. Cuenta llaves y comillas para no cortar en el `>` de un `=>` o de
 * una comparación adentro de una expresión.
 */
function etiquetas(source: string, nombre: string): string[] {
  const salida: string[] = [];
  const patron = new RegExp(`<${nombre}(?=[\\s/>])`, "g");
  let match: RegExpExecArray | null;
  while ((match = patron.exec(source))) {
    let llaves = 0;
    let comilla: string | null = null;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (comilla) {
        if (c === comilla && source[i - 1] !== "\\") comilla = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") comilla = c;
      else if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0) break;
    }
    salida.push(source.slice(match.index, i + 1));
  }
  return salida;
}

describe("sizes en las fotos de la vidriera", () => {
  const fuentes = RAICES.flatMap((raiz) => archivos(raiz)).map((archivo) => ({
    archivo,
    source: readFileSync(archivo, "utf8"),
  }));

  it("encuentra las fotos de la vidriera", () => {
    // Si el recorrido se rompe, el test de abajo pasaría vacío.
    const conImagen = fuentes.filter(({ source }) =>
      source.includes('from "next/image"')
    );
    expect(conImagen.map(({ archivo }) => archivo)).toEqual(
      expect.arrayContaining([
        path.join("src", "components", "product-image.tsx"),
        path.join("src", "components", "product-gallery.tsx"),
      ])
    );
  });

  it("ninguna <Image> ni <img srcSet> sale sin sizes", () => {
    const sinSizes: string[] = [];
    for (const { archivo, source } of fuentes) {
      const imagenes = source.includes('from "next/image"')
        ? etiquetas(source, "Image")
        : [];
      const crudas = etiquetas(source, "img").filter((tag) =>
        /\bsrcSet=/i.test(tag)
      );
      for (const tag of [...imagenes, ...crudas]) {
        if (!/\bsizes=/.test(tag)) {
          sinSizes.push(`${archivo}: ${tag.slice(0, 80).replace(/\s+/g, " ")}…`);
        }
      }
    }
    expect(sinSizes, sinSizes.join("\n")).toEqual([]);
  });

  it("el lector de etiquetas no corta en un => adentro de las props", () => {
    const [tag] = etiquetas(
      '<Image src={a} onLoad={() => x > 1} sizes="10px" />',
      "Image"
    );
    expect(tag).toContain('sizes="10px"');
  });

  it("los valores de la grilla no se pasan del contenedor de 1152 px", () => {
    // Un `sizes` más grande que el lugar de verdad baja bytes de más; uno
    // fijo en px tiene que caber en el contenedor.
    for (const valor of Object.values(IMAGE_SIZES)) {
      for (const px of valor.matchAll(/(\d+)px/g)) {
        expect(Number(px[1])).toBeLessThanOrEqual(1152);
      }
      // Cada `sizes` termina en un ancho sin media query: el que vale cuando
      // ninguna condición se cumple.
      expect(valor.split(",").at(-1)!.trim()).not.toMatch(/^\(/);
    }
  });
});
