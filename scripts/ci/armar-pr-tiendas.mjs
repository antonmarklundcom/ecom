#!/usr/bin/env node
// Sólo lo usa `.github/workflows/distribuir.yml` (plan-operacion.md §6.5),
// corriendo dentro del checkout recién clonado de la tienda, con `GH_TOKEN`
// puesto a `secrets.TIENDAS_TOKEN` (así `gh` opera sobre el repo de la
// tienda, no sobre este). No es parte del CLI de `template:sync` — sólo
// traduce su salida `--json` en un push + PR (o en nada, o en un error
// legible), que es trabajo de shell/CI y no de una librería que alguien
// vaya a importar.
//
// Uso: node armar-pr-tiendas.mjs --repo owner/tienda --rama template/... \
//        --resultado sync-resultado.json --sha <sha-del-template>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

function commitLista(commits) {
  if (!commits || commits.length === 0) return '_(ninguno)_';
  return commits.map((c) => `- \`${c.sha.slice(0, 12)}\` ${c.asunto}`).join('\n');
}

function main() {
  const { repo, rama, resultado: rutaResultado, sha } = args();
  if (!repo || !rama || !rutaResultado) {
    console.error('Uso: armar-pr-tiendas.mjs --repo owner/tienda --rama <rama> --resultado <archivo.json> --sha <sha>');
    process.exit(1);
  }

  let resultado;
  try {
    resultado = JSON.parse(readFileSync(rutaResultado, 'utf8'));
  } catch (error) {
    console.error(`No pude leer/parsear ${rutaResultado} (¿template:sync no imprimió JSON válido?): ${error.message}`);
    process.exit(1);
  }

  const titulo = `Actualizar maquinaria del template (${new Date().toISOString().slice(0, 10)})`;
  const pie =
    '\n---\n' +
    `Generado por \`distribuir.yml\` en \`antonmarklundcom/ecom@${sha ? sha.slice(0, 12) : '?'}\` — ` +
    '`pnpm template:sync` corrió con `--sin-tests`: el CI de esta tienda es el que decide si se mergea.';

  if (resultado.estado === 'sin-cambios') {
    console.log('✓ Esta tienda ya está al día con el template — no hay nada que empujar.');
    return;
  }

  if (resultado.estado === 'precondicion') {
    console.error(`✗ template:sync no pudo arrancar en esta tienda: ${resultado.mensaje}`);
    process.exit(1);
  }

  const commitAplicados = resultado.aplicados ?? [];
  const conflicto = resultado.estado === 'conflicto-manual';
  const falloPost = resultado.estado === 'fallo-post';

  if ((conflicto || falloPost) && commitAplicados.length === 0) {
    // Nada aplicado y encima falló: no hay rama útil que empujar.
    console.error(`✗ ${resultado.mensaje ?? 'template:sync falló sin aplicar ningún commit.'}`);
    process.exit(1);
  }

  // Hay algo commiteado en la rama local (completo, o parcial antes de
  // pararse) — empujarlo y abrir/actualizar el PR es siempre correcto: la
  // tienda nunca pierde commits de maquinaria por un conflicto posterior.
  sh('git', ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${rama}`]);

  const cuerpoPartes = [
    `Trae maquinaria pendiente de [antonmarklundcom/ecom](https://github.com/antonmarklundcom/ecom).`,
    '',
    '**Commits traídos:**',
    commitLista(commitAplicados),
  ];

  if ((resultado.salteados ?? []).length > 0) {
    cuerpoPartes.push('', '**Ya estaban aplicados (saltados):**', commitLista(resultado.salteados));
  }

  let draft = false;
  if (conflicto) {
    draft = true;
    cuerpoPartes.push(
      '',
      `**Se paró en un conflicto que \`template:sync\` no pudo resolver solo**, en \`${resultado.sha?.slice(0, 12) ?? '?'}\` ("${resultado.asunto ?? '?'}"):`,
      '',
      ...(resultado.archivos ?? []).map((archivo) => `- \`${archivo}\``),
      '',
      '```',
      resultado.mensaje ?? '',
      '```',
      '',
      'Este PR trae aplicado sólo lo que entró limpio hasta ahí. Para seguir a mano, en un checkout de esta tienda:',
      '',
      '```bash',
      `git fetch origin ${rama} && git checkout ${rama}`,
      'git remote add template https://github.com/antonmarklundcom/ecom.git 2>/dev/null || true',
      'pnpm template:sync   # retoma desde acá, commit por commit',
      '```',
    );
  } else if (falloPost) {
    draft = true;
    cuerpoPartes.push(
      '',
      `**\`pnpm install\` (u otro paso posterior) falló al aplicar la maquinaria:**`,
      '',
      '```',
      resultado.mensaje ?? '',
      '```',
      '',
      'Este PR trae lo que sí se aplicó. Revisar a mano antes de mergear.',
    );
  }

  cuerpoPartes.push(pie);
  const cuerpo = cuerpoPartes.join('\n');

  const yaExiste = (() => {
    try {
      sh('gh', ['pr', 'view', rama, '-R', repo]);
      return true;
    } catch {
      return false;
    }
  })();

  if (yaExiste) {
    sh('gh', ['pr', 'edit', rama, '-R', repo, '--title', titulo, '--body', cuerpo]);
    if (draft) {
      try {
        sh('gh', ['pr', 'ready', rama, '-R', repo, '--undo']);
      } catch {
        // ya estaba en draft
      }
    }
    console.log(`✓ PR actualizado en ${repo} (rama ${rama}).`);
    return;
  }

  const crearArgs = ['pr', 'create', '-R', repo, '--head', rama, '--base', 'main', '--title', titulo, '--body', cuerpo];
  if (draft) crearArgs.push('--draft');
  const salida = sh('gh', crearArgs);
  console.log(salida.trim());
}

main();
