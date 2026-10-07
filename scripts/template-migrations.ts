/**
 * La historia de migraciones entre el template y una tienda
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md B1).
 *
 * `drizzle/` viaja como maquinaria, pero no es un archivo más: el migrador de
 * MySQL de drizzle aplica una migración sólo si su `when` del journal es
 * **mayor** que el `created_at` de la última aplicada
 * (`drizzle-orm/mysql-core/dialect.js`), y nunca compara hashes. O sea:
 *
 * - si la tienda generó su propia migración `0023` y el template trae otra
 *   `0023`, el journal choca en el índice, y fusionarlo "a mano" deja una de
 *   las dos afuera o con marcadores commiteados;
 * - si la del template es más vieja que la última que la tienda ya aplicó, en
 *   esa base **se saltea para siempre**, sin error;
 * - si el template reescribe una migración ya publicada (mismo tag, otro SQL),
 *   las tiendas que ya la aplicaron nunca corren el SQL nuevo y las nuevas sí:
 *   dos esquemas distintos con el mismo nombre.
 *
 * Todo eso se decide acá, **antes** de escribir un solo archivo: puro, sin
 * git, para poder probarlo solo. `template-sync.ts` y `template-diff.ts` le
 * pasan los tres lados (baseline, tienda, template) leídos de git.
 */

import { gitEn } from "./template-shared";

export type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

export type LadoMigraciones = {
  /** Contenido de `drizzle/meta/_journal.json` en ese lado, o `null` si no existe. */
  journal: string | null;
  /**
   * Ruta → identidad del contenido (el hash del blob de git alcanza) de cada
   * archivo bajo `drizzle/`. Sólo se compara por igualdad.
   */
  archivos: ReadonlyMap<string, string>;
};

export type ProblemaMigracion = {
  tipo:
    | "journal-invalido"
    | "reescrita-en-template"
    | "editada-en-tienda"
    | "choque";
  detalle: string;
};

export const JOURNAL_PATH = "drizzle/meta/_journal.json";

export function sqlPath(tag: string): string {
  return `drizzle/${tag}.sql`;
}

export function snapshotPath(idx: number): string {
  return `drizzle/meta/${String(idx).padStart(4, "0")}_snapshot.json`;
}

function esEntrada(valor: unknown): valor is JournalEntry {
  if (!valor || typeof valor !== "object") return false;
  const e = valor as Partial<JournalEntry>;
  return (
    Number.isSafeInteger(e.idx) &&
    typeof e.tag === "string" &&
    e.tag !== "" &&
    Number.isSafeInteger(e.when) &&
    typeof e.version === "string" &&
    typeof e.breakpoints === "boolean"
  );
}

/**
 * Lee un journal y verifica lo que el migrador da por sentado: índices
 * contiguos desde 0 en el orden del archivo, tags únicos y `when`
 * estrictamente creciente. Devuelve las entradas o el motivo por el que no
 * sirve (por ejemplo, marcadores de conflicto de una corrida anterior).
 */
export function leerJournal(
  contenido: string | null
): { entradas: JournalEntry[] } | { error: string } {
  if (contenido === null) return { entradas: [] };
  let datos: unknown;
  try {
    datos = JSON.parse(contenido);
  } catch {
    return {
      error:
        "no es JSON válido (¿quedaron marcadores de conflicto de una sincronización anterior?)",
    };
  }
  const entries = (datos as { entries?: unknown })?.entries;
  if (!Array.isArray(entries) || !entries.every(esEntrada)) {
    return { error: "no tiene la forma de un journal de drizzle" };
  }
  const tags = new Set<string>();
  for (const [posicion, entrada] of entries.entries()) {
    if (entrada.idx !== posicion) {
      return {
        error: `el índice ${entrada.idx} (${entrada.tag}) está en la posición ${posicion}: los índices tienen que ser contiguos desde 0`,
      };
    }
    if (tags.has(entrada.tag)) {
      return { error: `el tag ${entrada.tag} aparece dos veces` };
    }
    tags.add(entrada.tag);
    const anterior = entries[posicion - 1];
    if (anterior && entrada.when <= anterior.when) {
      return {
        error: `${entrada.tag} no es posterior a ${anterior.tag} (when ${entrada.when} ≤ ${anterior.when}): el migrador la saltearía`,
      };
    }
  }
  return { entradas: entries };
}

function mismaEntrada(a: JournalEntry, b: JournalEntry): boolean {
  return (
    a.idx === b.idx &&
    a.when === b.when &&
    a.tag === b.tag &&
    a.version === b.version &&
    a.breakpoints === b.breakpoints
  );
}

/** ¿Las dos copias de esta migración son la misma (journal, SQL y snapshot)? */
function mismaMigracion(
  a: JournalEntry,
  ladoA: LadoMigraciones,
  b: JournalEntry,
  ladoB: LadoMigraciones
): boolean {
  return (
    mismaEntrada(a, b) &&
    ladoA.archivos.get(sqlPath(a.tag)) === ladoB.archivos.get(sqlPath(b.tag)) &&
    ladoA.archivos.get(snapshotPath(a.idx)) ===
      ladoB.archivos.get(snapshotPath(b.idx))
  );
}

function describir(entrada: JournalEntry): string {
  return `${String(entrada.idx).padStart(4, "0")} ${entrada.tag} (when ${entrada.when})`;
}

/**
 * Lo que impide sincronizar `drizzle/` sin romper la historia. Vacío = se
 * puede.
 *
 * Una tienda **sin** migraciones propias nunca choca: recibe las del template
 * tal cual. Una tienda **con** migraciones propias puede sincronizar mientras
 * el template no traiga ninguna nueva; si trae, hay que regenerar la propia
 * después de la del template (NEW-STORE.md § "Migraciones propias de una
 * tienda"), y eso no lo decide un script.
 */
export function problemasDeMigraciones(lados: {
  base: LadoMigraciones;
  tienda: LadoMigraciones;
  template: LadoMigraciones;
}): ProblemaMigracion[] {
  const problemas: ProblemaMigracion[] = [];

  const base = leerJournal(lados.base.journal);
  const tienda = leerJournal(lados.tienda.journal);
  const template = leerJournal(lados.template.journal);
  if ("error" in tienda) {
    problemas.push({
      tipo: "journal-invalido",
      detalle: `El journal de la tienda (${JOURNAL_PATH}) ${tienda.error}.`,
    });
  }
  if ("error" in template) {
    problemas.push({
      tipo: "journal-invalido",
      detalle: `El journal del template (${JOURNAL_PATH}) ${template.error}.`,
    });
  }
  // Sin el baseline o sin alguno de los dos lados no hay con qué comparar.
  if ("error" in base || "error" in tienda || "error" in template) {
    return problemas;
  }

  const porTag = (entradas: JournalEntry[]) =>
    new Map(entradas.map((entrada) => [entrada.tag, entrada]));
  const enTienda = porTag(tienda.entradas);
  const enTemplate = porTag(template.entradas);
  const tagsBase = new Set(base.entradas.map((entrada) => entrada.tag));

  // 1. Lo ya publicado no se toca: ni el template ni la tienda reescriben una
  //    migración que alguna base ya puede haber aplicado.
  for (const publicada of base.entradas) {
    const delTemplate = enTemplate.get(publicada.tag);
    if (!delTemplate) {
      problemas.push({
        tipo: "reescrita-en-template",
        detalle: `El template borró la migración publicada ${describir(publicada)}.`,
      });
    } else if (
      !mismaMigracion(publicada, lados.base, delTemplate, lados.template)
    ) {
      problemas.push({
        tipo: "reescrita-en-template",
        detalle: `El template reescribió la migración publicada ${describir(publicada)}: las bases que ya la aplicaron no van a correr el SQL nuevo.`,
      });
    }

    const deLaTienda = enTienda.get(publicada.tag);
    if (!deLaTienda) {
      problemas.push({
        tipo: "editada-en-tienda",
        detalle: `A la tienda le falta la migración publicada ${describir(publicada)}.`,
      });
    } else if (
      !mismaMigracion(publicada, lados.base, deLaTienda, lados.tienda)
    ) {
      problemas.push({
        tipo: "editada-en-tienda",
        detalle: `La tienda cambió la migración publicada ${describir(publicada)} (journal, SQL o snapshot).`,
      });
    }
  }

  // 2. Lo nuevo de cada lado. Una migración que los dos tienen idéntica (la
  //    tienda ya la trajo) no es de nadie.
  const propias = tienda.entradas.filter((entrada) => {
    if (tagsBase.has(entrada.tag)) return false;
    const igual = enTemplate.get(entrada.tag);
    return !(
      igual && mismaMigracion(entrada, lados.tienda, igual, lados.template)
    );
  });
  const nuevas = template.entradas.filter((entrada) => {
    if (tagsBase.has(entrada.tag)) return false;
    const igual = enTienda.get(entrada.tag);
    return !(
      igual && mismaMigracion(entrada, lados.template, igual, lados.tienda)
    );
  });

  if (propias.length > 0 && nuevas.length > 0) {
    const ultimaDeLaTienda = Math.max(
      ...tienda.entradas.map((entrada) => entrada.when)
    );
    const indicesPropios = new Map(
      propias.map((entrada) => [entrada.idx, entrada])
    );
    const detalles = nuevas.map((nueva) => {
      const motivos: string[] = [];
      const mismoIndice = indicesPropios.get(nueva.idx);
      if (mismoIndice)
        motivos.push(`usa el mismo índice que ${mismoIndice.tag}`);
      if (nueva.when <= ultimaDeLaTienda) {
        motivos.push(
          "es anterior a la última migración de la tienda: en una base que ya la aplicó, drizzle la saltearía sin avisar"
        );
      }
      if (motivos.length === 0)
        motivos.push("se mezclaría con la numeración propia de la tienda");
      return `  - del template ${describir(nueva)}: ${motivos.join("; ")}`;
    });
    problemas.push({
      tipo: "choque",
      detalle:
        `La tienda tiene migraciones propias (${propias.map((e) => e.tag).join(", ")}) ` +
        `y el template trae migraciones nuevas:\n${detalles.join("\n")}`,
    });
  }

  return problemas;
}

/** El texto que ve quien corre `template:sync` o `template:diff`. */
export function mensajeProblemasMigraciones(
  problemas: readonly ProblemaMigracion[]
): string {
  return (
    "La historia de migraciones (drizzle/) no se puede sincronizar sola. No escribí nada.\n\n" +
    problemas.map((problema) => `• ${problema.detalle}`).join("\n") +
    "\n\n" +
    '  Qué hacer (NEW-STORE.md § "Migraciones propias de una tienda"):\n' +
    "  - Migración propia que todavía no se aplicó en ninguna base de verdad: sacala\n" +
    "    (el .sql, su snapshot y su entrada del journal) en una rama, sincronizá, y\n" +
    "    regenerala con `pnpm db:generate` encima de las del template.\n" +
    "  - Migración propia ya aplicada en producción, o una migración publicada que\n" +
    "    cambió: no la reescribas ni edites __drizzle_migrations a ciegas. Es una\n" +
    "    revisión a mano, con backup, `pnpm db:check` y el esquema real a la vista.\n"
  );
}

/**
 * Un lado leído de git: el journal y la identidad (hash del blob) de cada
 * archivo bajo `drizzle/` en `ref`. No toca el working tree.
 */
export function ladoDeGit(cwd: string, ref: string): LadoMigraciones {
  const archivos = new Map<string, string>();
  const salida = gitEn(cwd, [
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    ref,
    "--",
    "drizzle",
  ]);
  for (const linea of salida.split("\0")) {
    if (linea === "") continue;
    // "<modo> <tipo> <blob>\t<ruta>"
    const tab = linea.indexOf("\t");
    const [, tipo, blob] = linea.slice(0, tab).split(" ");
    if (tipo === "blob" && blob) archivos.set(linea.slice(tab + 1), blob);
  }
  const journalBlob = archivos.get(JOURNAL_PATH);
  return {
    journal: journalBlob ? gitEn(cwd, ["cat-file", "blob", journalBlob]) : null,
    archivos,
  };
}

/** Los problemas entre el baseline, la tienda (HEAD) y un commit del template. */
export function problemasEntreRefs(
  cwd: string,
  refs: { base: string; tienda: string; template: string }
): ProblemaMigracion[] {
  return problemasDeMigraciones({
    base: ladoDeGit(cwd, refs.base),
    tienda: ladoDeGit(cwd, refs.tienda),
    template: ladoDeGit(cwd, refs.template),
  });
}
