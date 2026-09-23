import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  BASELINE_FILE,
  clasificar,
  commitDeOrigen,
  commitsClasificados,
  contenidoBaseline,
  gitEn,
  MAQUINARIA,
  MIXTOS,
  parseBaseline,
  parseCommits,
  remotoExiste,
} from './template-shared';

/**
 * `pnpm template:diff` — ¿qué arreglos del template le faltan a esta tienda?
 *
 * Los repos creados con "Use this template" no reciben **solos** los commits
 * posteriores del template: les llegan como PR `template/sync` cuando se
 * publica una versión (`distribuir.yml`), o a mano con `pnpm template:sync`.
 * Esto dice qué les falta mientras tanto.
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
 *   pnpm template:diff --marcar --origen  # el commit del que salió la tienda
 *
 * Sin baseline todavía, igual sirve: compara los archivos de la maquinaria
 * contra el template y te dice cuáles difieren.
 *
 * Traerlo es `pnpm template:sync` (`template-sync.ts`), archivo por archivo
 * desde el mismo baseline (ver `template-shared.ts`).
 */

// Re-exportado tal cual para que nada de afuera (tests incluidos) tenga que
// saber que esto ahora vive en template-shared.ts.
export { BASELINE_FILE, clasificar, contenidoBaseline, MAQUINARIA, MIXTOS, parseBaseline, parseCommits };

export type Opciones = {
  remoto: string;
  rama: string;
  marcar: boolean;
  /** Con `--marcar`: el commit del que salió la tienda, no la punta del template. */
  origen: boolean;
};

export function parseArgs(argv: string[]): Opciones {
  const opciones: Opciones = { remoto: 'template', rama: 'main', marcar: false, origen: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];

    if (flag === '--marcar') {
      opciones.marcar = true;
      continue;
    }
    if (flag === '--origen') {
      opciones.origen = true;
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

function git(...args: string[]): string {
  return gitEn(process.cwd(), args);
}

function main(): void {
  const opciones = parseArgs(process.argv.slice(2));
  const ref = `${opciones.remoto}/${opciones.rama}`;

  if (!remotoExiste(process.cwd(), opciones.remoto)) {
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
    const marca = opciones.origen ? commitDeOrigen(process.cwd(), ref) : cabezaTemplate;
    if (!marca) {
      console.error(
        `\n✗ Ningún commit de ${ref} tiene el árbol del primer commit de esta tienda.\n` +
          '  Pasa con un repo que ya existía (bootstrap:repo). Buscá a mano de qué commit\n' +
          `  del template salió y escribilo en ${BASELINE_FILE}.\n`,
      );
      process.exitCode = 1;
      return;
    }
    writeFileSync(BASELINE_FILE, contenidoBaseline(marca));
    console.log(
      `\n✓ ${BASELINE_FILE} apunta a ${marca.slice(0, 12)}.\n` +
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

  const commits = commitsClasificados(process.cwd(), baseline, ref);

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
    console.log(`  ${marca} ${commit.sha.slice(0, 12)}  ${commit.asunto}`);
  }

  console.log(
    `\n  * = toca la maquinaria (${MAQUINARIA.join(', ')}): son los que toda tienda quiere.\n` +
      '      El resto suele ser piel —copy, diseño— que cada tienda reescribió a su gusto:\n' +
      '      template:sync la deja como la tenés.\n',
  );

  if (mixtos.length > 0) {
    console.log(
      `  ~ = toca ${MIXTOS.join(', ')}: markup tuyo con lógica compartida adentro.\n` +
        '      template:sync no los pisa si los cambiaste, pero leé el diff:\n' +
        '      si lo que cambió es la lógica, te falta.\n',
    );
  }

  if (deMaquinaria.length > 0) {
    console.log(
      '  Para traerlos, en una rama (nunca en main):\n\n' +
        '      pnpm template:sync --dry-run   # qué haría con cada archivo\n' +
        '      pnpm template:sync\n\n' +
        '  (archivo por archivo, en un commit: la piel que cambiaste queda, la maquinaria\n' +
        '  se fusiona, y un choque de verdad deja marcadores para que lo mires vos.)\n',
    );
  }

  console.log(
    'Si decidís saltearlos a propósito (template:sync ya lo mueve solo):\n\n' +
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
