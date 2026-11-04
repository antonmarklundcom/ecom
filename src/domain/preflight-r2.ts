import { clavePrivadaEsPublica } from "@/lib/integraciones-probar";
import {
  PREFIJOS_PRIVADOS,
  clavePrivada,
  mensajeR2,
  type ClienteR2,
} from "@/lib/r2";

/**
 * Lo que `pnpm preflight` prueba **contra la red** en R2: que el dominio
 * público no sirva los prefijos privados.
 *
 * Un bucket con dominio público sirve cualquier clave. Las privadas
 * (`comprobantes/`, `backups/`) llevan 128 bits aleatorios, pero la defensa de
 * verdad es la regla del dominio que bloquea esos prefijos (DEPLOY.md). Esto
 * escribe un canario en cada prefijo privado, lo pide por la URL pública y lo
 * borra: si vuelve con los mismos bytes, la regla no está y los comprobantes
 * de las compradoras se pueden bajar con sólo conocer la clave.
 */

export type ResultadoCanario =
  | { prefijo: string; estado: "bloqueado" }
  | { prefijo: string; estado: "publico" }
  | { prefijo: string; estado: "error"; motivo: string };

type Fetch = typeof fetch;

export async function probarCanariosPrivados(
  cliente: ClienteR2,
  fetchImpl: Fetch = fetch
): Promise<ResultadoCanario[]> {
  const base = cliente.publicUrl;
  const resultados: ResultadoCanario[] = [];
  for (const prefijo of PREFIJOS_PRIVADOS) {
    if (!base) {
      resultados.push({ prefijo, estado: "error", motivo: "sin R2_PUBLIC_URL" });
      continue;
    }
    const key = clavePrivada(prefijo, ".canario-preflight.txt");
    const contenido = new TextEncoder().encode(`canario ${new Date().toISOString()}\n`);
    let escrito = false;
    try {
      await cliente.put(key, contenido, {
        contentType: "text/plain",
        cacheControl: "private, no-store",
      });
      escrito = true;
      const publico = await clavePrivadaEsPublica(fetchImpl, base, key, contenido);
      resultados.push({ prefijo, estado: publico ? "publico" : "bloqueado" });
    } catch (error) {
      resultados.push({ prefijo, estado: "error", motivo: mensajeR2(error) });
    } finally {
      if (escrito) await cliente.delete(key).catch(() => {});
    }
  }
  return resultados;
}
