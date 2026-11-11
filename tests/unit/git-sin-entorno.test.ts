import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { gitEn } from '../../scripts/template-shared';
import { envSinGit } from '../helpers/git-sin-entorno';

/**
 * Ningún `git` hijo hereda `GIT_DIR` y compañía (docs/log/o28.md: un `git init`
 * dentro del pre-push reinicializó el repo del template y le dejó
 * `core.bare = true`). Dos partes: el comportamiento de `gitEn` y un escaneo
 * estático de los archivos versionados.
 */

const limpio = envSinGit();
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: limpio, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('gitEn con GIT_* heredados', () => {
  const base = mkdtempSync(join(tmpdir(), 'giten-'));
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  const señuelo = join(base, 'senuelo');
  const objetivo = join(base, 'objetivo');
  for (const d of [señuelo, objetivo]) {
    git(base, 'init', '-q', '-b', 'main', d);
  }
  writeFileSync(join(objetivo, 'a.txt'), 'a');
  git(objetivo, 'add', 'a.txt');
  git(objetivo, '-c', 'user.name=x', '-c', 'user.email=x@example.py', 'commit', '-q', '-m', 'uno');

  const foto = () => ({
    config: readFileSync(join(señuelo, '.git', 'config'), 'utf8'),
    refs: readdirSync(join(señuelo, '.git', 'refs'), { recursive: true }).map(String).sort(),
    head: readFileSync(join(señuelo, '.git', 'HEAD'), 'utf8'),
  });

  it('opera sobre el repo pedido y no toca el del entorno', () => {
    const antes = foto();
    const guardado = { ...process.env };
    process.env.GIT_DIR = join(señuelo, '.git');
    process.env.GIT_WORK_TREE = señuelo;
    process.env.GIT_INDEX_FILE = join(señuelo, '.git', 'index');
    try {
      expect(gitEn(objetivo, ['log', '-1', '--format=%s']).trim()).toBe('uno');
      expect(gitEn(objetivo, ['rev-parse', '--absolute-git-dir']).trim().split('\\').join('/')).toMatch(/\/objetivo\/\.git$/);
      gitEn(objetivo, ['config', 'giten.prueba', 'si']);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in guardado)) delete process.env[k];
      Object.assign(process.env, guardado);
    }
    expect(foto()).toEqual(antes);
    expect(git(objetivo, 'config', '--get', 'giten.prueba').trim()).toBe('si');
  });
});

// ---------------------------------------------------------------------------
// Escaneo estático
// ---------------------------------------------------------------------------

const raiz = join(__dirname, '..', '..');
const archivos = execFileSync('git', ['ls-files', 'scripts', 'tests', 'fable/harness-tiendas'], {
  cwd: raiz,
  env: limpio,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f) && f !== 'tests/unit/git-sin-entorno.test.ts');

// Casos seguros a propósito: 'archivo' → por qué. Hoy ninguno.
const PERMITIDOS: Record<string, string> = {};

const SPAWN_DIRECTO = /\b(execFileSync|execFile|spawnSync|spawn)\(\s*['"`]git['"`]|\b(execSync|exec)\(\s*['"`]git\b/;
const ENVOLTURA = /\b(correr|sh|run)\(\s*['"`]git['"`]/;
const ENTORNO_LIMPIO = /envSinGit\(|\benv\s*[,}]|\benv:\s*(?!process\.env)\S/;

describe('todo git hijo corre sin GIT_*', () => {
  it('hay archivos que escanear', () => {
    expect(archivos.length).toBeGreaterThan(50);
  });

  it('cada spawn de git lleva un entorno limpio', () => {
    const malos: string[] = [];
    for (const f of archivos) {
      if (f in PERMITIDOS) continue;
      const texto = readFileSync(join(raiz, f), 'utf8');
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        if (SPAWN_DIRECTO.test(linea)) {
          const ventana = lineas.slice(i, i + 12).join('\n');
          if (!ENTORNO_LIMPIO.test(ventana)) malos.push(`${f}:${i + 1}: git sin entorno limpio (usá envSinGit() o gitEn)`);
        }
        if (ENVOLTURA.test(linea) && !/sacarGitDelEntorno\(|envSinGit\(/.test(texto)) {
          malos.push(`${f}:${i + 1}: git por una función auxiliar sin sacarGitDelEntorno()/envSinGit() en el archivo`);
        }
      });
    }
    expect(malos).toEqual([]);
  });

  it('los .sh del arnés que usan git cargan lib.sh (que hace unset de GIT_*)', () => {
    const lib = readFileSync(join(raiz, 'fable/harness-tiendas/lib.sh'), 'utf8');
    expect(lib).toMatch(/unset .*GIT_|GIT_\*|compgen -e GIT_/);
    const sh = execFileSync('git', ['ls-files', 'fable/harness-tiendas'], { cwd: raiz, env: limpio, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.sh') && !f.endsWith('lib.sh') && !f.endsWith('.example.sh'));
    const malos = sh.filter((f) => {
      const t = readFileSync(join(raiz, f), 'utf8');
      return /\bgit\b/.test(t) && !/lib\.sh/.test(t);
    });
    expect(malos).toEqual([]);
  });
});
