import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * Lo que comparten `template-diff.ts` (¿qué falta?) y `template-sync.ts`
 * (traerlo). Nada de esto corre git por su cuenta salvo `git()` y
 * `remotoExiste()`: el resto son funciones puras para poder testearlas sin
 * red ni working tree.
 */

/** Lo que no se bifurca por tienda (NEW-STORE.md §5). Si esto difiere, importa. */
export const MAQUINARIA = [
  "src/domain",
  "src/lib",
  "src/db",
  "src/app/api",
  // Las server actions son el camino de la plata: checkout.ts crea el pedido y
  // cobra, shipping-quote.ts cotiza el envío, admin-payments.ts confirma pagos.
  // NEW-STORE.md §5 pone "checkout y sus rutas API" del lado de la maquinaria y
  // acá vive la mitad de eso, así que sin esta línea el comando contradecía al
  // documento que dice implementar: en una tienda real listó 29 archivos con
  // diferencias y ninguno era una action, mientras checkout.ts difería del
  // template y shipping-quote.ts no existía.
  "src/app/actions",
  "scripts",
  "drizzle",
  ".github/workflows",
  // Los tests de la maquinaria viajan con ella: un arreglo que sólo tocó un
  // test (T2, 554083c) nunca llegaba a las tiendas, que quedaban en rojo.
  "tests",
  ".husky",
] as const;

/**
 * Archivos sueltos que son maquinaria aunque no vivan en una de las carpetas
 * de arriba: dependencias, compilación, lint, tests, y el diccionario de
 * textos. Cuentan como maquinaria para `template:sync` (se fusionan, y un
 * choque es un conflicto a resolver, no piel que la tienda se queda), no para
 * la lista de `template:diff`, donde diferirían en toda tienda.
 *
 * `src/i18n/es-PY.ts` es el caso raro: los textos son piel (cada tienda los
 * reescribe), pero las **claves** son contrato — la maquinaria llama a
 * `t("error.avisoStock.apagado")` y una tienda que se quedaba con su
 * diccionario viejo no compilaba. Fusionar deja los textos de la tienda y
 * suma las claves nuevas.
 */
export const ARCHIVOS_MAQUINARIA = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "next.config.ts",
  "eslint.config.mjs",
  "drizzle.config.ts",
  "playwright.config.ts",
  "vitest.config.mts",
  "vitest.setup.ts",
  "src/proxy.ts",
  "src/instrumentation.ts",
  "src/i18n/es-PY.ts",
  "src/i18n/index.ts",
  "src/i18n/client.ts",
  "src/i18n/public-catalogs.ts",
] as const;

/** ¿`ruta` es maquinaria (carpeta de `MAQUINARIA` o archivo de `ARCHIVOS_MAQUINARIA`)? */
export function esMaquinaria(ruta: string): boolean {
  return (
    MAQUINARIA.some(
      (carpeta) => ruta === carpeta || ruta.startsWith(`${carpeta}/`)
    ) || (ARCHIVOS_MAQUINARIA as readonly string[]).includes(ruta)
  );
}

export function esMixto(ruta: string): boolean {
  return MIXTOS.some(
    (entrada) => ruta === entrada || ruta.startsWith(`${entrada}/`)
  );
}

/**
 * Mixtos: markup que cada tienda rediseña, con lógica compartida adentro.
 *
 * `checkout-form.tsx` es el caso claro: los campos y el diseño son piel, pero
 * también tiene la lógica de cotizar el envío y la de reconfirmar cuando el
 * total cambió.
 *
 * `src/app/admin` entra por el mismo razonamiento. NEW-STORE.md §5 lo llama
 * maquinaria ("`/admin` completo") y en el fondo tiene razón, pero son páginas:
 * la tienda que le cambió el logo o los colores al panel las va a ver
 * distintas para siempre. En MAQUINARIA serían ruido permanente que apaga la
 * señal del `*`. Las *actions* de admin —admin-payments, admin-orders— sí son
 * maquinaria de verdad y ya están arriba, que es donde vive la plata.
 *
 * Ninguno entra en MAQUINARIA porque van a diferir en **toda** tienda que
 * rediseñó, pero callarlos del todo deja sin aviso el día que su lógica cambia.
 * O sea: se avisan aparte, con "miralo a mano", no con "cherry-pickealo".
 */
export const MIXTOS = [
  "src/components",
  "src/app/admin",
  "src/app/setup",
  "src/app/checkout",
  "src/app/cuenta",
  "src/app/carrito",
  "src/app/pedido",
  "src/app/producto",
  "src/app/categoria",
  "src/app/comparar",
  "src/app/page.tsx",
  "src/app/layout.tsx",
] as const;

/**
 * Lo que sólo tiene sentido en el repo del template y una tienda no debe
 * arrastrar: `fable/` son los planes y revisiones con que se construyó el
 * template (una IA en la tienda los lee como tareas propias), la config de
 * Renovate abriría PRs de dependencias en cada tienda cuando éstas ya llegan
 * con template:sync (y cada PR son minutos de CI), y `tiendas.json` es el
 * registro de tiendas del template (cada tienda nueva heredaba la lista
 * entera). `pnpm nueva-tienda` los borra, `bootstrap:repo` no los copia y
 * `template:sync` nunca los trae (y los saca si una tienda vieja los tiene).
 *
 * `.github/dependabot.yml` ya no existe en el template (lo reemplazó
 * Renovate), pero sigue en la lista para que `template:sync` se lo saque a una
 * tienda vieja que lo heredó.
 *
 * Una entrada que termina en `/` es una carpeta entera.
 */
export const SOLO_TEMPLATE = [
  "fable/",
  ".github/renovate.json",
  ".github/dependabot.yml",
  "tiendas.json",
] as const;

export function esSoloTemplate(ruta: string): boolean {
  return SOLO_TEMPLATE.some((entrada) =>
    entrada.endsWith("/") ? ruta.startsWith(entrada) : ruta === entrada
  );
}

/**
 * Docs del template que una tienda no reescribe. Un conflicto ahí no es una
 * decisión de la tienda sino falta de contexto: commits de piel salteados
 * editaron el mismo doc antes que el commit de maquinaria que se está trayendo
 * (así chocó `KNOWN-ISSUES.md` en #109). Gana la versión del template.
 */
export const DOCS_DEL_TEMPLATE = [
  "KNOWN-ISSUES.md",
  "ARCH.md",
  "NEW-STORE.md",
  "CHANGELOG.md",
  "docs/TEMPLATE-INHERITANCE.md",
  "docs/PASSWORD-RECOVERY-EMAIL-PROPOSAL.md",
  // La referencia de las variables opcionales (lo que salió de `.env.example`).
  // Describe la maquinaria, no la tienda: una tienda no tiene nada suyo ahí.
  "docs/ENV-OPCIONAL.md",
] as const;

/**
 * Archivos que son **de la tienda** aunque el template traiga uno: el template
 * los ofrece como punto de partida y nunca más los pisa. `template:sync` los
 * conserva siempre que la tienda tenga el suyo —aunque nunca lo haya tocado
 * y el template haya cambiado el de él—, y los trae sólo si a la tienda le
 * faltan (`globals.css` los importa: sin el archivo, el build se cae).
 *
 * La diferencia con la piel común: un archivo de piel que la tienda nunca
 * tocó se actualiza con el del template. Éstos no, porque estar "sin tocar"
 * no quiere decir que la tienda no lo quiera así.
 *
 * `src/themes/custom.css` son los retoques de CSS de la tienda, cargados
 * últimos (NEW-STORE.md §5): el template lo trae vacío y comentado.
 */
export const DE_LA_TIENDA = ["src/themes/custom.css"] as const;

export function esDeLaTienda(ruta: string): boolean {
  return (DE_LA_TIENDA as readonly string[]).includes(ruta);
}

export const BASELINE_FILE = ".template-baseline";

// ---------------------------------------------------------------------------
// Tests de piel (docs/TEMPLATE-INHERITANCE.md § "Tests que miran la piel")
// ---------------------------------------------------------------------------

/**
 * La huella de cada archivo de piel tal como lo publica el template. Viaja con
 * los tests (es maquinaria: `tests/`) y la escribe
 * `pnpm exec tsx tests/helpers/piel.ts --escribir` en el template.
 */
export const HUELLAS_PIEL = "tests/piel-del-template.json";

/** Las carpetas donde vive la piel que una tienda puede rediseñar. */
export const RAICES_PIEL = ["src/components", "src/app", "src/themes"] as const;

/**
 * Tests de **piel del template**: miran cómo dibuja el template su propia piel
 * (colores de los tokens, el markup de la tarjeta y de la portada, cómo la
 * tarjeta muestra un ₲0 o la leyenda de una foto ilustrativa). Revisan un
 * archivo sólo mientras es el del template (`HUELLAS_PIEL`); una tienda que lo
 * rediseñó es dueña de eso, y el test lo saltea en vez de ponerla en rojo.
 *
 * Todo test que no está acá es **contrato**: lo cumple cualquier piel
 * (`data-testid`, datos privados de proveedores, el modo de venta de
 * `add-to-cart.tsx`, claves de i18n, CSP, `revalidate`). Si un rediseño lo
 * rompe, el rediseño está mal. `tests/unit/piel-del-template.test.ts` verifica
 * que esta lista y los tests que usan `tests/helpers/piel.ts` coincidan.
 */
export const TESTS_DE_PIEL = [
  "src/components/__tests__/catalogue-cards.test.tsx",
  "src/components/__tests__/zero-price-display.test.tsx",
  "src/components/__tests__/home-hero.test.tsx",
  "src/components/__tests__/hero-compat.test.tsx",
  "src/components/__tests__/tema-variantes.test.tsx",
  "tests/unit/piel-sin-colores.test.ts",
] as const;

/**
 * ¿`ruta` es piel que una tienda puede rediseñar? Código o CSS bajo
 * `RAICES_PIEL` que no es maquinaria (las rutas API y las actions lo son) ni
 * un test.
 */
export function esRutaDePiel(ruta: string): boolean {
  return (
    RAICES_PIEL.some((raiz) => ruta.startsWith(`${raiz}/`)) &&
    /\.(tsx?|css)$/.test(ruta) &&
    !/\.test\.tsx?$/.test(ruta) &&
    !ruta.includes("/__tests__/") &&
    !esMaquinaria(ruta)
  );
}

/**
 * La huella de un archivo de piel: SHA-256 del texto con finales de línea
 * LF, para que un checkout de Windows con `core.autocrlf` no cuente como
 * rediseño.
 */
export function huellaPiel(contenido: string | Buffer): string {
  const texto = (typeof contenido === "string" ? contenido : contenido.toString("utf8")).replace(/\r\n/g, "\n");
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Maquinaria del template que la tienda no tiene, sin importar cuándo cambió.
 *
 * `template:sync` mira lo que el template cambió desde el baseline, y
 * `template:diff --marcar` mueve el baseline sin mirar nada. Juntos dejaban un
 * agujero: un archivo de maquinaria que a la tienda le faltaba al marcar ya no
 * volvía a aparecer nunca, porque el template no lo tocaba más. Así llegó
 * productos a septiembre de 2026 sin `src/lib/spreadsheet.ts` mientras
 * `admin-products.ts` —que lo importa— sí llegaba: la tienda compilaba en rojo
 * y nada lo avisaba. Esto es la foto completa, no la resta.
 *
 * Pura: recibe las rutas del template (en el commit objetivo) y cómo saber si
 * la tienda tiene una.
 */
export function maquinariaFaltante(
  rutasTemplate: Iterable<string>,
  laTiendaTiene: (ruta: string) => boolean
): string[] {
  const faltan: string[] = [];
  for (const ruta of rutasTemplate) {
    if (ruta === BASELINE_FILE || esSoloTemplate(ruta) || !esMaquinaria(ruta))
      continue;
    if (!laTiendaTiene(ruta)) faltan.push(ruta);
  }
  return faltan.sort();
}

export type Commit = {
  sha: string;
  asunto: string;
  maquinaria: boolean;
  mixto: boolean;
};

/** `git log --format=%h %s` (o `%H %s`) → filas. Ignora líneas vacías del final. */
export function parseCommits(
  salida: string
): Array<{ sha: string; asunto: string }> {
  return salida
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "")
    .map((linea) => {
      const espacio = linea.indexOf(" ");
      return espacio === -1
        ? { sha: linea, asunto: "" }
        : { sha: linea.slice(0, espacio), asunto: linea.slice(espacio + 1) };
    });
}

/**
 * Marca cuáles de los commits tocan la maquinaria.
 *
 * No es lo mismo un arreglo en `src/domain/stock.ts` —que toda tienda quiere—
 * que un cambio de copy en la home, que cada tienda reescribió a su gusto y
 * cherry-pickear sería pisarle el diseño.
 */
export function clasificar(
  commits: Array<{ sha: string; asunto: string }>,
  shasDeMaquinaria: readonly string[],
  shasDeMixtos: readonly string[] = []
): Commit[] {
  const importantes = new Set(shasDeMaquinaria);
  const aMano = new Set(shasDeMixtos);
  return commits.map((commit) => ({
    ...commit,
    maquinaria: importantes.has(commit.sha),
    // Un commit que toca las dos cosas ya se lleva el `*`: cherry-pickearlo es
    // el consejo que manda, y avisarlo dos veces no agrega nada.
    mixto: !importantes.has(commit.sha) && aMano.has(commit.sha),
  }));
}

/** El SHA guardado, o `null` si el archivo no está o quedó ilegible. */
export function parseBaseline(contenido: string): string | null {
  for (const linea of contenido.split("\n")) {
    const limpia = linea.trim();
    if (limpia === "" || limpia.startsWith("#")) continue;
    return /^[0-9a-f]{7,40}$/i.test(limpia) ? limpia : null;
  }
  return null;
}

export function contenidoBaseline(sha: string): string {
  return (
    "# Hasta acá está al día esta tienda respecto del template (pnpm template:diff).\n" +
    "# Lo escribe `pnpm template:diff --marcar` (o `pnpm template:sync`) después de\n" +
    "# ponerse al día.\n" +
    `${sha}\n`
  );
}

// ---------------------------------------------------------------------------
// De acá para abajo, git de verdad
// ---------------------------------------------------------------------------

/**
 * git, callado, sobre el repo en `cwd`.
 *
 * `stdio` explícito porque si no `execFileSync` deja pasar el stderr de git a
 * la terminal: un `git remote get-url template` que falla —que es justamente
 * cómo detectamos que falta el remoto— imprimiría "error: No such remote"
 * arriba del mensaje que sí explica qué hacer.
 */
export function gitEn(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * El commit del template del que salió esta tienda: el que tiene **el mismo
 * árbol** que el primer commit de la tienda.
 *
 * "Use this template" crea un repo nuevo con un commit inicial propio, sin
 * historia compartida, pero con el árbol exacto de `main` en ese momento. Ese
 * es el baseline verdadero; la punta de `template/main` no: marcarla da por
 * traídos todos los arreglos que el template sumó entre la creación de la
 * tienda y el día que alguien corrió el wizard, y ninguno llega nunca.
 *
 * `null` si no hay coincidencia (una tienda que ya existía, `bootstrap:repo`).
 */
export function commitDeOrigen(cwd: string, ref: string): string | null {
  const raices = gitEn(cwd, ["rev-list", "--max-parents=0", "HEAD"])
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "");
  const arboles = new Set(
    raices.map((raiz) => gitEn(cwd, ["rev-parse", `${raiz}^{tree}`]).trim())
  );

  for (const linea of gitEn(cwd, ["log", "--format=%H %T", ref]).split("\n")) {
    const [sha, arbol] = linea.trim().split(" ");
    if (sha && arbol && arboles.has(arbol)) return sha;
  }
  return null;
}

export function remotoExiste(cwd: string, remoto: string): boolean {
  try {
    gitEn(cwd, ["remote", "get-url", remoto]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Los commits en `baseline..ref`, clasificados por si tocan maquinaria o
 * mixtos, más nuevo primero (el orden que da `git log`).
 */
export function commitsClasificados(
  cwd: string,
  baseline: string,
  ref: string
): Commit[] {
  // Los merges de PR no se cherry-pickean: requieren -m y sus commits ya viajan
  // por su propio SHA; se excluyen tanto de la lista como de la clasificación.
  const shasQueTocan = (rutas: readonly string[]): string[] =>
    parseCommits(
      gitEn(cwd, [
        "log",
        "--no-merges",
        "--format=%H %s",
        `${baseline}..${ref}`,
        "--",
        ...rutas,
      ])
    ).map((commit) => commit.sha);

  return clasificar(
    parseCommits(
      gitEn(cwd, [
        "log",
        "--no-merges",
        "--format=%H %s",
        `${baseline}..${ref}`,
      ])
    ),
    shasQueTocan(MAQUINARIA),
    shasQueTocan(MIXTOS)
  );
}

/** Las rutas versionadas en `ref` (un commit, rama o `HEAD`). */
export function rutasEn(cwd: string, ref: string): string[] {
  return gitEn(cwd, ["ls-tree", "-r", "-z", "--name-only", "--full-tree", ref])
    .split("\0")
    .filter((ruta) => ruta !== "");
}
