import { getPool } from "@/db";
import { getCatalog } from "@/db/queries";
import { cronAtrasado, getJobRun } from "@/domain/job-runs";

/**
 * Prueba de humo post-deploy (DEPLOY.md §6).
 *
 *   curl -fsS https://TU-DOMINIO/api/health   →   {"ok":true,"db":true,"cron":true}
 *
 * Separa las dos preguntas que el deploy confunde todo el tiempo: **¿levantó
 * la app?** (llegó una respuesta) y **¿llega a MySQL?** (`db`). `db:false` con
 * `ok:true` es exactamente el síntoma de la `DATABASE_URL` mal cargada en el
 * panel — de ahí se sigue con `pnpm db:check`.
 *
 * Va sin autenticar a propósito: tiene que poder llamarla el monitoreo de
 * Hostinger, un uptime checker o vos desde el celular, sin secretos dando
 * vueltas. Por eso la respuesta son booleanos y nada más: ni versiones, ni
 * nombre de la base, ni el error de MySQL. Un atacante no aprende nada acá que
 * no sepa por mirar si el sitio carga.
 */

// Chequea la base en cada llamada: nunca se prerenderiza ni se cachea.
export const dynamic = "force-dynamic";

/**
 * Corto a propósito. Un health check que tarda 30 segundos en decir que la
 * base no responde es un health check que el monitoreo va a matar antes de
 * leer.
 */
const DB_TIMEOUT_MS = 3_000;

/**
 * `cron`: ¿corrió `vencer-pedidos` en las últimas 2 h? Es el otro silencio que
 * un monitor tiene que ver: sin ese cron no vence ningún pedido sin pagar, el
 * stock queda reservado y no sale ningún recordatorio (DEPLOY.md §5). Con la
 * base caída no se puede saber, y se contesta `false`.
 */
export async function GET(): Promise<Response> {
  const db = await dbResponde();
  const [cron, catalog] = db
    ? await Promise.all([cronAlDia(), catalogResponde()])
    : [false, false];

  return new Response(JSON.stringify({ ok: true, db, catalog, cron }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function dbResponde(): Promise<boolean> {
  try {
    // `getPool()` tira si falta DATABASE_URL: eso también es `db:false`, que es
    // justo lo que hay que reportar.
    const query = getPool().query("SELECT 1");
    await Promise.race([query, rechazarAlVencer()]);
    return true;
  } catch {
    // Sin log: esta ruta la puede llamar cualquiera, y un endpoint público que
    // escribe una línea por request es una forma barata de llenar el disco del
    // slot de Hostinger.
    return false;
  }
}

async function cronAlDia(): Promise<boolean> {
  try {
    return !cronAtrasado(
      await Promise.race([getJobRun("vencer_pedidos"), rechazarAlVencer()])
    );
  } catch {
    return false;
  }
}

function rechazarAlVencer(): Promise<never> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
    // El proceso no se queda vivo por este timer si la query ya volvió.
    timer.unref?.();
  });
}

async function catalogResponde(): Promise<boolean> {
  try {
    await Promise.race([getCatalog({ limit: 1 }), rechazarAlVencer()]);
    // Include dependent catalogue tables/columns even on a genuinely empty store.
    await Promise.race([
      getPool()
        .query(`SELECT v.attributes, v.identifiers, i.cloudinary_id, r.qty
      FROM variants v LEFT JOIN product_images i ON i.product_id=v.product_id
      LEFT JOIN stock_reservations r ON r.variant_id=v.id LIMIT 1`),
      rechazarAlVencer(),
    ]);
    return true;
  } catch {
    return false;
  }
}
