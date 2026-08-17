import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * `pnpm template:diff` — ¿qué arreglos del template le faltan a esta tienda?
 *
 * Los repos creados con "Use this template" **no reciben** los commits
 * posteriores del template (NEW-STORE.md). Si arreglás un bug de checkout acá,
 * las tiendas ya creadas no se enteran, y con tres o cuatro andando nadie se
 * acuerda de cuál tiene qué.
 *
 * El problema para calcular eso: un repo hecho desde un template **no comparte
 * historia** con el original — arranca de un commit inicial propio. O sea que
 * `git log HEAD..template/main` no sirve: sin ancestro común, lista todo.
 *
 * Por eso hay un archivo `.template-baseline` con el SHA del template hasta
 * donde esta tienda está al día. Con ese punto de partida, "qué falta" vuelve a
 * ser una resta:
 *
 *   pnpm template:diff              # qué commits del template no están acá
 *   pnpm template:diff --marcar     # "ya me puse al día": guarda el SHA actual
 *
 * Sin baseline todavía, igual sirve: compara los archivos de la maquinaria
 * contra el template y te dice cuáles difieren.
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

export type Opciones = {
  remoto: string;
  rama: string;
  marcar: boolean;
};

export function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = { remoto: 'template', rama: 'main', marcar: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];

    if (flag === '--marcar') {
      opciones.marcar = true;
      continue;
    }
    if (flag === '--remoto' || flag === '--rama') {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith('--')) throw new Error(`${flag} espera un valor`);
      if (flag === '--remoto') opciones.remoto = valor;
      else opciones.rama = valor;
      i += 1;
      continue;
    }

    throw new Error(`no conozco la opción "${flag}"`);
  }

  return opciones;
}

export type Commit = { sha: string; asunto: string; maquinaria: boolean; mixto: boolean };

/** `git log --format=%h %s` → filas. Ignora líneas vacías del final. */
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
    '# Lo escribe `pnpm template:diff --marcar` después de que te pusiste al día.\n' +
    `${sha}\n`
  );
}

// ---------------------------------------------------------------------------
// De acá para abajo, git de verdad
// ---------------------------------------------------------------------------

/**
 * git, callado.
 *
 * `stdio` explícito porque si no `execFileSync` deja pasar el stderr de git a
 * la terminal: un `git remote get-url template` que falla —que es justamente
 * cómo detectamos que falta el remoto— imprimiría "error: No such remote"
 * arriba del mensaje que sí explica qué hacer.
 */
function git(...args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function remotoExiste(remoto: string): boolean {
  try {
    git('remote', 'get-url', remoto);
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const opciones = parseArgs(process.argv.slice(2));
  const ref = `${opciones.remoto}/${opciones.rama}`;

  if (!remotoExiste(opciones.remoto)) {
    console.error(
      `\n✗ No hay un remoto "${opciones.remoto}". Agregalo una vez y listo:\n\n` +
        `    git remote add ${opciones.remoto} https://github.com/antonmarklundcom/ecom.git\n\n` +
        'Si esto ES el repo del template, no hay nada que comparar.\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nBuscando novedades en ${ref}…`);
  try {
    git('fetch', opciones.remoto, opciones.rama);
  } catch {
    console.error(`✗ No pude traer ${ref}. ¿Tenés acceso al repo del template?`);
    process.exitCode = 1;
    return;
  }

  const cabezaTemplate = git('rev-parse', ref).trim();

  if (opciones.marcar) {
    writeFileSync(BASELINE_FILE, contenidoBaseline(cabezaTemplate));
    console.log(
      `\n✓ ${BASELINE_FILE} apunta a ${cabezaTemplate.slice(0, 12)}.\n` +
        '  Commiteá ese archivo: es lo que hace que la próxima corrida sepa desde dónde mirar.\n',
    );
    return;
  }

  const baseline = existsSync(BASELINE_FILE)
    ? parseBaseline(readFileSync(BASELINE_FILE, 'utf8'))
    : null;

  if (!baseline) {
    sinBaseline(ref);
    return;
  }

  const shasQueTocan = (...rutas: readonly string[]): string[] =>
    parseCommits(git('log', '--format=%h %s', `${baseline}..${ref}`, '--', ...rutas)).map(
      (commit) => commit.sha,
    );

  const commits = clasificar(
    parseCommits(git('log', '--format=%h %s', `${baseline}..${ref}`)),
    shasQueTocan(...MAQUINARIA),
    shasQueTocan(...MIXTOS),
  );

  if (commits.length === 0) {
    console.log('\n✓ Esta tienda está al día con el template.\n');
    return;
  }

  const deMaquinaria = commits.filter((commit) => commit.maquinaria);
  const mixtos = commits.filter((commit) => commit.mixto);

  console.log(`\n${commits.length} commit(s) del template que no están acá:\n`);
  for (const commit of commits) {
    // El asterisco es el que te dice cuáles mirar primero.
    const marca = commit.maquinaria ? '*' : commit.mixto ? '~' : ' ';
    console.log(`  ${marca} ${commit.sha}  ${commit.asunto}`);
  }

  console.log(
    `\n  * = toca la maquinaria (${MAQUINARIA.join(', ')}): son los que toda tienda quiere.\n` +
      '      El resto suele ser piel —copy, diseño— que cada tienda reescribió a su gusto;\n' +
      '      cherry-pickearlos puede pisarte el rediseño.\n',
  );

  if (mixtos.length > 0) {
    console.log(
      `  ~ = toca ${MIXTOS.join(', ')}: markup tuyo con lógica compartida adentro.\n` +
        '      No lo cherry-pickees a ciegas —te pisa el rediseño— pero leé el diff:\n' +
        '      si lo que cambió es la lógica, te falta.\n',
    );
  }

  if (deMaquinaria.length > 0) {
    console.log('Para traerlos, del más viejo al más nuevo:\n');
    console.log(
      `    git cherry-pick ${deMaquinaria
        .map((commit) => commit.sha)
        .reverse()
        .join(' ')}\n`,
    );
  }

  console.log(
    'Cuando termines (o si decidís saltearlos a propósito):\n\n' +
      '    pnpm template:diff --marcar\n\n' +
      'Sin eso, los mismos commits vuelven a aparecer la próxima vez.\n',
  );
}

function sinBaseline(ref: string): void {
  console.log(
    `\nTodavía no hay ${BASELINE_FILE}, así que no puedo hacer la resta:\n` +
      'un repo creado con "Use this template" no comparte historia con el original,\n' +
      'y sin un punto de partida "qué falta" sería la lista entera.\n',
  );

  const difieren = (...rutas: readonly string[]): string[] =>
    git('diff', '--name-only', `HEAD..${ref}`, '--', ...rutas)
      .split('\n')
      .filter((linea) => linea.trim() !== '');

  const cambiados = difieren(...MAQUINARIA);

  if (cambiados.length === 0) {
    console.log('Mientras tanto: la maquinaria es idéntica a la del template. Buena señal.\n');
  } else {
    console.log(`Mientras tanto, ${cambiados.length} archivo(s) de la maquinaria difieren:\n`);
    for (const archivo of cambiados) console.log(`    ${archivo}`);
    console.log(`\n  Miralos con:  git diff HEAD..${ref} -- <archivo>\n`);
  }

  const aMano = difieren(...MIXTOS);
  if (aMano.length > 0) {
    console.log(
      'Y aparte, markup tuyo con lógica compartida adentro (leé el diff, no lo pises):\n',
    );
    for (const archivo of aMano) console.log(`    ${archivo}`);
    console.log('');
  }

  console.log(
    'Para que la próxima corrida sirva de verdad, fijá el punto de partida:\n\n' +
      '    pnpm template:diff --marcar\n\n' +
      'Marca "estoy al día con el template de hoy". A partir de ahí te lista sólo lo nuevo.\n',
  );
}

// Igual que el resto de los scripts: los tests importan las funciones puras de
// acá arriba sin correr un solo comando de git.
if (process.argv[1] && /template-diff\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
