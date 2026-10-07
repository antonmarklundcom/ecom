import "@/lib/load-env";

import { readFileSync } from "node:fs";

import { closePool } from "@/db";
import {
  applyCatalogFotos,
  applyCatalogImportPlan,
  buildCatalogImportPlan,
} from "@/domain/catalog-import-plan";

import { safeError } from "../src/lib/safe-error";

/**
 * `pnpm importar:productos <planilla.csv>` — el catálogo entero de una vez.
 *
 * El cuello de botella real de una tienda nueva no es el deploy: es cargar
 * cien productos a mano en `/admin/productos`. El comercio ya tiene su lista
 * de precios en Excel; esto la sube.
 *
 * El formato es el del export del panel (una fila por variante; SKU,
 * Producto, Categoría, Variante, Precio (₲), Stock) más columnas opcionales:
 * Descripción, Marca, IVA, Precio antes (₲), Slug y Fotos. Separador `;` o
 * `,`, como venga. La validación vive en `src/domain/catalog-import.ts` y
 * este script sólo agrega lo que necesita base: qué categoría existe, de
 * quién es cada SKU, y el upsert compartido con el seed.
 *
 * **Fotos**: URLs `https://` separadas por `|`, espacio o salto de línea —
 * Cloudinary las va a buscar solo, este script nunca las descarga. Sólo se
 * suben a un producto que hoy no tiene ninguna foto, igual que una carga a
 * mano; si Cloudinary no está configurado se avisa y se sigue sin ellas.
 *
 * Ejemplo de fila completa, con dos fotos:
 *
 *   AUR-1;Auriculares TWS;Electrónica;Negro;285000;24;;;;;;https://cdn.tienda.com/aur-1.jpg|https://cdn.tienda.com/aur-1b.jpg
 *
 * **Ensayo por defecto**: sin `--aplicar` cuenta y muestra, no escribe.
 *
 *   pnpm importar:productos lista.csv                # ensayo
 *   pnpm importar:productos lista.csv --aplicar      # escribe
 *   pnpm importar:productos lista.csv --aplicar --pisar-stock
 *
 * Idempotente (mismas claves que el seed: `slug` y `sku`): re-correrlo
 * actualiza precios y textos sin duplicar, y el `on_hand` de variantes que ya
 * existen no se toca salvo `--pisar-stock`. Las categorías que no existan se
 * crean al final del menú.
 *
 * Mismo plan y misma escritura que la importación del panel
 * (`buildCatalogImportPlan` + `applyCatalogImportPlan`): todo o nada, una
 * columna ausente no pisa lo guardado, un SKU de otro producto (con otra
 * mayúscula o acento incluido) frena todo, lo nuevo entra como borrador y
 * cada precio o stock que cambia queda auditado a nombre de
 * `cli:importar-productos` (docs/TEMPLATE-IMPROVEMENT-PLAN.md C1–C7). Quien
 * corre este script tiene la `DATABASE_URL`: es el dueño.
 */

const ARGS = process.argv.slice(2).filter((arg) => arg !== "--");
const APLICAR = ARGS.includes("--aplicar");
const PISAR_STOCK = ARGS.includes("--pisar-stock");

async function main(): Promise<void> {
  const archivo = ARGS.find((arg) => !arg.startsWith("-"));
  if (!archivo) {
    console.error(
      "Uso: pnpm importar:productos <planilla.csv> [--aplicar] [--pisar-stock]"
    );
    process.exitCode = 1;
    return;
  }

  let texto: string;
  try {
    texto = readFileSync(archivo, "utf8");
  } catch {
    console.error(`No pude leer "${archivo}". ¿La ruta está bien?`);
    process.exitCode = 1;
    return;
  }

  const plan = await buildCatalogImportPlan(texto);
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

  if (!APLICAR) {
    console.log(
      "\nEnsayo: no se escribió nada. Agregá --aplicar para escribir."
    );
    return;
  }

  // --- Escribir: todo o nada ----------------------------------------------
  const { variantesEscritas } = await applyCatalogImportPlan(plan, {
    resetStock: PISAR_STOCK,
    allowPriceChanges: true,
    actor: "cli:importar-productos",
    actorUserId: null,
  });
  if (plan.categoriasNuevas.length > 0) {
    console.log(`✓ ${plan.categoriasNuevas.length} categorías creadas`);
  }
  console.log(
    `✓ ${plan.productos.length} productos · ${variantesEscritas} variantes escritas`
  );

  // Las fotos van después del commit del catálogo: una URL caída no puede
  // tumbar productos y precios que ya se guardaron.
  const fotos = await applyCatalogFotos(plan.productos);
  if (fotos.fotosOmitidas > 0) {
    console.log(
      `⚠ ${fotos.fotosOmitidas} fotos NO se subieron: Cloudinary no está configurado (ver docs/ENV-OPCIONAL.md).`
    );
  } else if (fotos.fotosSubidas > 0 || fotos.fotosFallidas.length > 0) {
    console.log(`✓ ${fotos.fotosSubidas} fotos subidas`);
  }
  for (const fallo of fotos.fotosFallidas) {
    console.error(
      `✗ Foto de "${fallo.producto}" (${fallo.url}) no se pudo subir: ${fallo.motivo}`
    );
  }
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(safeError(error).message);
    process.exitCode = 1;
    await closePool();
  });
