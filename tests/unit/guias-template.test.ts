import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { soloTemplateABorrar } from "../../scripts/nueva-tienda";
import {
  esDeLaTienda,
  esMaquinaria,
  esMixto,
  esRutaDePiel,
} from "../../scripts/template-shared";
import { decidirArchivo } from "../../scripts/template-sync";

/**
 * Cómo viajan las guías entre el template y una tienda (O34): `src/content/`
 * es de la tienda, `src/app/guias` es mixto (piel sobre maquinaria) y
 * `src/lib/guias.ts` es maquinaria. El sync con git de verdad está en
 * `tests/integration/template-sync.test.ts` ("src/content/ es de la tienda").
 */

describe("clasificación de las guías", () => {
  it("src/content/ es de la tienda; la lectura es maquinaria; las páginas, mixtas", () => {
    expect(esDeLaTienda("src/content/guias/como-elegir.md")).toBe(true);
    expect(esDeLaTienda("src/content/guias/README.md")).toBe(true);
    expect(esMaquinaria("src/content/guias/como-elegir.md")).toBe(false);
    expect(esMaquinaria("src/lib/guias.ts")).toBe(true);
    expect(esMaquinaria("src/lib/markdown-guia.ts")).toBe(true);
    expect(esMixto("src/app/guias/page.tsx")).toBe(true);
    expect(esMixto("src/app/guias/[slug]/page.tsx")).toBe(true);
    expect(esRutaDePiel("src/components/guia-lista.tsx")).toBe(true);
  });

  it("template:sync nunca pisa ni borra un archivo de src/content/", () => {
    const ruta = "src/content/guias/como-elegir.md";
    const v = (base: string | null, tienda: string | null, template: string | null) => ({
      base,
      tienda,
      template,
    });
    // La tienda tiene el suyo: queda, cambie o desaparezca el del template.
    expect(decidirArchivo(ruta, v("a", "a", "b"))).toBe("conservar");
    expect(decidirArchivo(ruta, v("a", "a", null))).toBe("conservar");
    expect(decidirArchivo(ruta, v(null, "t", "b"))).toBe("conservar");
    // Lo que el template agrega y la tienda no tiene, llega.
    expect(decidirArchivo(ruta, v(null, null, "b"))).toBe("tomar-template");
    // Una guía que sólo tiene la tienda ni siquiera aparece en el diff del template.
  });

  it("pnpm nueva-tienda no borra src/content/", () => {
    const borra = soloTemplateABorrar("La Esquina", () => true);
    expect(borra.some((ruta) => ruta.startsWith("src/content"))).toBe(false);
  });
});

describe("las guías y el modo de venta (O32)", () => {
  it("las tarjetas de producto de una guía reciben el modo de venta de la tienda", () => {
    // Sin el prop, en "consulta" una tarjeta de un producto con stock seguía
    // ofreciendo comprar desde la guía.
    const fuente = readFileSync("src/app/guias/[slug]/page.tsx", "utf8");
    const tarjetas = [...fuente.matchAll(/<ProductCard\b[^>]*>/g)].map((m) => m[0]);
    expect(tarjetas.length).toBeGreaterThan(0);
    for (const tarjeta of tarjetas) expect(tarjeta).toMatch(/\{\.\.\.propsDeModoVenta\(modoVenta\)\}/);
    expect(fuente).toMatch(/modoVentaEfectivo\(\)/);
  });
});

describe("las guías y el contador de consultas (O33)", () => {
  /** Todo lo que dibujan las guías: sus páginas y sus componentes. */
  function fuentesDeGuias(): { archivo: string; fuente: string }[] {
    const archivos: string[] = [];
    const recorrer = (carpeta: string): void => {
      for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
        const ruta = join(carpeta, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (entrada.name.endsWith(".tsx")) archivos.push(ruta);
      }
    };
    recorrer("src/app/guias");
    for (const nombre of readdirSync("src/components")) {
      if (/^guia-.*\.tsx$/.test(nombre)) archivos.push(join("src/components", nombre));
    }
    return archivos.map((archivo) => ({ archivo, fuente: readFileSync(archivo, "utf8") }));
  }

  it("todo link de WhatsApp de las guías lleva atributosConsulta(\"guia\")", () => {
    let links = 0;
    for (const { archivo, fuente } of fuentesDeGuias()) {
      // Cada <a …> cuyo href es un link de WhatsApp (wa.me o el waHref de la página).
      for (const [ancla] of fuente.matchAll(/<a\b[^>]*>/g)) {
        if (!/wa\.me|waHref|whatsapp/i.test(ancla)) continue;
        links += 1;
        expect(ancla, archivo).toMatch(/\{\.\.\.atributosConsulta\("guia"\)\}/);
      }
    }
    // La página de una guía tiene uno; si desaparece, este test no protege nada.
    expect(links).toBeGreaterThan(0);
  });
});
