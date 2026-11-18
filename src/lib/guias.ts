/**
 * Guías de compra: archivos `src/content/guias/<slug>.md` del repo de la
 * tienda (fable/plan-trafico.md §2.3, docs/GUIAS.md).
 *
 * Una guía es un archivo, no una fila: la escribe una sesión, se revisa en un
 * PR y se publica con el deploy. No hay tabla, ni migración, ni editor en el
 * panel. El template no trae ninguna: sin guías publicadas `/guias` es 404,
 * el pie no tiene link y el sitemap no tiene entrada (vacío = apagado).
 *
 * ### Formato
 *
 * Front matter entre dos `---` y el cuerpo en markdown (`markdown-guia.ts`).
 * El front matter es un subconjunto chico de YAML, leído acá sin dependencia
 * (la misma razón que `markdown.ts`: seis formas de dato no justifican una
 * librería de runtime con su cadena de dependencias):
 *
 * ```
 * titulo: Cómo elegir un colchón
 * descripcion: "Texto de 110 a 160 caracteres…"
 * publicada: 2026-11-20
 * actualizada: 2026-11-20
 * borrador: false
 * imagen: https://imagenes.tienda.com.py/guias/colchon.webp
 * categorias: [colchones, sommiers]
 * productos:
 *   - colchon-resortes-140
 * faq:
 *   - pregunta: ¿Cuánto dura un colchón?
 *     respuesta: Depende del uso…
 * fuentes:
 *   - titulo: Ministerio de Industria y Comercio
 *     url: https://www.mic.gov.py/…
 * ```
 *
 * Escalares (con o sin comillas), listas en línea `[a, b]`, listas en bloque
 * `- a` y listas de pares `- clave: valor`. Nada más: un ancla, un `|` o un
 * mapa anidado más profundo es un error del archivo, no algo que se adivina.
 *
 * ### Cuándo se lee
 *
 * Las páginas de `/guias` son estáticas (`generateStaticParams`, ISR) y leen
 * los archivos al construirse. La home, las categorías, los productos y el
 * sitemap también los leen al regenerarse; la lectura se memoiza por proceso,
 * y como los archivos sólo cambian con un deploy, el proceso nuevo los lee de
 * nuevo. Un archivo roto se saltea con un `log.error` — nunca tumba el build
 * de una tienda; el test de contenido (`tests/unit/guias-contenido.test.ts`)
 * es el que lo frena antes, en el PR.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { log } from "./log";

/** Dónde viven las guías de la tienda, relativo a la raíz del repo. */
export const DIRECTORIO_GUIAS = "src/content/guias";

/**
 * Sólo para los tests de navegador: el build de `e2e` lee las guías de
 * ejemplo de `tests/fixtures/guias/`. Se acepta **sólo** una carpeta adentro
 * de `tests/fixtures/`: no es una variable de la tienda, y una ruta cualquiera
 * no puede convertirse en contenido publicado.
 */
const VARIABLE_FIXTURES = "GUIAS_DIR";
const RAIZ_FIXTURES = "tests/fixtures";

export type ParPreguntaRespuesta = { pregunta: string; respuesta: string };
export type Fuente = { titulo: string; url: string };

export type Guia = {
  slug: string;
  titulo: string;
  descripcion: string;
  /** `YYYY-MM-DD`, día de Paraguay. */
  publicada: string;
  /** `YYYY-MM-DD`; el último cambio de contenido. */
  actualizada: string;
  categorias: string[];
  productos: string[];
  faq: ParPreguntaRespuesta[];
  fuentes: Fuente[];
  borrador: boolean;
  /** `https://…` o una ruta propia `/…`. Opcional. */
  imagen: string | null;
  /** El markdown del cuerpo, sin el front matter. */
  cuerpo: string;
};

/** Un slug de guía: el nombre del archivo, en minúsculas con guiones. */
export const SLUG_GUIA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

type Valor = string | string[] | Record<string, string>[];

/** Saca las comillas de un escalar (`"…"` o `'…'`) y los espacios del borde. */
function escalar(crudo: string): string {
  const texto = crudo.trim();
  if (texto.length >= 2) {
    const primera = texto[0];
    if ((primera === '"' || primera === "'") && texto.endsWith(primera)) {
      const adentro = texto.slice(1, -1);
      return primera === '"'
        ? adentro.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : adentro.replace(/''/g, "'");
    }
  }
  return texto;
}

/** `[a, b, "c, d"]` → `["a", "b", "c, d"]`. */
function listaEnLinea(crudo: string): string[] {
  const adentro = crudo.trim().slice(1, -1);
  const items: string[] = [];
  let actual = "";
  let comilla: string | null = null;
  for (const caracter of adentro) {
    if (comilla) {
      actual += caracter;
      if (caracter === comilla) comilla = null;
    } else if (caracter === '"' || caracter === "'") {
      comilla = caracter;
      actual += caracter;
    } else if (caracter === ",") {
      items.push(actual);
      actual = "";
    } else {
      actual += caracter;
    }
  }
  items.push(actual);
  return items.map(escalar).filter((item) => item !== "");
}

/** `clave: valor` → `[clave, valor]`, o `null` si la línea no es eso. */
function parClave(linea: string): [string, string] | null {
  const encontrado = /^([a-z_][a-z0-9_]*):(?:\s+(.*))?$/i.exec(linea);
  return encontrado ? [encontrado[1]!, (encontrado[2] ?? "").trim()] : null;
}

/**
 * El front matter de una guía → claves y valores crudos. Tira `Error` con la
 * línea que no entiende: un archivo mal escrito no se adivina.
 */
export function parsearFrontMatter(texto: string): Record<string, Valor> {
  const datos: Record<string, Valor> = {};
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i]!;
    if (linea.trim() === "" || linea.trimStart().startsWith("#")) {
      i += 1;
      continue;
    }
    if (/^\s/.test(linea)) {
      throw new Error(`línea ${i + 1}: sangría sin una clave arriba`);
    }
    const par = parClave(linea);
    if (!par) throw new Error(`línea ${i + 1}: se esperaba "clave: valor"`);
    const [clave, valor] = par;
    if (clave in datos) throw new Error(`línea ${i + 1}: "${clave}" repetida`);
    i += 1;

    if (valor !== "") {
      if (/^[|>&*!]/.test(valor)) {
        throw new Error(`línea ${i}: "${clave}" usa YAML que no se acepta acá`);
      }
      datos[clave] =
        valor.startsWith("[") && valor.endsWith("]")
          ? listaEnLinea(valor)
          : escalar(valor);
      continue;
    }

    // Lista en bloque: `- a` o `- clave: valor` (+ líneas `  clave: valor`).
    const simples: string[] = [];
    const pares: Record<string, string>[] = [];
    while (i < lineas.length) {
      const item = lineas[i]!;
      if (item.trim() === "") {
        i += 1;
        continue;
      }
      const guion = /^(\s*)-\s+(.*)$/.exec(item);
      if (guion) {
        const contenido = guion[2]!;
        const interno = parClave(contenido);
        if (interno && !/^https?:/i.test(contenido)) {
          const registro: Record<string, string> = {
            [interno[0]]: escalar(interno[1]),
          };
          i += 1;
          const sangria = guion[1]!.length + 2;
          while (i < lineas.length) {
            const siguiente = lineas[i]!;
            const propia = /^(\s*)(\S.*)$/.exec(siguiente);
            if (!propia || propia[1]!.length < sangria) break;
            if (propia[2]!.startsWith("- ")) break;
            const otro = parClave(propia[2]!);
            if (!otro) {
              throw new Error(`línea ${i + 1}: se esperaba "clave: valor"`);
            }
            registro[otro[0]] = escalar(otro[1]);
            i += 1;
          }
          pares.push(registro);
        } else {
          simples.push(escalar(contenido));
          i += 1;
        }
        continue;
      }
      if (/^\s/.test(item)) {
        throw new Error(`línea ${i + 1}: se esperaba un ítem "- …"`);
      }
      break;
    }
    if (simples.length > 0 && pares.length > 0) {
      throw new Error(`"${clave}": mezcla ítems simples y pares`);
    }
    datos[clave] = pares.length > 0 ? pares : simples;
  }
  return datos;
}

/** `---\n…\n---\n cuerpo` → front matter y cuerpo. */
export function separarFrontMatter(texto: string): {
  frontMatter: string;
  cuerpo: string;
} {
  const normal = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const encontrado = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normal);
  if (!encontrado) throw new Error("falta el front matter entre dos líneas ---");
  return { frontMatter: encontrado[1]!, cuerpo: encontrado[2]!.trim() };
}

const CLAVES = new Set([
  "titulo",
  "descripcion",
  "publicada",
  "actualizada",
  "categorias",
  "productos",
  "faq",
  "fuentes",
  "borrador",
  "imagen",
]);

function texto(datos: Record<string, Valor>, clave: string): string {
  const valor = datos[clave];
  if (valor === undefined) return "";
  // `descripcion: [COMPLETAR]` sin comillas se lee como lista en línea: vuelve
  // a ser el texto que se escribió, y la regla de `[COMPLETAR]` lo ve.
  if (Array.isArray(valor) && valor.every((item) => typeof item === "string")) {
    return `[${valor.join(", ")}]`;
  }
  if (typeof valor !== "string") throw new Error(`"${clave}" tiene que ser texto`);
  return valor;
}

function lista(datos: Record<string, Valor>, clave: string): string[] {
  const valor = datos[clave];
  if (valor === undefined || valor === "") return [];
  if (typeof valor === "string") return [valor];
  if (valor.some((item) => typeof item !== "string")) {
    throw new Error(`"${clave}" tiene que ser una lista de slugs`);
  }
  return valor as string[];
}

function pares<K extends string>(
  datos: Record<string, Valor>,
  clave: string,
  campos: readonly [K, K]
): Record<K, string>[] {
  const valor = datos[clave];
  if (valor === undefined || valor === "") return [];
  if (!Array.isArray(valor) || valor.some((item) => typeof item === "string")) {
    throw new Error(`"${clave}" tiene que ser una lista de ${campos.join("/")}`);
  }
  return (valor as Record<string, string>[]).map((registro, indice) => {
    const sobra = Object.keys(registro).filter(
      (campo) => !(campos as readonly string[]).includes(campo)
    );
    if (sobra.length > 0) {
      throw new Error(`"${clave}" #${indice + 1}: no conozco ${sobra.join(", ")}`);
    }
    for (const campo of campos) {
      if (!registro[campo]?.trim()) {
        throw new Error(`"${clave}" #${indice + 1}: falta "${campo}"`);
      }
    }
    return registro as Record<K, string>;
  });
}

/**
 * Un archivo de guía → `Guia`. Tira `Error` si no se puede leer; lo que se
 * puede leer pero está mal (largos, fechas, links) lo dice `problemasDeGuia`.
 */
export function parsearGuia(slug: string, contenido: string): Guia {
  const { frontMatter, cuerpo } = separarFrontMatter(contenido);
  const datos = parsearFrontMatter(frontMatter);
  const desconocidas = Object.keys(datos).filter((clave) => !CLAVES.has(clave));
  if (desconocidas.length > 0) {
    throw new Error(`claves que no conozco: ${desconocidas.join(", ")}`);
  }
  const borrador = texto(datos, "borrador");
  if (!["", "true", "false"].includes(borrador)) {
    throw new Error('"borrador" tiene que ser true o false');
  }
  return {
    slug,
    titulo: texto(datos, "titulo"),
    descripcion: texto(datos, "descripcion"),
    publicada: texto(datos, "publicada"),
    actualizada: texto(datos, "actualizada") || texto(datos, "publicada"),
    categorias: lista(datos, "categorias"),
    productos: lista(datos, "productos"),
    faq: pares(datos, "faq", ["pregunta", "respuesta"] as const),
    fuentes: pares(datos, "fuentes", ["titulo", "url"] as const),
    borrador: borrador === "true",
    imagen: texto(datos, "imagen") || null,
    cuerpo,
  };
}

// ---------------------------------------------------------------------------
// Las reglas del contenido (docs/GUIAS.md § "Lo que el test exige")
// ---------------------------------------------------------------------------

export const TITULO_MAX = 70;
export const DESCRIPCION_MIN = 110;
export const DESCRIPCION_MAX = 160;
export const MARCA_COMPLETAR = "[COMPLETAR]";

/** `YYYY-MM-DD` que existe en el calendario. */
export function esFechaValida(fecha: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!partes) return false;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const comoFecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    comoFecha.getUTCFullYear() === anio &&
    comoFecha.getUTCMonth() === mes - 1 &&
    comoFecha.getUTCDate() === dia
  );
}

/** Los destinos de los links `[texto](destino)` del cuerpo. */
export function linksDelCuerpo(cuerpo: string): string[] {
  return [...cuerpo.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
}

/**
 * Lo que está mal en una guía ya leída. Vacío = publicable. No mira otras
 * guías (el título repetido lo ve `problemasDeGuias`) ni la base (los slugs
 * que no existen se saltean al dibujar y los lista `slugsDesconocidos`).
 */
export function problemasDeGuia(guia: Guia): string[] {
  const problemas: string[] = [];
  if (!SLUG_GUIA.test(guia.slug)) {
    problemas.push(`el nombre del archivo "${guia.slug}" no es un slug (a-z, 0-9, guiones)`);
  }
  if (!guia.titulo) problemas.push("falta titulo");
  else if ([...guia.titulo].length > TITULO_MAX) {
    problemas.push(`titulo tiene ${[...guia.titulo].length} caracteres (máximo ${TITULO_MAX})`);
  }
  const largo = [...guia.descripcion].length;
  if (largo < DESCRIPCION_MIN || largo > DESCRIPCION_MAX) {
    problemas.push(
      `descripcion tiene ${largo} caracteres (entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX})`
    );
  }
  if (!esFechaValida(guia.publicada)) {
    problemas.push(`publicada "${guia.publicada}" no es una fecha YYYY-MM-DD`);
  }
  if (!esFechaValida(guia.actualizada)) {
    problemas.push(`actualizada "${guia.actualizada}" no es una fecha YYYY-MM-DD`);
  } else if (esFechaValida(guia.publicada) && guia.actualizada < guia.publicada) {
    problemas.push("actualizada es anterior a publicada");
  }
  if (guia.categorias.length + guia.productos.length === 0) {
    problemas.push("tiene que nombrar al menos una categoría o un producto");
  }
  for (const slug of [...guia.categorias, ...guia.productos]) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      problemas.push(`"${slug}" no es un slug`);
    }
  }
  if (!guia.cuerpo) problemas.push("el cuerpo está vacío");
  if (/^#\s/m.test(guia.cuerpo)) {
    problemas.push("el cuerpo usa un encabezado # (h1): los títulos empiezan en ##");
  }
  for (const destino of linksDelCuerpo(guia.cuerpo)) {
    if (!destino.startsWith("https://") && !/^\/(?!\/)/.test(destino)) {
      problemas.push(`link "${destino}": sólo https:// o una ruta propia /…`);
    }
  }
  for (const fuente of guia.fuentes) {
    if (!/^https:\/\/[^\s]+$/.test(fuente.url)) {
      problemas.push(`fuente "${fuente.titulo}": la url tiene que ser https://`);
    }
  }
  if (guia.imagen && !/^https:\/\/[^\s]+$/.test(guia.imagen) && !/^\/(?!\/)\S+$/.test(guia.imagen)) {
    problemas.push("imagen: sólo https:// o una ruta propia /…");
  }
  if (!guia.borrador) {
    const todo = [
      guia.titulo,
      guia.descripcion,
      guia.cuerpo,
      ...guia.faq.flatMap((par) => [par.pregunta, par.respuesta]),
      ...guia.fuentes.map((fuente) => fuente.titulo),
    ].join("\n");
    if (todo.includes(MARCA_COMPLETAR)) {
      problemas.push(`una guía publicada no puede tener ${MARCA_COMPLETAR}`);
    }
  }
  return problemas;
}

/** `problemasDeGuia` de cada una más los que cruzan guías (título repetido). */
export function problemasDeGuias(guias: readonly Guia[]): Map<string, string[]> {
  const resultado = new Map<string, string[]>();
  const porTitulo = new Map<string, string>();
  for (const guia of guias) {
    const problemas = problemasDeGuia(guia);
    const clave = guia.titulo.trim().toLocaleLowerCase("es-PY");
    const otra = porTitulo.get(clave);
    if (clave && otra) problemas.push(`mismo titulo que "${otra}"`);
    else if (clave) porTitulo.set(clave, guia.slug);
    if (problemas.length > 0) resultado.set(guia.slug, problemas);
  }
  return resultado;
}

/**
 * Los slugs que las guías nombran y el catálogo no tiene. No es un error del
 * archivo: la página los saltea (un producto despublicado no rompe la guía).
 * Es el informe para quien escribe guías.
 */
export function slugsDesconocidos(
  guias: readonly Guia[],
  existentes: { categorias: Iterable<string>; productos: Iterable<string> }
): { guia: string; tipo: "categoria" | "producto"; slug: string }[] {
  const categorias = new Set(existentes.categorias);
  const productos = new Set(existentes.productos);
  return guias.flatMap((guia) => [
    ...guia.categorias
      .filter((slug) => !categorias.has(slug))
      .map((slug) => ({ guia: guia.slug, tipo: "categoria" as const, slug })),
    ...guia.productos
      .filter((slug) => !productos.has(slug))
      .map((slug) => ({ guia: guia.slug, tipo: "producto" as const, slug })),
  ]);
}

// ---------------------------------------------------------------------------
// Leer la carpeta
// ---------------------------------------------------------------------------

/**
 * La carpeta de guías: `src/content/guias/` de la tienda, o la de fixtures si
 * `GUIAS_DIR` apunta adentro de `tests/fixtures/` (sólo tests de navegador).
 */
export function directorioGuias(
  raiz: string = process.cwd(),
  entorno: Record<string, string | undefined> = process.env
): string {
  const pedido = entorno[VARIABLE_FIXTURES]?.trim();
  if (pedido) {
    const absoluto = resolve(raiz, pedido);
    const desdeFixtures = relative(resolve(raiz, RAIZ_FIXTURES), absoluto);
    if (desdeFixtures && !desdeFixtures.startsWith("..") && !isAbsolute(desdeFixtures)) {
      return absoluto;
    }
    log.warn("guias: GUIAS_DIR fuera de tests/fixtures, se ignora", { pedido });
  }
  return join(raiz, DIRECTORIO_GUIAS);
}

export type LecturaGuias = {
  guias: Guia[];
  /** Archivos que no se pudieron leer, con el motivo. */
  rotos: { archivo: string; error: string }[];
};

/**
 * Todas las guías de una carpeta, publicadas y borradores, sin filtrar. Lo
 * que no es `*.md` (o es `README.md`) no es una guía. Una carpeta que no
 * existe es "sin guías", no un error.
 */
export function leerCarpetaDeGuias(carpeta: string): LecturaGuias {
  if (!existsSync(carpeta)) return { guias: [], rotos: [] };
  const guias: Guia[] = [];
  const rotos: LecturaGuias["rotos"] = [];
  const archivos = readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith(".md") && archivo.toLowerCase() !== "readme.md")
    .sort();
  for (const archivo of archivos) {
    try {
      guias.push(
        parsearGuia(archivo.slice(0, -3), readFileSync(join(carpeta, archivo), "utf8"))
      );
    } catch (error) {
      rotos.push({
        archivo,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { guias, rotos };
}

/** Más nueva primero; a igual fecha, por slug (orden estable entre builds). */
function porFecha(a: Guia, b: Guia): number {
  return b.publicada.localeCompare(a.publicada) || a.slug.localeCompare(b.slug);
}

let memo: { carpeta: string; guias: Guia[] } | null = null;

/**
 * Las guías que se pueden mostrar: leídas una vez por proceso, sin las rotas
 * ni las que no pasan `problemasDeGuia` (salvo que sean borradores, que se ven
 * fuera de producción para revisarlas).
 */
function guiasLeidas(): Guia[] {
  const carpeta = directorioGuias();
  if (memo && memo.carpeta === carpeta) return memo.guias;
  const { guias, rotos } = leerCarpetaDeGuias(carpeta);
  for (const roto of rotos) {
    log.error("guias: archivo que no se puede leer, se saltea", roto);
  }
  const conProblemas = problemasDeGuias(guias);
  const validas = guias.filter((guia) => {
    const problemas = conProblemas.get(guia.slug);
    if (problemas && !guia.borrador) {
      log.error("guias: guía con problemas, no se publica", {
        guia: guia.slug,
        problemas: problemas.join("; "),
      });
      return false;
    }
    return true;
  });
  memo = { carpeta, guias: validas.sort(porFecha) };
  return memo.guias;
}

/** Sólo para tests: olvidar lo leído. */
export function olvidarGuias(): void {
  memo = null;
}

/** ¿Se ven los borradores? Sólo fuera de producción (`next dev`, tests). */
function conBorradores(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Las publicadas (nunca borradores), más nueva primero. */
export function guiasPublicadas(): Guia[] {
  return guiasLeidas().filter((guia) => !guia.borrador);
}

/** ¿Hay alguna guía publicada? Apaga el índice, el link del pie y el sitemap. */
export function hayGuias(): boolean {
  return guiasPublicadas().length > 0;
}

/** Los slugs que se construyen como página: publicadas, y borradores fuera de producción. */
export function slugsDeGuias(): string[] {
  return guiasLeidas()
    .filter((guia) => !guia.borrador || conBorradores())
    .map((guia) => guia.slug);
}

/** Una guía por slug; un borrador en producción no existe. */
export function guiaPorSlug(slug: string): Guia | null {
  const guia = guiasLeidas().find((candidata) => candidata.slug === slug);
  if (!guia || (guia.borrador && !conBorradores())) return null;
  return guia;
}

/** Las publicadas que nombran esta categoría. */
export function guiasDeCategoria(slug: string): Guia[] {
  return guiasPublicadas().filter((guia) => guia.categorias.includes(slug));
}

/** Las publicadas que nombran este producto. */
export function guiasDeProducto(slug: string): Guia[] {
  return guiasPublicadas().filter((guia) => guia.productos.includes(slug));
}

/** `YYYY-MM-DD` → la medianoche de ese día en Paraguay (−03:00). */
export function fechaDeGuia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-03:00`);
}
