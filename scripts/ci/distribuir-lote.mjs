#!/usr/bin/env node
// Un job de la matrix de `.github/workflows/distribuir.yml`: un lote de
// tiendas (ver `elegir-tiendas.mjs`), una detrás de otra, desde el checkout del
// template en el tag que se distribuye. Por cada tienda: clonar con
// TIENDAS_TOKEN, `template:sync --sin-tests --json --commitear-conflictos`, y
// `armar-pr-tiendas.mjs` (push + PR, o rojo).
//
// Una tienda que falla no frena a las demás del lote: se sigue, y al final el
// job sale en rojo si alguna falló, con la tabla de cada una en el resumen de
// la corrida. Varias tiendas por job en vez de un job por tienda: cada job
// instala las dependencias una vez y se cobra redondeado al minuto.
//
// El sync corre SIN el token en el entorno: el código que corre ahí es el del
// template (este tag), pero la tienda trae archivos propios y no hace falta
// darles nada.
//
// Uso (workflow): REPOS='["dueño/a","dueño/b"]' VERSION=v2.0.0 TIENDAS_TOKEN=… \
//   node scripts/ci/distribuir-lote.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { armarPr, releasesDelTemplate } from './armar-pr-tiendas.mjs';

export const RAMA = 'template/sync';
export const EMAIL_BOT = 'actions@users.noreply.github.com';

/**
 * Corre `unaTienda` para cada repo, sin cortar en la primera falla.
 * @param {string[]} repos
 * @param {(repo: string) => { ok: boolean, detalle: string }} unaTienda
 */
export function distribuirLote(repos, unaTienda) {
  const resultados = [];
  for (const repo of repos) {
    let resultado;
    try {
      resultado = unaTienda(repo);
    } catch (error) {
      resultado = { ok: false, detalle: error instanceof Error ? error.message.split('\n')[0] : String(error) };
    }
    resultados.push({ repo, ...resultado });
  }
  return { resultados, codigo: resultados.every((r) => r.ok) ? 0 : 1 };
}

/** Markdown para `$GITHUB_STEP_SUMMARY`. */
export function tablaResumen(resultados, version) {
  const filas = resultados.map((r) => `| \`${r.repo}\` | ${r.ok ? '✓' : '✗'} | ${r.detalle.replace(/\|/g, '\\|')} |`);
  return [`### Distribución de ${version}`, '', '| Tienda | | Qué pasó |', '|---|---|---|', ...filas, ''].join('\n');
}

function sh(cmd, args, opciones = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024, ...opciones });
}

/** El entorno sin ningún token: lo que ve `template:sync`. */
function entornoSinToken() {
  const env = { ...process.env };
  delete env.TIENDAS_TOKEN;
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

function unaTiendaDeVerdad({ workspace, version, sha, releases, token }) {
  return (repo) => {
    const carpeta = join(workspace, 'tiendas', repo.replace('/', '__'));
    rmSync(carpeta, { recursive: true, force: true });
    mkdirSync(join(workspace, 'tiendas'), { recursive: true });
    console.log(`::group::${repo}`);
    try {
      try {
        sh('git', ['clone', '-q', `https://x-access-token:${token}@github.com/${repo}.git`, carpeta]);
      } catch {
        return {
          ok: false,
          detalle:
            'no pude clonarla: ¿existe, y TIENDAS_TOKEN tiene acceso a ese repo y no venció? (docs/decisions-needed.md: token de la distribución)',
        };
      }
      const enTienda = { cwd: carpeta };
      sh('git', ['config', 'user.name', 'ecom-template-bot'], enTienda);
      sh('git', ['config', 'user.email', EMAIL_BOT], enTienda);
      sh('git', ['remote', 'add', 'template', workspace], enTienda);
      const base = sh('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], enTienda).trim().replace(/^origin\//, '');

      let salida = '';
      try {
        salida = sh(
          join(workspace, 'node_modules', '.bin', 'tsx'),
          [join(workspace, 'scripts', 'template-sync.ts'), '--sin-tests', '--json', '--commitear-conflictos', '--rama-destino', RAMA],
          { cwd: carpeta, env: entornoSinToken() },
        );
      } catch (error) {
        // template-sync sale con 1 en un conflicto o una precondición, pero
        // igual imprime su JSON: lo decide armar-pr.
        salida = String(error?.stdout ?? '');
        if (error?.stderr) process.stderr.write(String(error.stderr));
      }
      const ultima = salida.trim().split('\n').pop() ?? '';
      let resultado;
      try {
        resultado = JSON.parse(ultima);
      } catch {
        return { ok: false, detalle: 'template:sync no imprimió JSON (mirá el log de esta tienda)' };
      }

      const mensajes = [];
      const codigo = armarPr(
        { repo, rama: RAMA, base, resultado, sha, version, emailBot: EMAIL_BOT, releases },
        {
          sh: (cmd, args) => sh(cmd, args, { cwd: carpeta, env: { ...process.env, GH_TOKEN: token } }),
          log: (texto) => {
            console.log(texto);
            mensajes.push(texto);
          },
          error: (texto) => {
            console.error(texto);
            mensajes.push(texto);
          },
        },
      );
      const detalle = (mensajes.at(-1) ?? resultado.estado).replace(/^::error::/, '').split('\n')[0];
      return { ok: codigo === 0, detalle };
    } finally {
      console.log('::endgroup::');
      rmSync(carpeta, { recursive: true, force: true });
    }
  };
}

function main() {
  const repos = JSON.parse(process.env.REPOS ?? '[]');
  if (!Array.isArray(repos)) throw new Error('REPOS tiene que ser un array JSON');
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const version = process.env.VERSION ?? '';
  const token = process.env.TIENDAS_TOKEN ?? '';
  if (!token) throw new Error('falta TIENDAS_TOKEN');
  const sha = sh('git', ['rev-parse', 'HEAD'], { cwd: workspace }).trim();
  const releases = releasesDelTemplate(workspace);

  const { resultados, codigo } = distribuirLote(repos, unaTiendaDeVerdad({ workspace, version, sha, releases, token }));
  const tabla = tablaResumen(resultados, version);
  console.log(tabla);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${tabla}\n`);
  for (const r of resultados.filter((x) => !x.ok)) console.log(`::error::${r.repo}: ${r.detalle}`);
  return codigo;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
