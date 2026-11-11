#!/usr/bin/env node
// Lo usa `scripts/ci/distribuir-lote.mjs` (el job `distribuir` de
// `.github/workflows/distribuir.yml`), dentro del checkout recién clonado de la
// tienda, con `GH_TOKEN` puesto a `secrets.TIENDAS_TOKEN` (así `gh` opera sobre
// el repo de la tienda, no sobre este). No es parte del CLI de
// `template:sync` — sólo traduce su salida `--json` en un push + PR (o en
// nada, o en un error legible).
//
// Uso a mano: node armar-pr-tiendas.mjs --repo owner/tienda --rama template/sync \
//        --base main --resultado sync-resultado.json --sha <sha-del-template> \
//        [--version v1.2.0] [--email-bot actions@users.noreply.github.com] \
//        [--template <checkout-del-template-con-tags>]
//
// Una sola rama por tienda (`template/sync`): cada versión nueva reescribe la
// misma rama y actualiza el mismo PR, en vez de apilar un PR por corrida.
//
// Dos casos dejan a esa tienda en ROJO (hasta O28 eran un aviso y un job
// verde: una tienda podía quedar meses sin recibir nada sin que nadie lo viera):
//   - alguien empujó commits a mano a `template/sync` y su PR sigue abierto:
//     no se pisan, no se empuja nada, y la corrida dice qué hacer;
//   - el PR de sync lleva abierto más de `MAX_VERSIONES_SIN_MERGEAR` versiones
//     del template: se actualiza igual (así trae lo último) y la corrida falla.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Un PR de sync puede sobrevivir a dos versiones nuevas; a la tercera, rojo. */
export const MAX_VERSIONES_SIN_MERGEAR = 2;

function args() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const clave = argv[i]?.replace(/^--/, '');
    out[clave] = argv[i + 1];
  }
  return out;
}

function sh(cmd, cmdArgs, opciones = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opciones });
}

function lista(rutas) {
  return rutas.map((ruta) => `- \`${ruta}\``).join('\n');
}

function commitLista(commits) {
  if (!commits || commits.length === 0) return '_(ninguno de maquinaria)_';
  return commits.map((c) => `- \`${c.sha.slice(0, 12)}\` ${c.asunto}`).join('\n');
}

/** Secciones del cuerpo del PR, sólo las que tienen algo. */
function seccionesResumen(resumen) {
  const partes = [];
  const agregar = (titulo, rutas) => {
    if (rutas && rutas.length > 0) partes.push('', `**${titulo}** (${rutas.length})`, '', lista(rutas));
  };
  if (resumen.conflictos?.length > 0) {
    partes.push(
      '',
      `**⚠ Conflictos a resolver en esta rama antes de mergear** (${resumen.conflictos.length})`,
      '',
      ...resumen.conflictos.map((c) => `- \`${c.ruta}\` — ${c.motivo}`),
    );
  }
  agregar('Cambios de esta tienda que pisó el template — revisalos', resumen.reemplazados);
  agregar('Mixtos: el template cambió su lógica y esta tienda los tiene distintos — miralos a mano', resumen.mixtos);
  agregar('Maquinaria que faltaba en esta tienda, restaurada', resumen.restaurados);
  agregar('Fusionados solos (cambios de los dos lados)', resumen.fusionados);
  agregar('Traídos del template', resumen.traidos);
  agregar('Borrados (el template los sacó)', resumen.borrados);
  agregar(
    '⚠ Piel de esta tienda que el template borró o renombró — ya no se usa: pasá el diseño al archivo nuevo',
    resumen.huerfanos,
  );
  agregar('Piel o docs de esta tienda que no se tocaron', resumen.conservados);
  return partes;
}

/**
 * ¿La rama remota tiene commits que no hizo el bot? Entonces alguien trabajó
 * ahí. Los merge commits no cuentan: "Update branch" de GitHub sólo trae la
 * base, y la corrida nueva ya arranca de la base.
 */
export function commitsAMano(base, rama, emailBot, correr = sh) {
  try {
    correr('git', ['fetch', 'origin', rama]);
  } catch {
    return []; // la rama no existe todavía
  }
  const autores = correr('git', ['log', '--no-merges', '--format=%h %ae %s', `origin/${base}..origin/${rama}`])
    .split('\n')
    .filter((linea) => linea.trim() !== '');
  return autores.filter((linea) => linea.split(' ')[1] !== emailBot);
}

/** El PR abierto de esa rama en la tienda, o `null`. */
function prAbierto(repo, rama, correr = sh) {
  try {
    const salida = correr('gh', ['pr', 'list', '-R', repo, '--head', rama, '--state', 'open', '--json', 'number,isDraft,createdAt']);
    return JSON.parse(salida)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Las versiones del template (tags `v*`) con su fecha, del checkout del
 * template (`fetch-depth: 0` trae los tags). La fecha de un tag anotado es la
 * de `git tag -a`; la de uno liviano, la de su commit.
 */
export function releasesDelTemplate(dir, correr = sh) {
  try {
    return correr('git', ['-C', dir, 'for-each-ref', '--format=%(refname:short)%09%(creatordate:iso-strict)', 'refs/tags/v*'])
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '')
      .map((linea) => {
        const [nombre, fecha] = linea.split('\t');
        return { nombre, fecha };
      });
  } catch {
    return [];
  }
}

/** Cuántas versiones del template salieron después de que se abrió el PR. */
export function versionesDesde(creadoEn, releases) {
  const desde = Date.parse(creadoEn ?? '');
  if (Number.isNaN(desde)) return 0;
  return releases.filter((r) => {
    const fecha = Date.parse(r.fecha ?? '');
    return !Number.isNaN(fecha) && fecha > desde;
  }).length;
}

/**
 * Qué hacer con esta tienda, sin tocar nada todavía.
 * @param {{ repo: string, rama: string, resultado: any, existente?: { number: number, isDraft?: boolean, createdAt?: string } | null, aMano?: string[], versiones?: number }} entrada
 * @returns {{ accion: 'nada' | 'fallar' | 'empujar', mensaje?: string, conflicto?: boolean, vencido?: string | null }}
 */
export function decidir({ repo, rama, resultado, existente = null, aMano = [], versiones = 0 }) {
  if (resultado.estado === 'sin-cambios') {
    return { accion: 'nada', mensaje: '✓ Esta tienda ya está al día con el template — no hay nada que empujar.' };
  }
  if (resultado.estado === 'precondicion' || !resultado.resumen) {
    return {
      accion: 'fallar',
      mensaje: `✗ template:sync no pudo arrancar en esta tienda: ${resultado.mensaje ?? JSON.stringify(resultado)}`,
    };
  }
  const conflicto = resultado.estado === 'conflicto';
  if (conflicto && !resultado.commiteado) {
    return { accion: 'fallar', mensaje: '✗ template:sync dejó conflictos sin commitear (¿falta --commitear-conflictos en el workflow?).' };
  }
  // Los commits a mano sólo se cuidan mientras su PR sigue abierto. Un PR
  // cerrado, o mergeado con squash, deja la rama con commits ajenos que nunca
  // van a ser ancestros de la base: esa rama se rearma entera.
  if (existente && aMano.length > 0) {
    return {
      accion: 'fallar',
      mensaje:
        `::error::${repo}: el PR #${existente.number} (rama ${rama}) tiene commits hechos a mano, así que no lo actualizo y esta tienda NO recibe esta versión:\n` +
        aMano.map((linea) => `    ${linea}`).join('\n') +
        '\nMergealo (o cerralo) y volvé a correr la distribución de esta versión para traer lo nuevo.',
    };
  }
  const vencido =
    existente && versiones > MAX_VERSIONES_SIN_MERGEAR
      ? `::error::${repo}: el PR #${existente.number} de sync está abierto desde hace ${versiones} versiones del template ` +
        `(el máximo es ${MAX_VERSIONES_SIN_MERGEAR}). Lo actualicé con esta versión, pero la tienda se está quedando atrás: ` +
        'revisalo y mergealo (pnpm template:atraso muestra cuánto le falta a cada tienda).'
      : null;
  return { accion: 'empujar', conflicto, vencido };
}

/**
 * Empuja la rama y abre o actualiza el PR. Devuelve el código de salida: 0
 * bien, 1 esta tienda queda en rojo.
 */
export function armarPr(opciones, deps = {}) {
  const correr = deps.sh ?? sh;
  const log = deps.log ?? ((texto) => console.log(texto));
  const error = deps.error ?? ((texto) => console.error(texto));
  const {
    repo,
    rama,
    base = 'main',
    resultado,
    sha,
    version,
    emailBot = 'actions@users.noreply.github.com',
    releases = [],
  } = opciones;

  // El PR y los commits a mano sólo importan si hay algo que empujar.
  const hayAlgo = resultado.estado !== 'sin-cambios' && resultado.estado !== 'precondicion' && Boolean(resultado.resumen);
  const existente = hayAlgo ? prAbierto(repo, rama, correr) : null;
  const aMano = existente ? commitsAMano(base, rama, emailBot, correr) : [];
  const decision = decidir({
    repo,
    rama,
    resultado,
    existente,
    aMano,
    versiones: existente ? versionesDesde(existente.createdAt, releases) : 0,
  });
  if (decision.accion === 'nada') {
    log(decision.mensaje);
    return 0;
  }
  if (decision.accion === 'fallar') {
    // `::error::` va por stdout para que GitHub lo anote en la corrida.
    if (decision.mensaje.startsWith('::error::')) log(decision.mensaje);
    else error(decision.mensaje);
    return 1;
  }
  const { conflicto } = decision;

  // `--force`: la rama es del bot, o su PR ya no está abierto (lo acabamos de
  // comprobar), y cada corrida la rearma entera desde la default branch de la
  // tienda.
  correr('git', ['push', '--force', 'origin', `HEAD:refs/heads/${rama}`]);

  // El label que habilita el e2e en el CI de la tienda (ci.yml). Crearlo es
  // idempotente con --force; sin permiso para labels, no frena nada.
  try {
    correr('gh', ['label', 'create', 'ci-completo', '-R', repo, '--force', '--color', '0E8A16', '--description', 'Corre también e2e (Playwright) en el CI']);
  } catch {
    // sin permiso de issues:write; el PR sale igual
  }

  const cabeza = sha ? sha.slice(0, 12) : '?';
  const titulo = `Actualizar maquinaria del template${version ? ` a ${version}` : ''}`;
  const cuerpo = [
    `Trae la maquinaria de [antonmarklundcom/ecom](https://github.com/antonmarklundcom/ecom)` +
      `${version ? ` **${version}**` : ''} (\`${cabeza}\`), archivo por archivo desde el \`.template-baseline\` de esta tienda.` +
      ' Qué cambió en cada versión: `CHANGELOG.md`. Si alguna trae **Migración: sí**, después de mergear hay que redeployar y correr el setup (NEW-STORE.md § "Migraciones que llegan por `template:sync`").',
    ...seccionesResumen(resultado.resumen),
    '',
    '<details><summary>Commits de maquinaria del template incluidos</summary>',
    '',
    commitLista(resultado.commits),
    '',
    '</details>',
    '',
    '---',
    `Generado por \`distribuir.yml\` en \`antonmarklundcom/ecom@${cabeza}\` — \`pnpm template:sync\` corrió con \`--sin-tests\`: ` +
      'el CI de esta tienda es el que decide si se mergea. Para seguir a mano: `git fetch origin && git checkout ' +
      `${rama}\`, resolver, commitear y pushear a esta misma rama. Mientras la rama tenga commits tuyos y este PR siga abierto, ` +
      'la distribución no la pisa y marca esta tienda en rojo hasta que lo mergees o lo cierres. ' +
      `Si este PR sobrevive a más de ${MAX_VERSIONES_SIN_MERGEAR} versiones del template sin mergearse, la distribución también queda en rojo.`,
  ].join('\n');

  if (existente) {
    correr('gh', ['pr', 'edit', String(existente.number), '-R', repo, '--title', titulo, '--body', cuerpo]);
    try {
      if (conflicto && !existente.isDraft) correr('gh', ['pr', 'ready', String(existente.number), '-R', repo, '--undo']);
      if (!conflicto && existente.isDraft) correr('gh', ['pr', 'ready', String(existente.number), '-R', repo]);
    } catch {
      // cambiar draft/ready no es lo importante
    }
    log(`✓ PR #${existente.number} actualizado en ${repo} (rama ${rama}).`);
  } else {
    const crearArgs = ['pr', 'create', '-R', repo, '--head', rama, '--base', base, '--title', titulo, '--body', cuerpo];
    if (conflicto) crearArgs.push('--draft');
    log(String(correr('gh', crearArgs)).trim());
  }

  if (decision.vencido) {
    log(decision.vencido);
    return 1;
  }
  return 0;
}

function main() {
  const {
    repo,
    rama,
    base = 'main',
    resultado: rutaResultado,
    sha,
    version,
    'email-bot': emailBot = 'actions@users.noreply.github.com',
    template,
  } = args();
  if (!repo || !rama || !rutaResultado) {
    console.error(
      'Uso: armar-pr-tiendas.mjs --repo owner/tienda --rama <rama> --base <rama-base> --resultado <archivo.json> --sha <sha>',
    );
    return 1;
  }

  let resultado;
  try {
    resultado = JSON.parse(readFileSync(rutaResultado, 'utf8'));
  } catch (error) {
    console.error(`No pude leer/parsear ${rutaResultado} (¿template:sync no imprimió JSON válido?): ${error.message}`);
    return 1;
  }

  return armarPr({
    repo,
    rama,
    base,
    resultado,
    sha,
    version,
    emailBot,
    releases: template ? releasesDelTemplate(template) : [],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
