import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { toCsv } from "../src/lib/csv";
import { DescargaError, descargarImagen } from "../src/lib/descarga-segura";
import { planImagen } from "../src/lib/imagenes-r2";
import { ImagenInvalidaError, prepararDesdeOriginal } from "../src/lib/r2-imagenes";
import {
  FotosError,
  codigoSeguro,
  escaparHtml,
  leerCatalogo,
  parsearManifiesto,
  parsearOpciones,
  reescribirCsv,
  refsDeProducto,
  totales,
  type Foto,
  type FotoManifiesto,
} from "./fotos-lib";

/**
 * `pnpm fotos:preparar -- --csv lista.csv --salida /fuera/del/repo [--solo SKU1,SKU2]`
 *
 * Baja las fotos de la columna Fotos, las achica (WebP por caja + JPEG, el
 * mismo pipeline que la importación del servidor) y deja todo en `--salida`,
 * que tiene que estar **fuera del repo** (son archivos de un cliente, no
 * código). No necesita credenciales ni base: no sube nada. Ver
 * `scripts/fotos-lib.ts` para el circuito entero.
 *
 * Reanudable: lo que ya está preparado en la salida, con sus hashes, no se
 * vuelve a bajar.
 */

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function salidaFueraDelRepo(pedida: string): Promise<string> {
  const repo = await fs.realpath(path.resolve(import.meta.dirname, ".."));
  const destino = path.resolve(pedida);
  await fs.mkdir(destino, { recursive: true });
  const real = await fs.realpath(destino);
  const relativo = path.relative(repo, real);
  if (!relativo || (!relativo.startsWith("..") && !path.isAbsolute(relativo)))
    throw new FotosError("LA_SALIDA_TIENE_QUE_ESTAR_FUERA_DEL_REPO");
  return real;
}

/** Escribe sin pisar: si ya está, tiene que ser lo mismo. */
async function escribirInmutable(archivo: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  try {
    await fs.writeFile(archivo, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (sha(await fs.readFile(archivo)) !== sha(bytes)) throw new FotosError("CHOQUE_DE_ARCHIVO_LOCAL");
  }
}

async function fotoLista(foto: Foto, salida: string): Promise<boolean> {
  if (foto.estado !== "ok") return false;
  try {
    for (const objeto of foto.objetos) {
      const bytes = await fs.readFile(path.join(salida, objeto.key));
      if (bytes.byteLength !== objeto.bytes || sha(bytes) !== objeto.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function revisionHtml(manifiesto: FotoManifiesto): string {
  const filas = manifiesto.fotos
    .map((foto) => {
      const webps = foto.objetos.filter((o) => o.format === "webp");
      const tarjeta = webps.find((o) => /-480\.webp$/.test(o.key)) ?? webps.at(-1);
      const detalle = webps.at(-1);
      const img = (key: string | undefined, clase: string) =>
        key ? `<img class="${clase}" loading="lazy" src="${escaparHtml(key)}" alt="">` : "<span>Sin foto</span>";
      return `<tr><td><strong>${escaparHtml(foto.slug)}</strong> #${foto.posicion + 1}<br>${escaparHtml(
        foto.estado === "ok" ? `${foto.width}×${foto.height}` : (foto.error ?? "falló")
      )}</td><td>${img(tarjeta?.key, "card")}</td><td>${img(detalle?.key, "detail")}</td></tr>`;
    })
    .join("\n");
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisión de fotos</title><style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}td{border:1px solid #ccc;padding:8px;vertical-align:top}img{object-fit:contain;background:#f3f4f6}.card{width:180px;height:180px}.detail{width:480px;max-width:100%;height:auto}</style>
<h1>Revisión de fotos</h1><table><tbody>${filas}</tbody></table></html>`;
}

async function main(): Promise<void> {
  const args = parsearOpciones(process.argv.slice(2), ["--csv", "--salida"], [], ["--solo"]);
  const salida = await salidaFueraDelRepo(args.get("--salida")!);
  const solo = (args.get("--solo") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const catalogo = leerCatalogo(await fs.readFile(path.resolve(args.get("--csv")!), "utf8"), solo);

  const archivoManifiesto = path.join(salida, "manifest.private.json");
  let previo: FotoManifiesto | null = null;
  try {
    previo = parsearManifiesto(JSON.parse(await fs.readFile(archivoManifiesto, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const porFuente = new Map<string, Foto>();
  for (const foto of previo?.fotos ?? []) if (await fotoLista(foto, salida)) porFuente.set(foto.fuente, foto);

  const elegidos = new Set(catalogo.productos.map((p) => p.slug));
  const ahora = new Date().toISOString();
  const manifiesto: FotoManifiesto = {
    version: 1,
    policy: "p1",
    createdAt: previo?.createdAt ?? ahora,
    updatedAt: ahora,
    productos: [...(previo?.productos ?? []).filter((p) => !elegidos.has(p.slug)), ...catalogo.productos],
    fotos: (previo?.fotos ?? []).filter((f) => !elegidos.has(f.slug)),
  };

  for (const producto of catalogo.productos) {
    for (const [posicion, fuente] of producto.fuentes.entries()) {
      const conocida = porFuente.get(fuente);
      if (conocida && conocida.ref) {
        // La misma foto en otro producto lleva el slug de ese producto en la
        // clave: se reutiliza sólo si es del mismo.
        if (conocida.slug === producto.slug) {
          manifiesto.fotos.push({ ...conocida, posicion, objetos: conocida.objetos.map((o) => ({ ...o })) });
          continue;
        }
      }
      const foto: Foto = {
        slug: producto.slug,
        posicion,
        fuente,
        estado: "fallo",
        error: null,
        sha256: null,
        width: null,
        height: null,
        ref: null,
        objetos: [],
      };
      try {
        const original = await descargarImagen(fuente);
        const set = await prepararDesdeOriginal(original);
        const plan = planImagen(producto.slug, set.sha256, set.width, set.height);
        if (!plan) throw new FotosError("REFERENCIA_INVALIDA");
        for (const esperado of plan.objects) {
          const objeto = set.objetos.find(
            (o) => o.format === esperado.format && (o.format === "jpeg" || o.box === esperado.box)
          );
          if (!objeto) throw new FotosError("SET_INCOMPLETO");
          await escribirInmutable(path.join(salida, esperado.key), objeto.bytes);
          foto.objetos.push({
            key: esperado.key,
            format: esperado.format,
            width: esperado.width,
            height: esperado.height,
            bytes: objeto.bytes.byteLength,
            sha256: sha(objeto.bytes),
            subido: false,
          });
        }
        Object.assign(foto, {
          estado: "ok",
          sha256: set.sha256,
          width: set.width,
          height: set.height,
          ref: plan.ref,
        });
        porFuente.set(fuente, foto);
      } catch (error) {
        foto.objetos = [];
        foto.error =
          error instanceof DescargaError
            ? error.message
            : error instanceof ImagenInvalidaError
              ? `imagen inválida (${error.codigo})`
              : codigoSeguro(error);
      }
      manifiesto.fotos.push(foto);
      console.log(`${foto.estado === "ok" ? "✓" : "✗"} ${producto.slug} #${posicion + 1}${foto.error ? ` — ${foto.error}` : ""}`);
    }
  }

  parsearManifiesto(manifiesto);
  await fs.writeFile(`${archivoManifiesto}.tmp`, JSON.stringify(manifiesto, null, 2) + "\n");
  await fs.rename(`${archivoManifiesto}.tmp`, archivoManifiesto);
  await fs.writeFile(path.join(salida, "import-r2.csv"), reescribirCsv(catalogo, manifiesto.fotos));
  await fs.writeFile(
    path.join(salida, "report.csv"),
    toCsv(
      ["Slug", "SKUs", "Fotos listas", "Fotos fallidas", "Errores"],
      catalogo.productos.map((p) => {
        const fotos = manifiesto.fotos.filter((f) => f.slug === p.slug);
        return [
          p.slug,
          p.skus.join("|"),
          refsDeProducto(fotos, p.slug).length,
          fotos.filter((f) => f.estado === "fallo").length,
          [...new Set(fotos.map((f) => f.error).filter(Boolean))].join("|"),
        ];
      })
    )
  );
  await fs.writeFile(path.join(salida, "review.html"), revisionHtml(manifiesto));
  console.log(JSON.stringify(totales(manifiesto)));
  if (manifiesto.fotos.some((f) => f.estado === "fallo")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(codigoSeguro(error));
  process.exitCode = 1;
});
