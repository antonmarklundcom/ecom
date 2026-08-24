import "../src/lib/load-env";

import { closePool } from "../src/db";
import {
  RETENCION_DIAS_DEFAULT,
  contarEventosAnterioresA,
  purgarEventos,
  retencionDias,
} from "../src/domain/admin-analytics";
import { formatDatePY } from "../src/lib/py";

/**
 * `pnpm analytics:purge` — borra los eventos de analítica más viejos que
 * `ANALYTICS_RETENTION_DAYS` (un año por defecto).
 *
 * ### Por qué esto existe y un rollup no
 *
 * Porque el problema real de una tabla de pageviews en un hosting compartido
 * no es la velocidad de la consulta —son cientos de miles de filas con dos
 * índices, o sea nada— sino que crece para siempre. La respuesta barata a
 * "crece para siempre" es borrar lo viejo, no pre-agregar lo nuevo: un rollup
 * costaría un job, un backfill, un segundo lugar donde el número puede estar
 * mal, y no arreglaría el crecimiento igual. El razonamiento largo está en
 * `src/domain/admin-analytics.ts`.
 *
 * ### Por qué es un comando y no parte del cron de pedidos
 *
 * El cron cada 15 minutos vence pedidos y suelta stock reservado: es el camino
 * de la plata y tiene un timeout de Hostinger encima. Una limpieza de
 * estadísticas no tiene por qué compartir esa corrida ni ese timeout. Quien la
 * quiera automatizada le agrega una línea al cron del hPanel, semanal:
 *
 *   cd ~/domains/tienda.py/public_html && pnpm analytics:purge
 *
 * Sin correrlo nunca, la tienda funciona igual: la tabla crece, y para el
 * volumen de un comercio chico eso tarda años en importar.
 *
 * Con `--dry-run` cuenta lo que borraría y no borra nada, igual que
 * `pnpm import-csv`.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const dias = retencionDias(process.env.ANALYTICS_RETENTION_DAYS);

  if (dias === RETENCION_DIAS_DEFAULT && !process.env.ANALYTICS_RETENTION_DAYS) {
    console.log(`ANALYTICS_RETENTION_DAYS no está definida: se usan ${dias} días.`);
  }

  if (dryRun) {
    // El dry-run cuenta contra el mismo corte que usaría la purga.
    const { corte, total } = await contarEventosAnterioresA(dias);
    console.log(
      `[dry-run] ${total} evento(s) anteriores al ${formatDatePY(corte)} se borrarían.`,
    );
    return;
  }

  const { borrados, corte } = await purgarEventos(dias);
  console.log(`✓ ${borrados} evento(s) borrados (anteriores al ${formatDatePY(corte)}).`);
}

main()
  .catch((error) => {
    console.error("✗ La purga falló:", error);
    process.exitCode = 1;
  })
  .finally(closePool);
