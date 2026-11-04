import "../src/lib/load-env";

import fs from "node:fs/promises";
import path from "node:path";

import { closePool } from "../src/db";
import {
  FotosError,
  codigoSeguro,
  itemsParaReparar,
  parsearManifiesto,
  parsearOpciones,
} from "./fotos-lib";

/**
 * `pnpm fotos:reparar -- --manifiesto <salida>/manifest.private.json --slug <producto> [--aplicar] [--incluir-manuales]`
 *
 * Reemplaza la galería de **un** producto por las fotos del manifiesto. Para
 * el producto que ya tenía fotos (la importación nunca toca esos) o cuyas
 * fotos se rehicieron. Exige que todos sus objetos estén subidos
 * (`pnpm fotos:subir --aplicar`): una fila nunca apunta a un objeto que no
 * está.
 *
 * Sin `--aplicar` sólo revisa el manifiesto, sin conectarse a nada. Con
 * `--aplicar`, en una transacción con el producto bloqueado. Si el producto
 * tiene alguna foto cargada a mano que no es de R2, no hace nada salvo que se
 * pida `--incluir-manuales`. Las filas se reemplazan; **los bytes de R2 no se
 * borran nunca**.
 */

async function main(): Promise<void> {
  const args = parsearOpciones(
    process.argv.slice(2),
    ["--manifiesto", "--slug"],
    ["--aplicar", "--incluir-manuales"]
  );
  const manifiesto = parsearManifiesto(
    JSON.parse(await fs.readFile(path.resolve(args.get("--manifiesto")!), "utf8"))
  );
  const slug = args.get("--slug")!;
  const items = itemsParaReparar(manifiesto, slug);
  if (!args.has("--aplicar")) {
    console.log(JSON.stringify({ producto: slug, fotos: items.length, aplicar: false }));
    return;
  }
  if (!process.env.DATABASE_URL) throw new FotosError("FALTA_DATABASE_URL");

  const { getDb } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { productImages, products } = await import("../src/db/schema");
  await getDb().transaction(async (tx) => {
    const [producto] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1)
      .for("update");
    if (!producto) throw new FotosError("PRODUCTO_NO_EXISTE");
    const actuales = await tx
      .select({ ref: productImages.imageRef })
      .from(productImages)
      .where(eq(productImages.productId, producto.id));
    if (actuales.some((foto) => !foto.ref.startsWith("r2:")) && !args.has("--incluir-manuales"))
      throw new FotosError("HAY_FOTOS_MANUALES (usá --incluir-manuales para reemplazarlas igual)");
    await tx.delete(productImages).where(eq(productImages.productId, producto.id));
    await tx.insert(productImages).values(
      items.map((item, position) => ({
        productId: producto.id,
        imageRef: item.ref,
        alt: item.alt.slice(0, 255),
        position,
      }))
    );
  });
  console.log(JSON.stringify({ producto: slug, fotos: items.length, aplicar: true }));
}

main()
  .catch((error: unknown) => {
    console.error(codigoSeguro(error));
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
