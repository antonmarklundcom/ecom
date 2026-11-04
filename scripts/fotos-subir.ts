import "../src/lib/load-env";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { closePool } from "../src/db";
import { P1_CACHE_CONTROL } from "../src/lib/imagenes-r2";
import { cargarIntegraciones } from "../src/lib/integraciones-store";
import { clienteR2, mensajeR2 } from "../src/lib/r2";
import {
  codigoSeguro,
  marcarSubido,
  objetosUnicos,
  parsearManifiesto,
  parsearOpciones,
  totales,
  type FotoManifiesto,
} from "./fotos-lib";

/**
 * `pnpm fotos:subir -- --manifiesto <salida>/manifest.private.json [--aplicar] [--verificar]`
 *
 * Sube a R2 los objetos que dejó `pnpm fotos:preparar`. La config de R2 sale
 * de `src/lib/integraciones.ts` (lo cargado en `/admin/integraciones`, si
 * `DATABASE_URL` apunta a la base de la tienda; si no, `R2_*` del entorno).
 *
 * - Sin `--aplicar` ni `--verificar`: sólo cuenta. No lee credenciales ni
 *   toca la red.
 * - `--aplicar`: sube cada objeto pendiente con `If-None-Match: *` (una clave
 *   nunca se pisa; si ya estaba, es el mismo contenido) y anota en el
 *   manifiesto cuáles quedaron, después de cada uno (se puede cortar y
 *   reanudar).
 * - `--verificar`: pide por el dominio público la caja de tarjeta de cada
 *   foto y dice cuáles no responden 200.
 */

async function guardar(archivo: string, manifiesto: FotoManifiesto): Promise<void> {
  manifiesto.updatedAt = new Date().toISOString();
  await fs.writeFile(`${archivo}.tmp`, JSON.stringify(manifiesto, null, 2) + "\n");
  await fs.rename(`${archivo}.tmp`, archivo);
}

async function main(): Promise<void> {
  const args = parsearOpciones(process.argv.slice(2), ["--manifiesto"], ["--aplicar", "--verificar"]);
  const archivo = path.resolve(args.get("--manifiesto")!);
  const manifiesto = parsearManifiesto(JSON.parse(await fs.readFile(archivo, "utf8")));
  const aplicar = args.has("--aplicar");
  const verificar = args.has("--verificar");
  if (!aplicar && !verificar) {
    console.log(JSON.stringify(totales(manifiesto)));
    return;
  }

  // Panel > entorno: si hay base, lo de /admin/integraciones manda.
  await cargarIntegraciones();
  const cliente = clienteR2();
  let fallas = 0;

  if (aplicar) {
    for (const objeto of objetosUnicos(manifiesto.fotos)) {
      if (objeto.subido) continue;
      try {
        const bytes = await fs.readFile(path.join(path.dirname(archivo), objeto.key));
        if (
          bytes.byteLength !== objeto.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== objeto.sha256
        ) {
          throw new Error("el archivo local cambió desde que se preparó");
        }
        await cliente.put(objeto.key, new Uint8Array(bytes), {
          contentType: objeto.format === "webp" ? "image/webp" : "image/jpeg",
          cacheControl: P1_CACHE_CONTROL,
          soloSiNoExiste: true,
        });
        marcarSubido(manifiesto, objeto.key);
        await guardar(archivo, manifiesto);
      } catch (error) {
        fallas++;
        console.error(`✗ ${objeto.key}: ${error instanceof Error && !("operacion" in error) ? error.message : mensajeR2(error)}`);
      }
    }
  }

  if (verificar) {
    if (!cliente.publicUrl) throw new Error("Falta R2_PUBLIC_URL (o el dominio público en /admin/integraciones)");
    for (const foto of manifiesto.fotos.filter((f) => f.estado === "ok")) {
      const webps = foto.objetos.filter((o) => o.format === "webp");
      const objeto = webps.find((o) => /-480\.webp$/.test(o.key)) ?? webps.at(-1)!;
      try {
        const respuesta = await fetch(`${cliente.publicUrl}/${objeto.key}`, {
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
        await respuesta.body?.cancel();
        if (!respuesta.ok) {
          fallas++;
          console.error(`✗ ${objeto.key}: HTTP ${respuesta.status} por el dominio público`);
        }
      } catch {
        fallas++;
        console.error(`✗ ${objeto.key}: el dominio público no respondió`);
      }
    }
  }

  console.log(JSON.stringify({ ...totales(manifiesto), fallas }));
  if (fallas) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error && error.name === "R2NoConfiguradoError" ? error.message : codigoSeguro(error));
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
