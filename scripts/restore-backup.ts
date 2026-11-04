import "@/lib/load-env";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { closePool } from "@/db";
import {
  descargarSet,
  restoreBackup,
  ultimoSetCompleto,
} from "@/domain/restore-backup";
import { clienteR2 } from "@/lib/r2";
import { safeError } from "@/lib/safe-error";

/**
 * `pnpm restore -- <origen>` — reconstruye una base desde un backup de
 * `src/domain/backup.ts` (plan-operacion §5.4 A). El origen puede ser:
 *
 *   pnpm restore -- --r2 ultimo                    # el set completo más nuevo de R2
 *   pnpm restore -- --r2 backup-2026-08-12T0300-…  # un set de R2 por nombre
 *   pnpm restore -- ./backup-2026-08-12T0300-…/    # un set ya bajado (directorio)
 *   pnpm restore -- copia.jsonl.gz                 # un archivo de formato 2
 *
 * Con `--r2`, las credenciales salen de `R2_*` en el entorno de la máquina de
 * recuperación (la base destino está vacía: no hay panel del que leerlas). El
 * set se baja a un directorio temporal, se verifica entero —un objeto de menos
 * o un conteo/hash que no coincide lo rechaza— y recién ahí se carga.
 *
 * ### El candado, que es lo más importante de este archivo
 *
 * **Sólo corre contra una base cuyo nombre contenga `restore` o `test`.** Es
 * el mismo candado que `tests/global-setup.ts` le pone a `TEST_DATABASE_URL`,
 * y exige que esté vacía. No elimina datos existentes: se recupera en una
 * base aislada y se revisa antes del cambio de conexión de la tienda.
 *
 * Restaurar en producción no es un `pnpm restore` con otro flag: es crear una
 * base nueva llamada `tienda_restore`, restaurar ahí, mirar que esté todo, y
 * recién entonces cambiar `DATABASE_URL`. Esa fricción es a propósito.
 *
 * ### El orden
 *
 * Valida primero el archivo completo y su versión; carga en una única
 * conexión/transacción y verifica explícitamente las FK antes del commit.
 */

export type Opciones = {
  /** Archivo `.jsonl.gz` o directorio de un set. Vacío con `r2`. */
  archivo: string;
  vaciar: boolean;
  legacy?: boolean;
  /** Nombre del set en R2, o `ultimo`. */
  r2?: string;
};

export function parseArgs(argv: string[]): Opciones {
  const args = argv.filter((arg) => arg !== "--");
  const r2Index = args.indexOf("--r2");
  const r2 = r2Index >= 0 ? args[r2Index + 1] : undefined;
  if (r2Index >= 0 && (!r2 || r2.startsWith("--"))) {
    throw new Error("--r2 espera el nombre del set o `ultimo`");
  }
  const archivo = args.find(
    (arg, index) => !arg.startsWith("--") && !(r2Index >= 0 && index === r2Index + 1)
  );
  if (!archivo && !r2) {
    throw new Error(
      "Falta el origen: pnpm restore -- --r2 ultimo, o un directorio de set, o un .jsonl.gz"
    );
  }
  return {
    archivo: archivo ?? "",
    vaciar: !args.includes("--sin-vaciar"),
    legacy: args.includes("--legacy"),
    ...(r2 ? { r2 } : {}),
  };
}

/**
 * El candado. Exportado para poder testearlo sin tocar ninguna base.
 *
 * Se mira el **nombre de la base**, no la URL entera: un host llamado
 * `test.hostinger.com` no convierte a `tienda_produccion` en una base de
 * pruebas.
 */
export function baseEsRestaurable(url: string): boolean {
  try {
    const nombre = new URL(url).pathname.replace(/^\//, "");
    return nombre !== "" && /restore|test/i.test(nombre);
  } catch {
    return false;
  }
}

export { leerBackup } from "@/domain/restore-backup";

export async function restaurar(opciones: Opciones) {
  if (!baseEsRestaurable(process.env.DATABASE_URL ?? ""))
    throw new Error("La base destino debe contener restore o test");
  return restoreBackup(opciones);
}

/** Baja el set de R2 a un directorio temporal y restaura desde ahí. */
async function restaurarDesdeR2(opciones: Opciones) {
  if (!baseEsRestaurable(process.env.DATABASE_URL ?? ""))
    throw new Error("La base destino debe contener restore o test");
  const cliente = clienteR2();
  const setId =
    opciones.r2 === "ultimo" ? await ultimoSetCompleto(cliente) : opciones.r2!;
  if (!setId) throw new Error("No hay ningún set completo en R2 (backups/)");
  const dir = await mkdtemp(path.join(tmpdir(), "ecom-restore-set-"));
  try {
    console.log(`Bajando ${setId} de R2…`);
    await descargarSet(cliente, setId, dir);
    return await restaurar({ ...opciones, archivo: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const opciones = parseArgs(process.argv.slice(2));
  const reporte = opciones.r2
    ? await restaurarDesdeR2(opciones)
    : await restaurar(opciones);
  if (reporte.keyMatches === false)
    console.warn(
      "SESSION_SECRET no coincide: las credenciales cifradas requieren la clave original"
    );
  if (reporte.legacy)
    console.warn(
      "Formato antiguo: verificar la versión del esquema y ejecutar pnpm reconcile antes del cambio de base"
    );
  console.log(`✓ ${reporte.filas} filas en ${reporte.tablas} tablas`);
  console.log(
    `Credenciales recuperadas: ${reporte.decryptedSecrets}/${reporte.secrets}. Reconciliación: ${reporte.reconciliation.ok ? "OK" : "REVISAR"}`
  );
  if (
    !reporte.reconciliation.ok ||
    reporte.decryptedSecrets !== reporte.secrets ||
    reporte.keyMatches === false
  ) {
    console.error(
      "La carga terminó en la base de recuperación, pero la verificación requiere revisión. No cambiar DATABASE_URL hasta resolverla."
    );
    process.exitCode = 1;
  }
  await closePool();
}

// Sólo cuando se lo corre como script, no cuando lo importa un test.
if (process.argv[1]?.includes("restore-backup")) {
  main().catch(async (error) => {
    console.error(safeError(error).message);
    await closePool();
    process.exit(1);
  });
}
