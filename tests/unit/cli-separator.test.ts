import { describe, expect, it } from "vitest";

import { parseArgs as backupArgs } from "../../scripts/backup-db";
import { parseArgs as bootstrapArgs } from "../../scripts/bootstrap-into-repo";
import { parseArgs as doctorArgs } from "../../scripts/doctor";
import { parseFlags as nuevaTiendaFlags } from "../../scripts/nueva-tienda";
import { parseArgs as diffArgs } from "../../scripts/template-diff";
import { parseArgs as syncArgs } from "../../scripts/template-sync";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md B6: pnpm 11 le pasa al script el `--`
 * literal de `pnpm backup -- --retener 30`, y cada parser lo rechazaba con
 * "no conozco la opción --". `restore` y el importador ya lo ignoraban; ahora
 * todos, y con la misma forma con y sin separador.
 */
describe("los scripts aceptan el `--` que pasa pnpm", () => {
  const casos: Array<[string, (argv: string[]) => unknown, string[]]> = [
    ["backup", backupArgs, ["--retener", "30", "--salida", "copias"]],
    ["bootstrap:repo", bootstrapArgs, ["--destino", "../tienda"]],
    ["setup:doctor", doctorArgs, ["--skip-docker"]],
    ["nueva-tienda", nuevaTiendaFlags, ["--nombre", "Tienda", "--dry-run"]],
    ["template:diff", diffArgs, ["--marcar", "--origen"]],
    ["template:sync", syncArgs, ["--dry-run", "--rama", "main"]],
  ];

  it.each(casos)("%s", (_nombre, parse, flags) => {
    expect(parse(["--", ...flags])).toEqual(parse(flags));
  });

  it("una opción desconocida sigue siendo un error", () => {
    expect(() => backupArgs(["--", "--retner", "30"])).toThrow(/no conozco/);
  });
});
