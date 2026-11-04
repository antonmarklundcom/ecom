import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RUTAS_CACHEADAS } from "@/proxy";
import { destinoVidriera } from "@/lib/vidriera-cache";

import { stripComments } from "../helpers/source";

/**
 * La caché de la vidriera (ARCH.md §6, "Caché de la vidriera").
 *
 * Tres cosas que se rompen calladas: una página cacheada que lee cookies o
 * headers (con `force-static` llegan vacíos y la página sigue "andando", mal),
 * una escritura del panel que se olvida de tirar la caché (el dueño cambia un
 * precio y la ficha muestra el viejo) y la gemela con parámetros que deja de
 * ser la misma página que la cacheada.
 */

const read = (archivo: string) => readFileSync(archivo, "utf8");

/** `/categoria/[slug]` → `src/app/categoria/[slug]/page.tsx`. */
function archivoDe(ruta: string): string {
  return path.join("src", "app", ...ruta.split("/").filter(Boolean), "page.tsx");
}

describe("destinoVidriera", () => {
  const q = (query: string) => new URLSearchParams(query);

  it("la ficha y la categoría limpias salen de la caché", () => {
    expect(destinoVidriera("/producto/x", q(""))).toEqual({
      tipo: "cacheada",
      noindex: false,
    });
    expect(destinoVidriera("/categoria/x", q(""))).toEqual({
      tipo: "cacheada",
      noindex: false,
    });
  });

  it("cualquier parámetro propio va a la gemela", () => {
    for (const query of ["variante=A", "orden=nuevos", "page=2", "marca=x", "a_color=rojo", "foo=1"]) {
      expect(destinoVidriera("/categoria/x", q(query))).toEqual({
        tipo: "con-parametros",
        pathname: "/categoria/x/con-parametros",
      });
    }
  });

  it("los de campañas no, pero esa URL no se indexa", () => {
    for (const query of ["utm_source=ig&utm_campaign=x", "fbclid=1", "gclid=1", "srsltid=1", "igshid=1"]) {
      expect(destinoVidriera("/producto/x", q(query))).toEqual({
        tipo: "cacheada",
        noindex: true,
      });
    }
  });

  it("no decide nada fuera de la ficha y la categoría", () => {
    for (const ruta of ["/", "/buscar", "/checkout", "/producto", "/producto/x/con-parametros", "/categoria/x/y"]) {
      expect(destinoVidriera(ruta, q("variante=A"))).toEqual({ tipo: "otra" });
    }
  });
});

describe("las páginas cacheadas", () => {
  const paginas = RUTAS_CACHEADAS.map((ruta) => ({ ruta, archivo: archivoDe(ruta) }));

  it("existen", () => {
    for (const { archivo } of paginas) expect(existsSync(archivo), archivo).toBe(true);
  });

  it("son force-static con el mismo revalidate que el sitemap", () => {
    const sitemap = /export const revalidate = (\d+);/.exec(read("src/app/sitemap.ts"))?.[1];
    expect(sitemap).toBe("300");
    for (const { archivo } of paginas) {
      const source = read(archivo);
      expect(source, archivo).toMatch(/export const dynamic = "force-static";/);
      expect(/export const revalidate = (\d+);/.exec(source)?.[1], archivo).toBe(sitemap);
    }
  });

  it("no leen cookies ni headers: con force-static llegarían vacíos", () => {
    for (const { archivo } of paginas) {
      const source = stripComments(read(archivo));
      expect(source, archivo).not.toMatch(/from "next\/headers"/);
      expect(source, archivo).not.toMatch(/\b(cookies|headers)\(\)/);
    }
  });

  it("la ficha y la categoría tienen su gemela por request, que es la misma página", () => {
    for (const ruta of ["/producto/[slug]", "/categoria/[slug]"]) {
      const gemela = path.join("src", "app", ...ruta.split("/").filter(Boolean), "con-parametros", "page.tsx");
      const source = read(gemela);
      expect(source, gemela).toMatch(/export const dynamic = "force-dynamic";/);
      // Reusa `../page` y no copia nada: una tienda que rediseña la ficha no
      // tiene que acordarse de esta otra.
      expect(source, gemela).toMatch(/from "\.\.\/page";/);
      expect(source, gemela).not.toMatch(/export const revalidate/);
      // Abierta a mano (sin la marca del proxy), da 404.
      expect(source, gemela).toContain("HEADER_CON_PARAMETROS");
      expect(source, gemela).toContain("notFound()");
    }
  });
});

/**
 * Cada acción exportada de estos archivos que escribe algo que se ve en la
 * vidriera llama a `revalidarVidriera()` —directo o por un helper local que
 * la llama—. Las que no, están acá con el motivo: una acción nueva que no
 * figure en ninguno de los dos lados hace fallar el test, y la pregunta es
 * "¿esto cambia algo que ve la compradora?".
 */
const ARCHIVOS = [
  "admin-products.ts",
  "admin-categories.ts",
  "admin-ajustes.ts",
  "admin-integraciones.ts",
  "admin-reviews.ts",
  "admin-returns.ts",
  "admin-orders.ts",
  "admin-payments.ts",
  "checkout.ts",
];

const NO_TOCAN_LA_VIDRIERA: Record<string, string> = {
  previewCatalogImport: "sólo lee: arma la vista previa de la planilla",
  previewBulkPriceAdjustment: "sólo lee: muestra el resultado antes de aplicar",
  probarIntegracionAccion: "prueba la conexión, no guarda nada",
  resendOrderNotice: "reenvía un aviso: no cambia stock ni catálogo",
  previewReceipt: "firma una URL para ver el comprobante",
  addOrderNote: "una nota interna del pedido",
};

/** Las funciones exportadas de un archivo, con su cuerpo. */
function exportadas(source: string): { nombre: string; cuerpo: string }[] {
  const inicios = [...source.matchAll(/^export async function (\w+)/gm)];
  return inicios.map((match, i) => ({
    nombre: match[1]!,
    cuerpo: source.slice(match.index, inicios[i + 1]?.index ?? source.length),
  }));
}

/** `revalidarVidriera` y los helpers locales que la llaman (`revalidarCategorias`…). */
function invalidadores(source: string): Set<string> {
  const nombres = new Set(["revalidarVidriera"]);
  const locales = [...source.matchAll(/^function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)^\}/gm)];
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const [, nombre, cuerpo] of locales) {
      if (nombres.has(nombre!)) continue;
      if ([...nombres].some((n) => cuerpo!.includes(`${n}(`))) {
        nombres.add(nombre!);
        crecio = true;
      }
    }
  }
  return nombres;
}

describe("las escrituras invalidan la vidriera", () => {
  it.each(ARCHIVOS)("%s", (archivo) => {
    const source = read(path.join("src", "app", "actions", archivo));
    const nombres = invalidadores(source);
    const acciones = exportadas(source);
    expect(acciones.length, archivo).toBeGreaterThan(0);

    for (const { nombre, cuerpo } of acciones) {
      if (nombre in NO_TOCAN_LA_VIDRIERA) continue;
      const llama = [...nombres].some((n) => cuerpo.includes(`${n}(`));
      expect(llama, `${archivo} → ${nombre} no llama a revalidarVidriera()`).toBe(true);
    }
  });

  it("las excepciones existen (no quedan nombres viejos en la lista)", () => {
    const todas = new Set(
      ARCHIVOS.flatMap((archivo) =>
        exportadas(read(path.join("src", "app", "actions", archivo))).map((a) => a.nombre)
      )
    );
    for (const nombre of Object.keys(NO_TOCAN_LA_VIDRIERA)) {
      expect(todas.has(nombre), nombre).toBe(true);
    }
  });

  it("el cron que vence pedidos también, cuando liberó stock", () => {
    const source = read(path.join("src", "app", "api", "cron", "vencer-pedidos", "route.ts"));
    expect(source).toContain("revalidarVidriera()");
  });

  it("nadie más llama a revalidatePath(\"/\", \"layout\") por su cuenta", () => {
    const sueltos: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(completo);
        else if (/\.tsx?$/.test(entrada.name) && read(completo).includes('revalidatePath("/", "layout")')) {
          sueltos.push(completo);
        }
      }
    };
    recorrer("src");
    expect(sueltos).toEqual([path.join("src", "lib", "revalidar-vidriera.ts")]);
  });
});
