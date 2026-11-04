import "@/lib/load-env";

import { readFileSync } from "node:fs";

import {
  UnsupportedSpreadsheetError,
  spreadsheetToCsvText,
} from "@/lib/spreadsheet";

import { closePool } from "@/db";
import {
  applyCatalogImportLote,
  buildCatalogImportPlan,
  CATALOG_IMPORT_LOTE,
} from "@/domain/catalog-import-plan";
import { proveedoresHabilitados } from "@/lib/proveedores";

import { safeError } from "../src/lib/safe-error";

/**
 * `pnpm importar:productos <planilla.csv|.xlsx>` — el catálogo entero de una vez.
 *
 * El cuello de botella real de una tienda nueva no es el deploy: es cargar
 * cien productos a mano en `/admin/productos`. El comercio ya tiene su lista
 * de precios en Excel; esto la sube.
 *
 * El formato es **la planilla canónica del catálogo** (docs/CATALOGO-CSV.md):
 * la misma que baja el export del panel y que entiende la importación del
 * panel, de esta tienda o de otra. Una fila por variante; obligatorias SKU,
 * Producto, Categoría y Precio (₲); el resto opcional. Separador `;` o `,`,
 * como venga; un `.xlsx` se lee de su primera hoja. Para probar con datos de
 * ejemplo: `pnpm importar:productos scripts/fixtures/catalogo-demo.csv`.
 *
 * **Fotos**: URLs `https://` (o referencias `r2:p1/…` de `pnpm fotos:preparar`)
 * separadas por `|`, espacio o salto de línea. Las URLs las baja este proceso
 * (https, con topes de tamaño, tiempo y redirecciones, y mirando que sean
 * imágenes por los bytes), las achica y las sube a R2. Sólo se suben a un
 * producto que hoy no tiene ninguna foto, igual que una carga a mano; si R2
 * no está configurado se avisa y se sigue sin ellas.
 *
 * **Proveedores** (Proveedor, URL proveedor, Costo proveedor, Stock
 * proveedor): sólo con `proveedores: true` en `src/config/tienda.ts`; si no,
 * se ignoran con un aviso.
 *
 * **Ensayo por defecto**: sin `--aplicar` cuenta, avisa y muestra los
 * posibles duplicados, y no escribe.
 *
 *   pnpm importar:productos lista.csv                         # ensayo
 *   pnpm importar:productos lista.csv --aplicar               # escribe
 *   pnpm importar:productos lista.csv --aplicar --pisar-stock
 *   pnpm importar:productos lista.csv --aplicar --revisado    # con duplicados revisados
 *
 * Idempotente (mismas claves que el seed: `slug` y `sku`): re-correrlo
 * actualiza precios y textos sin duplicar, y el `on_hand` de variantes que ya
 * existen no se toca salvo `--pisar-stock`. Las categorías que no existan se
 * crean al final del menú.
 *
 * Mismo plan y misma escritura que la importación del panel
 * (`buildCatalogImportPlan` + `applyCatalogImportLote`): se escribe **por
 * lotes** de `CATALOG_IMPORT_LOTE` productos y cada lote entra entero o no
 * entra; una columna ausente no pisa lo guardado, un SKU de otro producto
 * (con otra mayúscula o acento incluido) frena su lote, lo nuevo entra como
 * borrador y cada precio o stock que cambia queda auditado a nombre de
 * `cli:importar-productos` (docs/TEMPLATE-IMPROVEMENT-PLAN.md C1–C7). Si un
 * lote falla, los anteriores quedan: corregir y volver a correr termina el
 * trabajo sin duplicar. Quien corre este script tiene la `DATABASE_URL`: es
 * el dueño.
 */

const ARGS = process.argv.slice(2).filter((arg) => arg !== "--");
const APLICAR = ARGS.includes("--aplicar");
const PISAR_STOCK = ARGS.includes("--pisar-stock");
const REVISADO = ARGS.includes("--revisado");

async function main(): Promise<void> {
  const archivo = ARGS.find((arg) => !arg.startsWith("-"));
  if (!archivo) {
    console.error(
      "Uso: pnpm importar:productos <planilla.csv|.xlsx> [--aplicar] [--pisar-stock] [--revisado]"
    );
    process.exitCode = 1;
    return;
  }

  let texto: string;
  try {
    // Un .xlsx se convierte desde su primera hoja; cualquier otra cosa se
    // lee como texto CSV, como siempre.
    texto = archivo.toLowerCase().endsWith(".xlsx")
      ? await spreadsheetToCsvText(archivo, readFileSync(archivo))
      : readFileSync(archivo, "utf8");
  } catch (error) {
    console.error(
      error instanceof UnsupportedSpreadsheetError
        ? error.message
        : `No pude leer "${archivo}". ¿La ruta está bien?`
    );
    process.exitCode = 1;
    return;
  }

  const proveedores = proveedoresHabilitados();
  const plan = await buildCatalogImportPlan(texto, { proveedores });
  for (const aviso of plan.advertencias) console.log(`⚠ ${aviso}`);
  if (plan.errores.length > 0) {
    for (const error of plan.errores) console.error(`✗ ${error}`);
    console.error(`\n${plan.errores.length} error(es). No se escribió nada.`);
    process.exitCode = 1;
    return;
  }

  const variantesTotal = plan.variantesNuevas + plan.variantesActualizar;
  console.log(
    `Planilla: ${plan.productos.length} productos · ${variantesTotal} variantes`
  );
  console.log(
    `  · ${plan.productosNuevos} productos nuevos (entran como borrador), ${plan.productosActualizar} a actualizar`
  );
  console.log(
    `  · ${plan.variantesNuevas} variantes nuevas, ${plan.variantesActualizar} a actualizar` +
      (plan.variantesActualizar > 0
        ? PISAR_STOCK
          ? ` (¡pisando su stock: ${plan.stockCambiaria} cambian!)`
          : " (su stock no se toca; --pisar-stock para pisarlo)"
        : "")
  );
  if (plan.preciosCambian > 0) {
    console.log(
      `  · ${plan.preciosCambian} precios cambian (quedan auditados)`
    );
  }
  if (plan.categoriasNuevas.length > 0) {
    console.log(`  · categorías a crear: ${plan.categoriasNuevas.join(", ")}`);
  }
  if (plan.fotosNuevas > 0) {
    console.log(
      `  · ${plan.fotosNuevas} fotos a subir (sólo a productos que hoy no tienen ninguna)`
    );
  }
  if (plan.proveedores && plan.ofertasNuevas + plan.ofertasActualizar > 0) {
    console.log(
      `  · ofertas de proveedor: ${plan.ofertasNuevas} nuevas, ${plan.ofertasActualizar} a actualizar`
    );
  }
  console.log(
    `  · se escribe en ${plan.lotes} lote(s) de hasta ${CATALOG_IMPORT_LOTE} productos`
  );
  if (plan.duplicados.length > 0) {
    console.log(`\nPosibles productos repetidos (revisalos):`);
    for (const aviso of plan.duplicados) console.log(`  ⚠ ${aviso}`);
  }

  if (!APLICAR) {
    console.log(
      "\nEnsayo: no se escribió nada. Agregá --aplicar para escribir" +
        (plan.duplicados.length > 0 ? " (y --revisado)." : ".")
    );
    return;
  }
  if (plan.duplicados.length > 0 && !REVISADO) {
    console.error(
      `\n✗ Hay ${plan.duplicados.length} posible(s) producto(s) repetido(s). Revisalos y, si está bien, volvé a correr con --revisado. No se escribió nada.`
    );
    process.exitCode = 1;
    return;
  }

  // --- Escribir: lote por lote, cada uno todo o nada ----------------------
  let fotosSubidas = 0;
  let fotosOmitidas = 0;
  let productosEscritos = 0;
  for (let lote = 0; lote < plan.lotes; lote += 1) {
    const etiqueta = `Lote ${lote + 1}/${plan.lotes}`;
    let result: Awaited<ReturnType<typeof applyCatalogImportLote>>;
    try {
      result = await applyCatalogImportLote(
        texto,
        lote,
        { proveedores },
        {
          resetStock: PISAR_STOCK,
          allowPriceChanges: true,
          actor: "cli:importar-productos",
          actorUserId: null,
        }
      );
    } catch (error) {
      console.error(`✗ ${etiqueta}: ${safeError(error).message}`);
      console.error(
        `  Ese lote no se escribió; los ${productosEscritos} productos de los lotes anteriores sí. Corregí y volvé a correr: no duplica.`
      );
      process.exitCode = 1;
      return;
    }
    if (!result.ok) {
      for (const error of result.errores) console.error(`✗ ${error}`);
      console.error(
        `  ${etiqueta} no se escribió; los ${productosEscritos} productos de los lotes anteriores sí. Corregí y volvé a correr: no duplica.`
      );
      process.exitCode = 1;
      return;
    }
    productosEscritos += result.productos;
    fotosSubidas += result.fotosSubidas;
    fotosOmitidas += result.fotosOmitidas;
    console.log(
      `✓ ${etiqueta}: ${result.productos} productos · ${result.variantesEscritas} variantes` +
        (result.ofertasNuevas + result.ofertasActualizadas > 0
          ? ` · ${result.ofertasNuevas + result.ofertasActualizadas} ofertas de proveedor`
          : "")
    );
    // Las fotos van después del commit de cada lote: una URL caída no puede
    // tumbar productos y precios que ya se guardaron.
    for (const fallo of result.fotosFallidas) {
      console.error(
        `✗ Foto de "${fallo.producto}" (${fallo.url}) no se pudo subir: ${fallo.motivo}`
      );
    }
  }
  if (plan.categoriasNuevas.length > 0) {
    console.log(`✓ ${plan.categoriasNuevas.length} categorías creadas`);
  }
  console.log(`✓ ${productosEscritos} productos escritos`);
  if (fotosOmitidas > 0) {
    console.log(
      `⚠ ${fotosOmitidas} fotos NO se subieron: R2 no está configurado (ver docs/ENV-OPCIONAL.md).`
    );
  } else if (fotosSubidas > 0) {
    console.log(`✓ ${fotosSubidas} fotos subidas`);
  }
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(safeError(error).message);
    process.exitCode = 1;
    await closePool();
  });
