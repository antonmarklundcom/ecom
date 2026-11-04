import { t } from "@/i18n";
import { slugify } from "@/lib/slug";

import { claveSku } from "./catalog-import";

/**
 * Posibles productos repetidos en una planilla, para que el dueño los mire
 * **antes** de confirmar (`/admin/productos` y `pnpm importar:productos`).
 *
 * Son señales, no pruebas: dos kits distintos pueden compartir nombre o foto.
 * Por eso no frenan como un error —el dueño los revisa y confirma igual— y
 * por eso tampoco se resuelven solos. Lo que sí es seguro que está mal (un
 * SKU que ya es de otro producto, un slug histórico) no llega acá: es un
 * error del plan y no se puede confirmar.
 *
 * Puro: recibe lo que entra y lo que hay, devuelve mensajes. El plan le pasa
 * de la base sólo los productos cuyo slug **no** está en la planilla (los que
 * sí, se actualizan: no son "otro producto"), así la lista no cambia entre
 * un lote y el siguiente de la misma importación.
 */

export type ProductoEntrante = {
  slug: string;
  name: string;
  categoryName: string;
  fotos: readonly string[];
  skus: readonly string[];
  supplierUrl?: string | null;
};

export type ProductoExistente = {
  slug: string;
  name: string;
  categoryName: string;
  skus: readonly string[];
  supplierUrl?: string | null;
};

/** Más que esto no se lee: se resume en una línea. */
export const MAX_AVISOS_DUPLICADOS = 30;

const PALABRAS_VACIAS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "para",
  "con",
  "y",
  "en",
  "un",
  "una",
  "x",
]);

function sinAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** "Remera  Básica" y "remera basica" son el mismo nombre. */
export function nombreNormalizado(nombre: string): string {
  return sinAcentos(nombre)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(" ");
}

/** Palabras con peso, sin plural simple: "termos" y "termo" son la misma. */
function palabras(nombre: string): Set<string> {
  return new Set(
    nombreNormalizado(nombre)
      .split(" ")
      .filter((palabra) => palabra && !PALABRAS_VACIAS.has(palabra))
      .map((palabra) =>
        palabra.length > 4 && palabra.endsWith("s")
          ? palabra.slice(0, -1)
          : palabra
      )
  );
}

/** La misma foto con otro tamaño o parámetro de CDN sigue siendo la misma. */
function claveFoto(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function nombresParecidos(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let comunes = 0;
  for (const palabra of a) if (b.has(palabra)) comunes += 1;
  return comunes >= 2 && comunes / Math.min(a.size, b.size) >= 0.8;
}

type Ficha = {
  slug: string;
  name: string;
  categoria: string;
  nombre: string;
  palabras: Set<string>;
  supplierUrl: string | null;
};

function ficha(producto: {
  slug: string;
  name: string;
  categoryName: string;
  supplierUrl?: string | null;
}): Ficha {
  return {
    slug: producto.slug,
    name: producto.name,
    categoria: slugify(producto.categoryName),
    nombre: nombreNormalizado(producto.name),
    palabras: palabras(producto.name),
    supplierUrl: producto.supplierUrl ?? null,
  };
}

/**
 * Los avisos, ordenados y sin repetir. `existentes` son los productos de la
 * tienda; los que tienen el mismo slug que uno de la planilla se usan sólo
 * para el aviso de "se va a sumar a uno que ya existe".
 */
export function catalogDuplicateWarnings(
  entrantes: readonly ProductoEntrante[],
  existentes: readonly ProductoExistente[]
): string[] {
  const avisos = new Set<string>();
  const slugsEntrantes = new Set(entrantes.map((p) => p.slug));

  // 1. Mismo slug que uno que ya existe, sin ningún SKU en común: la
  // planilla cree que trae un producto nuevo y en realidad le suma
  // variantes a otro.
  const existentePorSlug = new Map(existentes.map((p) => [p.slug, p]));
  for (const producto of entrantes) {
    const actual = existentePorSlug.get(producto.slug);
    if (!actual || actual.skus.length === 0) continue;
    const suyos = new Set(actual.skus.map(claveSku));
    if (producto.skus.some((sku) => suyos.has(claveSku(sku)))) continue;
    avisos.add(
      t("panel.productos.importar.duplicado.slugExistente", {
        a: producto.name,
        slug: producto.slug,
      })
    );
  }

  // 2–5. Contra los otros productos de la planilla y los de la tienda que la
  // planilla no toca.
  const fichasEntrantes = entrantes.map(ficha);
  const otros = [
    ...fichasEntrantes,
    ...existentes.filter((p) => !slugsEntrantes.has(p.slug)).map(ficha),
  ];
  const porNombre = new Map<string, Ficha[]>();
  const porCategoria = new Map<string, Ficha[]>();
  const porProveedor = new Map<string, Ficha[]>();
  const agregar = (mapa: Map<string, Ficha[]>, clave: string, otro: Ficha) => {
    const lista = mapa.get(clave);
    if (lista) lista.push(otro);
    else mapa.set(clave, [otro]);
  };
  for (const otro of otros) {
    agregar(porNombre, otro.nombre, otro);
    agregar(porCategoria, otro.categoria, otro);
    if (otro.supplierUrl) agregar(porProveedor, otro.supplierUrl, otro);
  }

  const par = (a: Ficha, b: Ficha) =>
    [a, b].sort((x, y) => x.slug.localeCompare(y.slug));

  for (const producto of fichasEntrantes) {
    const mismoNombre = new Set<string>();
    for (const otro of porNombre.get(producto.nombre) ?? []) {
      if (otro.slug === producto.slug) continue;
      mismoNombre.add(otro.slug);
      const [a, b] = par(producto, otro);
      avisos.add(
        t("panel.productos.importar.duplicado.mismoNombre", {
          a: a!.name,
          b: b!.name,
          slugA: a!.slug,
          slugB: b!.slug,
        })
      );
    }
    for (const otro of porCategoria.get(producto.categoria) ?? []) {
      if (otro.slug === producto.slug || mismoNombre.has(otro.slug)) continue;
      if (!nombresParecidos(producto.palabras, otro.palabras)) continue;
      const [a, b] = par(producto, otro);
      avisos.add(
        t("panel.productos.importar.duplicado.nombreParecido", {
          a: a!.name,
          b: b!.name,
        })
      );
    }
    if (producto.supplierUrl) {
      for (const otro of porProveedor.get(producto.supplierUrl) ?? []) {
        if (otro.slug === producto.slug) continue;
        const [a, b] = par(producto, otro);
        avisos.add(
          t("panel.productos.importar.duplicado.mismoProveedor", {
            a: a!.name,
            b: b!.name,
          })
        );
      }
    }
  }

  // Fotos: sólo entre filas de la planilla. Las de la tienda son ids del CDN
  // propio, no las URLs de origen, y compararlas no diría nada.
  const duenoDeFoto = new Map<string, ProductoEntrante>();
  for (const producto of entrantes) {
    for (const url of producto.fotos) {
      const clave = claveFoto(url);
      const otro = duenoDeFoto.get(clave);
      if (!otro) {
        duenoDeFoto.set(clave, producto);
        continue;
      }
      if (otro.slug === producto.slug) continue;
      const [a, b] = [otro, producto].sort((x, y) =>
        x.slug.localeCompare(y.slug)
      );
      avisos.add(
        t("panel.productos.importar.duplicado.fotoCompartida", {
          a: a!.name,
          b: b!.name,
        })
      );
    }
  }

  const lista = [...avisos].sort();
  return lista.length > MAX_AVISOS_DUPLICADOS
    ? [
        ...lista.slice(0, MAX_AVISOS_DUPLICADOS),
        t("panel.productos.importar.duplicado.mas", {
          n: lista.length - MAX_AVISOS_DUPLICADOS,
        }),
      ]
    : lista;
}
