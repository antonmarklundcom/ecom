import "../src/lib/load-env";

import { preflight, type PreflightCheck } from "../src/domain/preflight";

/**
 * `pnpm preflight` — ¿podemos cobrar plata de verdad?
 *
 * Se corre antes de un deploy y **en el servidor**, después de configurar las
 * variables: la mitad de lo que revisa es sobre el entorno donde va a correr,
 * no sobre el repo. Sale con código 1 si hay algo que bloquea, para que un
 * deploy automatizado se frene solo.
 *
 * No toca la base ni la red. Nunca imprime el valor de un secreto: sólo si
 * está y si tiene el largo mínimo.
 */

const ICON: Record<PreflightCheck["severity"], string> = {
  bloquea: "✗",
  advierte: "!",
  ok: "✓",
};

function main(): void {
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
    return;
  }

  console.error(
    `✗ ${report.blocking} cosa(s) bloquean el cobro. No deployees a producción así.`,
  );
  process.exitCode = 1;
}

main();
