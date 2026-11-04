import "../src/lib/load-env";

import { safeError } from "../src/lib/safe-error";

import { closePool } from "../src/db";
import {
  listAdminShippingMethods,
  shippingMethodsWithoutZones,
} from "../src/domain/admin-shipping-methods";
import { preflight, type PreflightCheck } from "../src/domain/preflight";
import { listShippingZones } from "../src/domain/shipping";
import { readBankDetails } from "../src/domain/admin-bank";
import { readStoreSettings } from "../src/domain/store-settings";
import { leerIntegracionesDelPanel } from "../src/lib/integraciones-store";
import { publicarFoto } from "../src/lib/integraciones";
import { clienteR2, r2Configurado } from "../src/lib/r2";
import { probarCanariosPrivados } from "../src/domain/preflight-r2";
import {
  contarRefsLegacy,
  totalRefsLegacy,
} from "../src/domain/imagenes-legacy";

/**
 * `pnpm preflight` — ¿podemos cobrar plata de verdad?
 *
 * Se corre antes de un deploy y **en el servidor**, después de configurar las
 * variables: la mitad de lo que revisa es sobre el entorno donde va a correr,
 * no sobre el repo. Sale con código 1 si hay algo que bloquea, para que un
 * deploy automatizado se frene solo.
 *
 * El reporte de arriba —el que decide el código de salida— **no depende de la
 * base**, a propósito: se corre en el servidor de producción y no puede
 * depender de que MySQL esté arriba. Lo único que lee de ahí, antes, es la
 * configuración de `/admin/integraciones` (sólo lectura), para saber si lo
 * que falta en el entorno está cargado en el panel; si la base no contesta,
 * lo avisa y sigue con el entorno. Después de imprimirlo, y sólo después,
 * hay un bloque aparte que **sí lee la base** (los métodos de envío) porque no
 * hay forma de saberlo desde el entorno. Es de sólo lectura, nunca bloquea, y
 * si la base no contesta lo dice y sigue.
 *
 * Nunca imprime el valor de un secreto: sólo si está y si tiene el largo
 * mínimo.
 */

const ICON: Record<PreflightCheck["severity"], string> = {
  bloquea: "✗",
  advierte: "!",
  ok: "✓",
};

/**
 * Métodos de envío que están prendidos y no le aparecen a nadie.
 *
 * Es el agujero más silencioso de la FASE 3: el método está activo, se ve
 * activo en el panel, y todas las zonas que declara están apagadas o borradas,
 * así que el checkout no lo ofrece nunca. Nadie ve un error — se ve una opción
 * menos, o ninguna, y en el segundo caso la ciudad entera deja de poder
 * comprar.
 *
 * No bloquea y no cambia el código de salida: puede ser una configuración a
 * medio hacer, y frenar un deploy por eso sería frenar justo el deploy en el
 * que se está configurando. La regla también es la de siempre: sin base
 * accesible, se dice y se sigue.
 */
async function revisarMetodosDeEnvio(): Promise<void> {
  console.log("Formas de entrega (lee la base; nunca bloquea)\n");

  try {
    const [methods, zones] = await Promise.all([
      listAdminShippingMethods(),
      listShippingZones(),
    ]);

    const huerfanos = shippingMethodsWithoutZones(
      methods,
      zones.map((zone) => zone.id)
    );

    if (methods.length === 0) {
      console.log("  ✓ Formas de entrega");
      console.log(
        '      ninguna configurada: el checkout ofrece "Envío a domicilio" con el precio de ' +
          "la zona y los medios de pago que tengan su configuración completa"
      );
      return;
    }

    if (huerfanos.length === 0) {
      console.log("  ✓ Formas de entrega");
      console.log(
        `      ${methods.length} configurada(s), todas con al menos una zona activa`
      );
      return;
    }

    console.log("  ! Formas de entrega");
    console.log(
      "      activas y sin ninguna zona activa que las habilite: " +
        `${huerfanos.join(", ")}. Hoy no le aparecen a nadie en el checkout — prendé esas ` +
        "zonas, o sacales la restricción de zonas desde /admin/envios"
    );
  } catch (error) {
    const motivo = safeError(error).message;
    console.log("  · Formas de entrega");
    console.log(
      `      no se pudo revisar (${motivo}). Es el único control que necesita la base; ` +
        "todo lo de arriba ya corrió"
    );
  } finally {
    await closePool();
  }
}

/**
 * R2 contra la red: que el dominio público **no** sirva los prefijos privados
 * (canario en `comprobantes/` y `backups/`), y cuántas referencias de imagen
 * quedaron del almacenamiento anterior.
 *
 * El canario sí cambia el código de salida: un comprobante bancario que se
 * baja por el dominio público es una filtración, no una advertencia. Las
 * referencias viejas sólo avisan: se ven como placeholder, no rompen nada.
 */
async function revisarR2(): Promise<void> {
  console.log("Imágenes y archivos en R2 (se conecta; el canario sí bloquea)\n");

  if (!r2Configurado()) {
    console.log("  · Prefijos privados");
    console.log("      R2 no está configurado: no hay nada que probar todavía (ver arriba)");
  } else {
    try {
      const resultados = await probarCanariosPrivados(clienteR2());
      for (const resultado of resultados) {
        if (resultado.estado === "bloqueado") {
          console.log(`  ✓ /${resultado.prefijo}* no se sirve por el dominio público`);
        } else if (resultado.estado === "publico") {
          console.log(`  ✗ /${resultado.prefijo}* SE PUEDE LEER por el dominio público`);
          console.log(
            "      agregá la regla de Cloudflare que bloquea /comprobantes/* y /backups/* en el " +
              "dominio del bucket (DEPLOY.md) antes de recibir un solo comprobante"
          );
          process.exitCode = 1;
        } else {
          console.log(`  ! /${resultado.prefijo}*`);
          console.log(`      no se pudo probar (${resultado.motivo})`);
        }
      }
    } catch (error) {
      console.log("  ! Prefijos privados");
      console.log(`      no se pudo probar (${safeError(error).message})`);
    }
  }

  try {
    const refs = await contarRefsLegacy();
    const total = totalRefsLegacy(refs);
    if (total === 0) {
      console.log("  ✓ Referencias de imagen: todas son de R2");
    } else {
      console.log("  ! Referencias de imagen del almacenamiento anterior");
      console.log(
        `      ${total} (fotos ${refs.productImages}, categorías ${refs.categories}, ` +
          `QR ${refs.bankQr}, ajustes ${refs.storeSettings}, tienda.ts ${refs.tiendaConfig}, ` +
          `comprobantes ${refs.receipts}). Se ven como placeholder: migralas con el script de ` +
          "migración de fotos (NEW-STORE.md)"
      );
    }
  } catch (error) {
    console.log("  · Referencias de imagen");
    console.log(`      no se pudo revisar (${safeError(error).message})`);
  }
}

async function main(): Promise<void> {
  // Lo cargado en /admin/integraciones manda sobre el entorno: se lee (sólo
  // lectura) para que el reporte diga lo que la tienda usa de verdad y de
  // dónde sale. Si la base no contesta, el reporte sigue con el entorno y lo
  // dice en un control propio.
  const panel = await leerIntegracionesDelPanel();
  // El nombre y las cuentas de cliente también se deciden en /admin/ajustes.
  // Sin base, `tienda.ts` (lo dice el control de lectura de arriba).
  // Y la política de medios de pago y la cuenta de /admin/banco: sin eso el
  // reporte no puede saber si el checkout cobra (docs/TEMPLATE-IMPROVEMENT-PLAN.md
  // D1). Sólo lectura; sin base, se evalúa con el entorno y se avisa.
  const ajustes = await Promise.all([readStoreSettings(), readBankDetails()])
    .then(([{ settings }, banco]) => ({
      nombreTienda: settings.identidad.nombre,
      cuentasClientes: settings.cuentas.activas,
      pagos: {
        lectura: "ok" as const,
        metodosPago: settings.checkout.metodosPago,
        bancoEnPanel: banco !== null,
      },
    }))
    .catch(() => ({ pagos: { lectura: "fallo" as const } }));
  const report = preflight(process.env, panel, ajustes);

  console.log("\nPreflight — lo que falta para cobrar de verdad\n");

  // Primero lo que bloquea: si alguien lee sólo las tres primeras líneas, que
  // sean las que importan.
  const order: Array<PreflightCheck["severity"]> = [
    "bloquea",
    "advierte",
    "ok",
  ];
  for (const severity of order) {
    for (const check of report.checks.filter(
      (item) => item.severity === severity
    )) {
      console.log(`  ${ICON[check.severity]} ${check.title}`);
      console.log(`      ${check.detail}`);
    }
  }

  console.log("");

  if (report.ok) {
    console.log(
      report.warnings === 0
        ? "✓ Nada bloquea el cobro."
        : `✓ Nada bloquea el cobro (${report.warnings} advertencia(s) para mirar).`
    );
  } else {
    console.error(
      `✗ ${report.blocking} cosa(s) bloquean el cobro. No deployees a producción así.`
    );
    process.exitCode = 1;
  }

  // Aparte y al final, porque son los que se conectan. Los métodos de envío
  // no cambian el código de salida; el canario privado de R2 sí.
  console.log("");
  // Lo del panel manda: el cliente de R2 lee la foto de integraciones.
  if (panel.lectura === "ok") publicarFoto(panel.filas);
  await revisarR2();
  console.log("");
  await revisarMetodosDeEnvio();
  console.log("");
}

void main();
