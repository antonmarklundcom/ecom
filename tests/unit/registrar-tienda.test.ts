import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  agregarTienda,
  comandosRegistro,
  cuerpoPr,
  pasoManual,
  parsearArgumentos,
  ramaDe,
  registrar,
  type Comando,
} from '../../scripts/registrar-tienda';
import { envSinGit } from '../helpers/git-sin-entorno';

const BASE = JSON.stringify([{ repo: 'antonmarklundcom/lenceria', anillo: 0, estado: 'pausada' }]);

/** `gh` y `git` simulados: se anotan las llamadas, no se ejecuta nada. */
function simulado(tiendas = BASE, estadoGit = '') {
  const llamadas: Comando[] = [];
  const archivos: string[] = [];
  return {
    llamadas,
    archivos,
    io: {
      ejecutar: (c: Comando) => {
        llamadas.push(c);
        if (c.cmd === 'git' && c.args[0] === 'status') return estadoGit;
        if (c.cmd === 'gh') return 'https://github.com/antonmarklundcom/ecom/pull/999\n';
        return '';
      },
      leer: () => tiendas,
      escribir: (c: string) => archivos.push(c),
    },
  };
}

describe('registrar-tienda', () => {
  it('parsea el repo, anillo, estado y dominio; por defecto anillo 1, activa', () => {
    expect(parsearArgumentos(['a/b'])).toMatchObject({ repo: 'a/b', anillo: 1, estado: 'activa', dryRun: false });
    expect(
      parsearArgumentos(['--', 'a/b', '--anillo', '0', '--estado', 'pausada', '--dominio', 'x.com.py', '--dry-run']),
    ).toMatchObject({ repo: 'a/b', anillo: 0, estado: 'pausada', dominio: 'x.com.py', dryRun: true });
  });

  it('rechaza repo mal formado, anillo o estado inválidos, opciones desconocidas', () => {
    expect(() => parsearArgumentos([])).toThrow(/dueño\/nombre/);
    expect(() => parsearArgumentos(['mascota'])).toThrow(/dueño\/nombre/);
    expect(() => parsearArgumentos(['a/b', '--anillo', '2'])).toThrow(/anillo/);
    expect(() => parsearArgumentos(['a/b', '--estado', 'x'])).toThrow(/estado/);
    expect(() => parsearArgumentos(['a/b', '--raro', '1'])).toThrow(/no conozco/);
    expect(() => parsearArgumentos(['a/b', 'c/d'])).toThrow(/una tienda por vez/);
  });

  it('agrega la entrada válida y rechaza un repo repetido (sin distinguir mayúsculas)', () => {
    const nuevo = agregarTienda(BASE, { repo: 'a/nueva', dominio: 'nueva.com.py', anillo: 1, estado: 'activa' });
    const lista = JSON.parse(nuevo) as Record<string, unknown>[];
    expect(lista).toHaveLength(2);
    expect(lista[1]).toEqual({ repo: 'a/nueva', dominio: 'nueva.com.py', anillo: 1, estado: 'activa' });
    expect(nuevo.endsWith('\n')).toBe(true);
    expect(() => agregarTienda(BASE, { repo: 'AntonMarklundCom/Lenceria', anillo: 1, estado: 'activa' })).toThrow(
      /ya está/,
    );
  });

  it('el cuerpo del PR dice anillo, estado y el único paso manual (token)', () => {
    const cuerpo = cuerpoPr({ repo: 'a/nueva', dominio: 'nueva.com.py', anillo: 0, estado: 'pausada' });
    expect(cuerpo).toContain('`a/nueva`');
    expect(cuerpo).toContain('anillo: 0 (canaria)');
    expect(cuerpo).toContain('estado: pausada');
    expect(cuerpo).toContain('nueva.com.py');
    expect(cuerpo).toContain(pasoManual('a/nueva'));
    expect(pasoManual('a/nueva')).toMatch(/TIENDAS_TOKEN/);
  });

  it('los comandos: rama, add, commit, push y gh pr create contra main', () => {
    const c = comandosRegistro({ repo: 'A/Nueva', anillo: 1, estado: 'activa' });
    expect(ramaDe('A/Nueva')).toBe('registrar-tienda/a-nueva');
    expect(c.map((x) => `${x.cmd} ${x.args[0]}`)).toEqual(['git switch', 'git add', 'git commit', 'git push', 'gh pr']);
    expect(c[4]?.args).toEqual(
      expect.arrayContaining(['--base', 'main', '--head', 'registrar-tienda/a-nueva', '--title', 'Registrar tienda A/Nueva']),
    );
    expect(c[4]?.args.join(' ')).not.toMatch(/--(draft|web)/);
  });

  it('corre en orden, escribe tiendas.json después de la rama, y devuelve la URL del PR', () => {
    const x = simulado();
    const salida = registrar({ repo: 'a/nueva', anillo: 1, estado: 'activa', dryRun: false }, x.io);
    expect(x.llamadas.map((c) => `${c.cmd} ${c.args[0]}`)).toEqual([
      'git status',
      'git switch',
      'git add',
      'git commit',
      'git push',
      'gh pr',
    ]);
    expect(x.archivos).toHaveLength(1);
    expect(JSON.parse(x.archivos[0] as string)).toHaveLength(2);
    expect(salida.join('\n')).toContain('pull/999');
    expect(salida.join('\n')).toContain('TIENDAS_TOKEN');
  });

  it('--dry-run no ejecuta ni escribe nada, pero imprime los comandos y el paso manual', () => {
    const x = simulado();
    const salida = registrar({ repo: 'a/nueva', anillo: 1, estado: 'activa', dryRun: true }, x.io).join('\n');
    expect(x.llamadas).toEqual([]);
    expect(x.archivos).toEqual([]);
    expect(salida).toContain('git push -u origin registrar-tienda/a-nueva');
    expect(salida).toContain('TIENDAS_TOKEN');
  });

  it('con cambios sin commitear en el template, se niega antes de tocar nada', () => {
    const x = simulado(BASE, ' M src/x.ts\n');
    expect(() => registrar({ repo: 'a/nueva', anillo: 1, estado: 'activa', dryRun: false }, x.io)).toThrow(
      /sin commitear/,
    );
    expect(x.llamadas.map((c) => c.args[0])).toEqual(['status']);
    expect(x.archivos).toEqual([]);
  });

  // `tiendas.json` es del template: una tienda lo borra (probar-tienda-nueva).
  it.skipIf(!existsSync('tiendas.json'))('CLI --dry-run de verdad: tiendas.json queda igual', () => {
    const antes = readFileSync('tiendas.json', 'utf8');
    const r = spawnSync('pnpm', ['exec', 'tsx', 'scripts/registrar-tienda.ts', 'a/prueba-s29', '--dry-run'], {
      encoding: 'utf8',
      env: envSinGit(),
      shell: process.platform === 'win32',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--dry-run');
    expect(readFileSync('tiendas.json', 'utf8')).toBe(antes);
  }, 60_000);
});
