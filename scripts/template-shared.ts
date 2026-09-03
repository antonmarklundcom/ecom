import { execFileSync } from 'node:child_process';

/**
 * Lo que comparten `template-diff.ts` (¿qué falta?) y `template-sync.ts`
 * (traerlo). Nada de esto corre git por su cuenta salvo `git()` y
 * `remotoExiste()`: el resto son funciones puras para poder testearlas sin
 * red ni working tree.
 */

/** Lo que no se bifurca por tienda (NEW-STORE.md §5). Si esto difiere, importa. */
export const MAQUINARIA = [
  'src/domain',
  'src/lib',
  'src/db',
  'src/app/api',
  // Las server actions son el camino de la plata: checkout.ts crea el pedido y
  // cobra, shipping-quote.ts cotiza el envío, admin-payments.ts confirma pagos.
  // NEW-STORE.md §5 pone "checkout y sus rutas API" del lado de la maquinaria y
  // acá vive la mitad de eso, así que sin esta línea el comando contradecía al
  // documento que dice implementar: en una tienda real listó 29 archivos con
  // diferencias y ninguno era una action, mientras checkout.ts difería del
  // template y shipping-quote.ts no existía.
  'src/app/actions',
  'scripts',
  'drizzle',
  '.github/workflows',
] as const;

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
export const MIXTOS = ['src/components/checkout-form.tsx', 'src/app/admin'] as const;

export const BASELINE_FILE = '.template-baseline';

export type Commit = { sha: string; asunto: string; maquinaria: boolean; mixto: boolean };

/** `git log --format=%h %s` (o `%H %s`) → filas. Ignora líneas vacías del final. */
export function parseCommits(salida: string): Array<{ sha: string; asunto: string }> {
  return salida
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '')
    .map((linea) => {
      const espacio = linea.indexOf(' ');
      return espacio === -1
        ? { sha: linea, asunto: '' }
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
  shasDeMixtos: readonly string[] = [],
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
  for (const linea of contenido.split('\n')) {
    const limpia = linea.trim();
    if (limpia === '' || limpia.startsWith('#')) continue;
    return /^[0-9a-f]{7,40}$/i.test(limpia) ? limpia : null;
  }
  return null;
}

export function contenidoBaseline(sha: string): string {
  return (
    '# Hasta acá está al día esta tienda respecto del template (pnpm template:diff).\n' +
    '# Lo escribe `pnpm template:diff --marcar` (o `pnpm template:sync`) después de\n' +
    '# ponerse al día.\n' +
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
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function remotoExiste(cwd: string, remoto: string): boolean {
  try {
    gitEn(cwd, ['remote', 'get-url', remoto]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Los commits en `baseline..ref`, clasificados por si tocan maquinaria o
 * mixtos, más nuevo primero (el orden que da `git log`).
 */
export function commitsClasificados(cwd: string, baseline: string, ref: string): Commit[] {
  const shasQueTocan = (rutas: readonly string[]): string[] =>
    parseCommits(gitEn(cwd, ['log', '--format=%H %s', `${baseline}..${ref}`, '--', ...rutas])).map(
      (commit) => commit.sha,
    );

  return clasificar(
    parseCommits(gitEn(cwd, ['log', '--format=%H %s', `${baseline}..${ref}`])),
    shasQueTocan(MAQUINARIA),
    shasQueTocan(MIXTOS),
  );
}
