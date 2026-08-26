import { IVA_RATES, type IvaRate } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { slugify } from "@/lib/slug";

/**
 * La planilla de productos → un catálogo validado (`pnpm importar:productos`).
 *
 * El trabajo más lento de montar una tienda nueva no es el deploy: es cargar
 * cien productos a mano en `/admin/productos`. El comercio ya tiene su lista
 * de precios en una planilla; este módulo la entiende.
 *
 * El formato es **el mismo que baja el export del panel** (una fila por
 * variante, encabezados en español) más columnas opcionales que el export no
 * tiene: Descripción, Marca, IVA, Precio antes y Slug. Así el ciclo
 * exportar → tocar en Excel → importar funciona sin convertir nada.
 *
 * Todo acá es puro — texto entra, catálogo o errores salen — para poder
 * testearlo sin base. La base (qué categoría existe, qué SKU es de quién) la
 * mira el script, que es quien puede preguntarle.
 *
 * Regla de la casa: **todos** los errores de una vez, con número de línea.
 * Una planilla de 300 filas que se corrige a razón de un error por corrida es
 * una tarde perdida.
 */

export type CatalogoVariante = {
  sku: string;
  label: string;
  pricePyg: number;
  compareAtPyg: number | null;
  onHand: number;
};

export type CatalogoProducto = {
  /** De la columna Slug, o derivado del nombre. */
  slug: string;
  name: string;
  description: string | null;
  /** Tal como vino en la planilla; el script lo resuelve contra la base. */
  categoryName: string;
  brand: string | null;
  ivaRate: IvaRate;
  variants: CatalogoVariante[];
};

export type CatalogoImportado = {
  productos: CatalogoProducto[];
  /** Con número de línea. Si hay al menos uno, `productos` no sirve. */
  errores: string[];
};

/**
 * Encabezado de la planilla → campo. Se normaliza sin acentos, en minúsculas
 * y sin el `(₲)` decorativo, así "Categoría", "categoria" y "CATEGORIA" son
 * la misma columna. Los nombres canónicos son los que escribe
 * `exportProductsCsv` (i18n `csv.producto.*`).
 */
const COLUMNAS: Record<string, keyof FilaCruda> = {
  sku: "sku",
  producto: "producto",
  nombre: "producto",
  categoria: "categoria",
  variante: "variante",
  precio: "precio",
  stock: "stock",
  descripcion: "descripcion",
  marca: "marca",
  iva: "iva",
  "precio antes": "precioAntes",
  slug: "slug",
};

type FilaCruda = {
  sku: string;
  producto: string;
  categoria: string;
  variante: string;
  precio: string;
  stock: string;
  descripcion: string;
  marca: string;
  iva: string;
  precioAntes: string;
  slug: string;
};

const REQUERIDAS: ReadonlyArray<keyof FilaCruda> = ["sku", "producto", "categoria", "precio"];

function normalizarEncabezado(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `"1.234.567"`, `"₲ 285.000"` o `"285000"` → guaraníes enteros.
 *
 * Los puntos sólo se aceptan como separador de miles bien agrupado: `"28.50"`
 * no es plata paraguaya y devolver 2850 en silencio sería inventar un precio.
 * Coma decimal, negativo o cualquier otra cosa → `null`, y quien llama arma
 * el error con la línea.
 */
export function parseGs(value: string): number | null {
  const texto = value.replace(/₲|Gs\.?/gi, "").replace(/\s/g, "");
  const sinMiles = /^\d{1,3}(\.\d{3})+$/.test(texto) ? texto.replace(/\./g, "") : texto;
  if (!/^\d+$/.test(sinMiles)) return null;
  const n = Number(sinMiles);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseCatalogo(text: string): CatalogoImportado {
  const filas = parseCsv(text);
  const errores: string[] = [];

  const primeraFila = filas[0];
  if (!primeraFila) {
    return { productos: [], errores: ["La planilla está vacía."] };
  }

  // --- Encabezado ---------------------------------------------------------
  const encabezado = primeraFila.map(normalizarEncabezado);
  const indice = new Map<keyof FilaCruda, number>();
  for (const [col, nombre] of encabezado.entries()) {
    const campo = COLUMNAS[nombre];
    if (campo && !indice.has(campo)) indice.set(campo, col);
  }
  for (const campo of REQUERIDAS) {
    if (!indice.has(campo)) {
      errores.push(
        `Falta la columna "${campo}" en el encabezado. Las obligatorias son: SKU, Producto, Categoría y Precio (₲); el resto — Variante, Stock, Descripción, Marca, IVA, Precio antes (₲), Slug — es opcional.`,
      );
    }
  }
  if (errores.length > 0) return { productos: [], errores };

  const celda = (fila: string[], campo: keyof FilaCruda): string => {
    const col = indice.get(campo);
    return col === undefined ? "" : (fila[col] ?? "").trim();
  };

  // --- Filas → variantes agrupadas por producto ---------------------------
  const porSlug = new Map<string, CatalogoProducto & { primeraLinea: number }>();
  const skusVistos = new Map<string, number>();

  for (const [i, fila] of filas.slice(1).entries()) {
    const linea = i + 2; // 1-based, contando el encabezado.
    const sku = celda(fila, "sku");
    const nombre = celda(fila, "producto");
    const categoria = celda(fila, "categoria");
    const precioCrudo = celda(fila, "precio");

    if (!sku) errores.push(`Línea ${linea}: falta el SKU.`);
    if (!nombre) errores.push(`Línea ${linea}: falta el nombre del producto.`);
    if (!categoria) errores.push(`Línea ${linea}: falta la categoría.`);
    if (!sku || !nombre || !categoria) continue;

    const lineaAnterior = skusVistos.get(sku);
    if (lineaAnterior !== undefined) {
      errores.push(`Línea ${linea}: el SKU "${sku}" ya apareció en la línea ${lineaAnterior}.`);
      continue;
    }
    skusVistos.set(sku, linea);

    const precio = parseGs(precioCrudo);
    if (precio === null || precio <= 0) {
      errores.push(
        `Línea ${linea}: el precio "${precioCrudo}" no es un monto en guaraníes enteros (ej.: 285000 o 285.000).`,
      );
      continue;
    }

    const precioAntesCrudo = celda(fila, "precioAntes");
    let compareAtPyg: number | null = null;
    if (precioAntesCrudo !== "") {
      compareAtPyg = parseGs(precioAntesCrudo);
      if (compareAtPyg === null || compareAtPyg <= 0) {
        errores.push(`Línea ${linea}: el precio antes "${precioAntesCrudo}" no es un monto válido.`);
        continue;
      }
    }

    const stockCrudo = celda(fila, "stock");
    const stock = stockCrudo === "" ? 0 : parseGs(stockCrudo);
    if (stock === null) {
      errores.push(`Línea ${linea}: el stock "${stockCrudo}" no es un entero (vacío = 0).`);
      continue;
    }

    const ivaCrudo = celda(fila, "iva");
    const iva = ivaCrudo === "" ? 10 : Number(ivaCrudo.replace("%", "").trim());
    if (!(IVA_RATES as readonly number[]).includes(iva)) {
      errores.push(`Línea ${linea}: IVA "${ivaCrudo}" — tiene que ser 10, 5 o 0 (vacío = 10).`);
      continue;
    }

    const slugPropio = celda(fila, "slug");
    const slug = slugPropio !== "" ? slugify(slugPropio) : slugify(nombre);
    if (slug === "") {
      errores.push(
        `Línea ${linea}: de "${slugPropio || nombre}" no sale un slug usable (letras a-z o números).`,
      );
      continue;
    }

    const variante: CatalogoVariante = {
      sku,
      label: celda(fila, "variante") || "Único",
      pricePyg: precio,
      compareAtPyg,
      onHand: stock,
    };

    const existente = porSlug.get(slug);
    if (!existente) {
      porSlug.set(slug, {
        slug,
        name: nombre,
        description: celda(fila, "descripcion") || null,
        categoryName: categoria,
        brand: celda(fila, "marca") || null,
        ivaRate: iva as IvaRate,
        variants: [variante],
        primeraLinea: linea,
      });
      continue;
    }

    // Mismo producto, otra variante: los datos de producto tienen que decir
    // lo mismo. Dos filas del mismo slug con categorías distintas no es una
    // preferencia a resolver en silencio — alguien se equivocó de fila.
    const conflictos: string[] = [];
    if (existente.name !== nombre) conflictos.push(`nombre ("${existente.name}" vs "${nombre}")`);
    if (slugify(existente.categoryName) !== slugify(categoria)) {
      conflictos.push(`categoría ("${existente.categoryName}" vs "${categoria}")`);
    }
    const marca = celda(fila, "marca") || null;
    if (marca !== null && existente.brand !== null && marca !== existente.brand) {
      conflictos.push(`marca ("${existente.brand}" vs "${marca}")`);
    }
    if (ivaCrudo !== "" && existente.ivaRate !== iva) {
      conflictos.push(`IVA (${existente.ivaRate} vs ${iva})`);
    }
    if (conflictos.length > 0) {
      errores.push(
        `Línea ${linea}: el producto "${slug}" (línea ${existente.primeraLinea}) ya venía con otro ${conflictos.join(", ")}.`,
      );
      continue;
    }
    if (existente.description === null) existente.description = celda(fila, "descripcion") || null;
    if (existente.brand === null) existente.brand = marca;
    existente.variants.push(variante);
  }

  if (porSlug.size === 0 && errores.length === 0) {
    errores.push("La planilla no trae ninguna fila de datos, sólo el encabezado.");
  }

  return {
    productos: [...porSlug.values()].map((agrupado) => {
      const { primeraLinea, ...producto } = agrupado;
      void primeraLinea;
      return producto;
    }),
    errores,
  };
}
