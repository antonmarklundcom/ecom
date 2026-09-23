import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SOLO_TEMPLATE } from './template-shared';

/**
 * `pnpm template:probar-tienda` — ¿una tienda recién creada desde este commit
 * sigue en verde?
 *
 * El CI del template corre sobre el template, con el nombre y los defaults del
 * template. Una tienda no: `pnpm nueva-tienda` le cambia el nombre, el tema y
 * el `.env.local`, y borra `fable/`. Un test que sólo pasa mientras el repo se
 * llama como el template (fable/TEMPLATE-REVIEW.md T2) deja a cada tienda
 * nueva con CI en rojo desde el primer commit, y el template no se entera.
 *
 * Esto arma esa tienda en un worktree temporal a partir de HEAD, corre el
 * wizard sin terminal, y después `typecheck` + los tests unitarios. Corre en
 * tu máquina (0 minutos de Actions): va en la lista de antes de publicar una
 * versión (CHANGELOG.md). Los de integración quedan afuera a propósito: no
 * dependen del nombre de la tienda y necesitan MySQL.
 *
 * Sólo mira lo commiteado: commiteá antes de correrlo.
 */

// Armado en runtime y no como literal: `marca-centralizada.test.ts` busca el
// nombre de la tienda en todo `scripts/`, y este archivo viaja con la tienda.
const NOMBRE = ['Probeta', 'Fresca'].join(' ');

const raiz = process.cwd();
const destino = mkdtempSync(join(tmpdir(), 'tienda-fresca-'));

function correr(comando: string, args: string[], cwd: string): void {
  execFileSync(comando, args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    // Vacía a propósito: el `.env.local` que escribe el wizard trae la URL de
    // la base de tests de `.env.example`, y dotenv no pisa lo que ya está en
    // process.env. Así `tests/global-setup.ts` no intenta conectarse.
    env: { ...process.env, TEST_DATABASE_URL: '' },
  });
}

function main(): void {
  console.log(`\n  Armando una tienda nueva desde HEAD en ${destino}\n`);
  execFileSync('git', ['worktree', 'add', '--detach', destino, 'HEAD'], {
    cwd: raiz,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  try {
    symlinkSync(join(raiz, 'node_modules'), join(destino, 'node_modules'), 'junction');

    correr(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/nueva-tienda.ts',
        '--nombre',
        NOMBRE,
        '--titulo',
        `${NOMBRE} — Comprá online en Paraguay`,
        '--descripcion',
        'Una tienda creada por template:probar-tienda.',
        '--tagline',
        'Probando el template',
        '--whatsapp',
        '0971000111',
        '--dominio',
        'prueba.example.py',
        '--tema',
        'calido',
      ],
      destino,
    );

    const quedaron = SOLO_TEMPLATE.map((entrada) => entrada.replace(/\/$/, '')).filter((ruta) =>
      existsSync(join(destino, ruta)),
    );
    if (quedaron.length > 0) {
      throw new Error(`nueva-tienda no borró ${quedaron.join(', ')}`);
    }

    correr('pnpm', ['typecheck'], destino);
    correr('pnpm', ['exec', 'vitest', 'run', 'tests/unit'], destino);

    console.log('\n  ✓ Una tienda nueva desde este commit queda en verde.\n');
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', destino], {
      cwd: raiz,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

try {
  main();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
