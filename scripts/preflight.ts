import "../src/lib/load-env";

import { closePool } from "../src/db";
import {
  listAdminShippingMethods,
  shippingMethodsWithoutZones,
} from "../src/domain/admin-shipping-methods";
import { preflight, type PreflightCheck } from "../src/domain/preflight";
import { listShippingZones } from "../src/domain/shipping";

/**
 * `pnpm preflight` — ¿podemos cobrar plata de verdad?
 *
 * Se corre antes de un deploy y **en el servidor**, después de configurar las
 * variables: la mitad de lo que revisa es sobre el entorno donde va a correr,
 * no sobre el repo. Sale con código 1 si hay algo que bloquea, para que un
 * deploy automatizado se frene solo.
 *
 * El reporte de arriba —el que decide el código de salida— **no toca la base
 * ni la red**, a propósito: se corre en el servidor de producción y no puede
 * depender de que MySQL esté arriba. Después de imprimirlo, y sólo después,
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
      zones.map((zone) => zone.id),
    );

    if (methods.length === 0) {
      console.log("  ✓ Formas de entrega");
      console.log(
        "      ninguna configurada: el checkout ofrece \"Envío a domicilio\" con el precio de " +
          "la zona y los tres medios de pago, que es el comportamiento de siempre",
      );
      return;
    }

    if (huerfanos.length === 0) {
      console.log("  ✓ Formas de entrega");
      console.log(`      ${methods.length} configurada(s), todas con al menos una zona activa`);
      return;
    }

    console.log("  ! Formas de entrega");
    console.log(
      "      activas y sin ninguna zona activa que las habilite: " +
        `${huerfanos.join(", ")}. Hoy no le aparecen a nadie en el checkout — prendé esas ` +
        "zonas, o sacales la restricción de zonas desde /admin/envios",
    );
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    console.log("  · Formas de entrega");
    console.log(
      `      no se pudo revisar (${motivo}). Es el único control que necesita la base; ` +
        "todo lo de arriba ya corrió",
    );
  } finally {
    await closePool();
  }
}

async function main(): Promise<void> {
  const report = preflight();

  console.log("\nPreflight — lo que falta para cobrar de verdad\n");

  // Primero lo que bloquea: si alguien lee sólo las tres primeras líneas, que
  // sean las que importan.
  const order: Array<PreflightCheck["severity"]> = ["bloquea", "advierte", "ok"];
  for (const severity of order) {
    for (const check of report.checks.filter((item) => item.severity === severity)) {
      console.log(`  ${ICON[check.severity]} ${check.title}`);
      console.log(`      ${check.detail}`);
    }
  }

  console.log("");

  if (report.ok) {
    console.log(
      report.warnings === 0
        ? "✓ Nada bloquea el cobro."
        : `✓ Nada bloquea el cobro (${report.warnings} advertencia(s) para mirar).`,
    );
  } else {
    console.error(
      `✗ ${report.blocking} cosa(s) bloquean el cobro. No deployees a producción así.`,
    );
    process.exitCode = 1;
  }

  // Aparte y al final, porque es el único que se conecta: lo que salga de acá
  // no cambia el código de salida que ya quedó decidido arriba.
  console.log("");
  await revisarMetodosDeEnvio();
  console.log("");
}

void main();
