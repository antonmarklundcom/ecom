import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checklistHostinger,
  IMPRESCINDIBLES_HPANEL,
  mostrarPaso,
  nombreBaseSugerido,
  pasosCrearRepo,
  REPO_TEMPLATE,
  separarBanderasRepo,
} from '../../scripts/nueva-tienda';
import { envSinGit } from '../helpers/git-sin-entorno';

/**
 * S29: `pnpm nueva-tienda --crear-repo` y el checklist del hPanel.
 * Nada de acá toca GitHub: se prueba la lista de comandos, no su ejecución.
 */

const CWD = path.resolve('/tmp/trabajo');

function repoDe(argv: string[]) {
  const { repo } = separarBanderasRepo(argv, CWD);
  if (repo === null) throw new Error('esperaba --crear-repo');
  return repo;
}

describe('--crear-repo: la línea de comandos', () => {
  it('crea el repo desde el template, privado por defecto', () => {
    const pasos = pasosCrearRepo(repoDe(['--crear-repo', 'antonmarklundcom/mi-tienda']));
    expect(pasos[0]).toEqual({
      cmd: 'gh',
      args: ['repo', 'create', 'antonmarklundcom/mi-tienda', '--template', REPO_TEMPLATE, '--private'],
    });
    expect(REPO_TEMPLATE).toBe('antonmarklundcom/ecom');
  });

  it('--publico lo hace público; nunca los dos', () => {
    const args = pasosCrearRepo(repoDe(['--crear-repo', 'a/b', '--publico']))[0]?.args ?? [];
    expect(args).toContain('--public');
    expect(args).not.toContain('--private');
  });

  it('clona, agrega el remoto template, crea el label y recién ahí corre el wizard', () => {
    const pasos = pasosCrearRepo(
      repoDe(['--crear-repo', 'a/mi-tienda', '--nombre', 'Mi Tienda', '--dominio', 'mi.com.py']),
    );
    const carpeta = path.resolve(CWD, '..', 'mi-tienda');
    expect(pasos.map((p) => `${p.cmd} ${p.args.slice(0, 2).join(' ')}`)).toEqual([
      'gh repo create',
      'gh repo clone',
      'git remote add',
      'gh label create',
      'pnpm install --frozen-lockfile',
      'pnpm nueva-tienda --nombre',
    ]);
    expect(pasos[1]?.args).toEqual(['repo', 'clone', 'a/mi-tienda', carpeta]);
    expect(pasos[2]).toEqual({
      cmd: 'git',
      args: ['remote', 'add', 'template', 'https://github.com/antonmarklundcom/ecom.git'],
      cwd: carpeta,
    });
    const label = pasos[3]?.args ?? [];
    expect(label.slice(0, 3)).toEqual(['label', 'create', 'ci-completo']);
    expect(label).toContain('--force'); // idempotente: si el label ya existe, no falla
    expect(label[label.indexOf('--repo') + 1]).toBe('a/mi-tienda');
    expect(pasos[5]?.args).toEqual(['nueva-tienda', '--nombre', 'Mi Tienda', '--dominio', 'mi.com.py']);
    expect(pasos[5]?.cwd).toBe(carpeta);
  });

  it('--en elige la carpeta', () => {
    expect(repoDe(['--crear-repo', 'a/b', '--en', 'x/y']).carpeta).toBe(path.resolve(CWD, 'x/y'));
  });

  it('sin --crear-repo no hay repo y las banderas pasan intactas', () => {
    expect(separarBanderasRepo(['--', '--nombre', 'X', '--dry-run'], CWD)).toEqual({
      repo: null,
      resto: ['--nombre', 'X', '--dry-run'],
    });
  });

  it('rechaza lo que no es dueño/nombre, banderas sueltas y valores que faltan', () => {
    expect(() => separarBanderasRepo(['--crear-repo', 'solo-nombre'], CWD)).toThrow(/dueño\/nombre/);
    expect(() => separarBanderasRepo(['--crear-repo', 'a/b;rm'], CWD)).toThrow(/dueño\/nombre/);
    expect(() => separarBanderasRepo(['--crear-repo'], CWD)).toThrow(/espera un valor/);
    expect(() => separarBanderasRepo(['--publico'], CWD)).toThrow(/--crear-repo/);
  });

  it('mostrarPaso entrecomilla lo que tiene espacios', () => {
    expect(mostrarPaso({ cmd: 'pnpm', args: ['nueva-tienda', '--nombre', 'Mi Tienda'] })).toBe(
      'pnpm nueva-tienda --nombre "Mi Tienda"',
    );
  });

  it('--dry-run imprime los comandos y no corre nada (CLI real, sin gh en el PATH)', () => {
    const r = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/nueva-tienda.ts', '--crear-repo', 'a/prueba-s29', '--dry-run', '--nombre', 'X'],
      { encoding: 'utf8', env: envSinGit(), shell: process.platform === 'win32' },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('gh repo create a/prueba-s29 --template antonmarklundcom/ecom --private');
    expect(r.stdout).toContain('--dry-run: no se creó ni se corrió nada');
  }, 60_000);
});

describe('HOSTINGER-CHECKLIST.md', () => {
  const texto = checklistHostinger({
    nombre: 'Lencería Guaraní',
    dominio: 'https://lenceria.com.py',
    repo: 'a/lenceria',
  });

  it('lleva los valores reales de la tienda', () => {
    expect(texto).toContain('Lencería Guaraní');
    expect(texto).toContain('`lenceria`'); // nombre de base sugerido
    expect(texto).toContain('https://lenceria.com.py/setup');
    expect(texto).toContain('https://lenceria.com.py/api/health');
    expect(texto).toContain('a/lenceria');
  });

  it('nombra las cinco variables y NODE_ENV', () => {
    for (const clave of IMPRESCINDIBLES_HPANEL) expect(texto).toContain(`\`${clave}\``);
    expect(texto).toContain('`NODE_ENV`');
  });

  it('trae las tres líneas de cron con el dominio y la hora UTC', () => {
    const lineas = texto.split('\n').filter((l) => l.includes('/api/cron/'));
    expect(lineas).toEqual([
      '*/15 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://lenceria.com.py/api/cron/vencer-pedidos',
      '0 11 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://lenceria.com.py/api/cron/resumen-diario',
      '0 6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://lenceria.com.py/api/cron/backup',
    ]);
  });

  it('no deja pasar ningún valor secreto: sólo el nombre de la clave de .env.local', () => {
    // La función no recibe secretos, así que no tiene por dónde incluirlos; se
    // verifica además que lo que escribe no tiene forma de `CLAVE=valor`.
    expect(texto).not.toMatch(/(SECRET|PASSWORD|TOKEN)\s*=\s*\S/);
    expect(texto).not.toMatch(/mysql:\/\//); // ni siquiera una URL de ejemplo con forma de credencial
    expect(texto).toContain('copiá `SESSION_SECRET` de `.env.local`');
    expect(texto).toContain('copiá `CRON_SECRET` de `.env.local`');
    expect(texto).toContain('copiá `SETUP_SECRET` de `.env.local`');
  });

  it('sin dominio todavía, deja un marcador y no "undefined"', () => {
    const sin = checklistHostinger({ nombre: '', dominio: '' });
    expect(sin).toContain('https://TU-DOMINIO/setup');
    expect(sin).not.toMatch(/undefined|null/);
  });

  it('el archivo está en .gitignore (viaja con valores de la tienda)', () => {
    const ignore = readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8').split('\n');
    expect(ignore).toContain('HOSTINGER-CHECKLIST.md');
  });

  it('nombreBaseSugerido', () => {
    expect(nombreBaseSugerido('https://Lencería-Guaraní.com.py', '')).toBe('lenceria_guarani');
    expect(nombreBaseSugerido('', 'Mi Tienda Ñandú')).toBe('mi_tienda_nandu');
    expect(nombreBaseSugerido('', '')).toBe('tienda');
  });
});
