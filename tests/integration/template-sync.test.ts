import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { gitEn, parseBaseline } from '../../scripts/template-shared';
import { ejecutarSync } from '../../scripts/template-sync';

/**
 * `pnpm template:sync` contra git de verdad (fable/plan.md §9).
 *
 * Arma dos repos temporales sin historia compartida —igual que un template y
 * una tienda hecha con "Use this template"— y hace commits de maquinaria y de
 * piel en el template. El escenario cubre los tres casos del problema
 * original (fable/plan.md §9 / la tarea): sólo la maquinaria se trae, el
 * conflicto de `fable/` se resuelve solo, y un conflicto de verdad en `src/`
 * frena todo sin tocar el baseline.
 */

const temporales: string[] = [];

function repoTemporal(prefijo: string): string {
  const ruta = mkdtempSync(join(tmpdir(), `${prefijo}-`));
  temporales.push(ruta);
  return ruta;
}

afterEach(() => {
  while (temporales.length > 0) {
    rmSync(temporales.pop() as string, { recursive: true, force: true });
  }
});

function escribir(repo: string, ruta: string, contenido: string): void {
  const completa = join(repo, ...ruta.split('/'));
  mkdirSync(dirname(completa), { recursive: true });
  writeFileSync(completa, contenido);
}

function commit(repo: string, mensaje: string): string {
  gitEn(repo, ['add', '-A']);
  gitEn(repo, ['-c', 'core.editor=true', 'commit', '-m', mensaje]);
  return gitEn(repo, ['rev-parse', 'HEAD']).trim();
}

function identidadGit(repo: string): void {
  gitEn(repo, ['init']);
  gitEn(repo, ['config', 'user.email', 'test@example.com']);
  gitEn(repo, ['config', 'user.name', 'Test']);
  gitEn(repo, ['config', 'commit.gpgsign', 'false']);
}

/**
 * Arma el template y la tienda del escenario, ya con `.template-baseline`
 * marcado en el commit inicial y la rama de la tienda lista para sincronizar.
 * Devuelve los SHA de cada commit del template para que los tests los usen.
 */
function armarEscenario() {
  const template = repoTemporal('template-sync-template');
  identidadGit(template);

  // Tres líneas con un "medio" que nunca cambia: le da a los merges de 3 vías
  // el contexto que necesitan para separar la edición de la tienda (línea 1)
  // de la de C1 (línea 3) y fusionarlas solas, y a la vez le deja a C4 una
  // línea 1 real para chocar con la customización de la tienda.
  escribir(template, 'src/domain/stock.ts', 'inicio\nmedio\nfin\n');
  escribir(template, 'fable/plan.md', 'plan v1\n');
  escribir(template, 'README.md', 'template readme v1\n');
  const c0 = commit(template, 'C0 inicial');
  gitEn(template, ['branch', '-M', 'main']);

  // C1 — maquinaria, toca sólo la línea 3: se aplica limpio aunque la tienda
  // ya haya customizado la línea 1 (están separadas por "medio").
  escribir(template, 'src/domain/stock.ts', 'inicio\nmedio\nfin-c1\n');
  const c1 = commit(template, 'C1 maquinaria: stock cambia línea 3');

  // C2 — piel (README no es maquinaria ni mixto): nunca se intenta.
  escribir(template, 'README.md', 'template readme v2\n');
  const c2 = commit(template, 'C2 piel: readme');

  // C3 — maquinaria (toca scripts/) que además choca en fable/, que la
  // tienda nunca tuvo. Se resuelve solo: se descarta fable/ del lado del
  // template y se aplica el resto.
  escribir(template, 'fable/plan.md', 'plan v2\n');
  escribir(template, 'scripts/helper.ts', 'export const helper = 1;\n');
  const c3 = commit(template, 'C3 maquinaria + fable/: agrega helper');

  // C4 — maquinaria, pero cambia la línea 1 — la misma que la tienda ya
  // customizó por su cuenta: conflicto de verdad, no auto-resoluble.
  escribir(template, 'src/domain/stock.ts', 'inicio-template\nmedio\nfin-c1\n');
  const c4 = commit(template, 'C4 maquinaria: stock cambia línea 1');

  const tienda = repoTemporal('template-sync-tienda');
  identidadGit(tienda);
  escribir(tienda, 'src/domain/stock.ts', 'inicio\nmedio\nfin\n');
  escribir(tienda, 'README.md', 'tienda readme\n');
  commit(tienda, 'C0 tienda');
  gitEn(tienda, ['checkout', '-b', 'phase/sync-test']);

  gitEn(tienda, ['remote', 'add', 'template', template]);
  gitEn(tienda, ['fetch', 'template', 'main']);
  writeFileSync(
    join(tienda, '.template-baseline'),
    '# baseline de prueba\n' + `${c0}\n`,
  );
  commit(tienda, 'Marcar baseline de template:sync');

  // La tienda ya customizó la línea 1 antes de sincronizar nada — es lo que
  // hace que C4 choque de verdad más adelante.
  escribir(tienda, 'src/domain/stock.ts', 'inicio-tienda\nmedio\nfin\n');
  commit(tienda, 'Customización propia de la tienda');

  return { template, tienda, c0, c1, c2, c3, c4 };
}

describe('template:sync contra git de verdad', () => {
  it('trae sólo la maquinaria, resuelve fable/ solo, y para en un conflicto real de src/', () => {
    const { tienda, c1, c2, c4 } = armarEscenario();

    const resultado = ejecutarSync(tienda, {
      remoto: 'template',
      rama: 'main',
      dryRun: false,
      hasta: null,
      sinTests: true,
    });

    expect(resultado.estado).toBe('conflicto-manual');
    if (resultado.estado !== 'conflicto-manual') throw new Error('no debería pasar');
    expect(resultado.sha).toBe(c4);
    expect(resultado.archivos).toEqual(['src/domain/stock.ts']);

    // C1 y C3 quedaron aplicados como commits propios de la tienda, con el
    // trailer que deja `cherry-pick -x` apuntando al SHA original del template.
    const asuntos = gitEn(tienda, ['log', '--format=%s']);
    const trailers = gitEn(tienda, ['log', '--format=%B']);
    expect(trailers).toContain(c1);
    expect(asuntos).toContain('C3 maquinaria + fable/: agrega helper');

    // El helper de C3 está; fable/plan.md, que la tienda nunca tuvo, no.
    expect(readFileSync(join(tienda, 'scripts/helper.ts'), 'utf8')).toBe('export const helper = 1;\n');
    expect(() => readFileSync(join(tienda, 'fable/plan.md'), 'utf8')).toThrow();

    // C2 es piel: nunca se intentó, el readme sigue siendo el de la tienda.
    expect(readFileSync(join(tienda, 'README.md'), 'utf8')).toBe('tienda readme\n');
    expect(trailers).not.toContain(c2);
    expect(asuntos).not.toContain('C2 piel: readme');

    // El conflicto de C4 sigue abierto: el baseline no se tocó.
    const baseline = parseBaseline(readFileSync(join(tienda, '.template-baseline'), 'utf8'));
    expect(asuntos).not.toContain('Sincronizar maquinaria del template');
    expect(baseline).not.toBe(c4);

    const conflicto = gitEn(tienda, ['diff', '--name-only', '--diff-filter=U']).trim();
    expect(conflicto).toBe('src/domain/stock.ts');
  });

  it('con el cherry-pick a medio resolver, avisa que hay que terminarlo a mano', () => {
    const { tienda } = armarEscenario();

    ejecutarSync(tienda, { remoto: 'template', rama: 'main', dryRun: false, hasta: null, sinTests: true });

    const segundaCorrida = ejecutarSync(tienda, {
      remoto: 'template',
      rama: 'main',
      dryRun: false,
      hasta: null,
      sinTests: true,
    });

    expect(segundaCorrida.estado).toBe('precondicion');
    if (segundaCorrida.estado !== 'precondicion') throw new Error('no debería pasar');
    expect(segundaCorrida.mensaje).toContain('cherry-pick --continue');
  });

  it('resuelto el conflicto a mano, la corrida siguiente no repite lo ya aplicado', () => {
    const { tienda, c4 } = armarEscenario();

    ejecutarSync(tienda, { remoto: 'template', rama: 'main', dryRun: false, hasta: null, sinTests: true });

    // Simula lo que pide el mensaje: resolver a mano y `--continue`.
    escribir(tienda, 'src/domain/stock.ts', 'inicio-resuelto\nmedio\nfin-c1\n');
    gitEn(tienda, ['add', '--', 'src/domain/stock.ts']);
    gitEn(tienda, ['-c', 'core.editor=true', 'cherry-pick', '--continue']);

    const resultado = ejecutarSync(tienda, {
      remoto: 'template',
      rama: 'main',
      dryRun: false,
      hasta: null,
      sinTests: true,
    });

    // Ya no queda ningún commit de maquinaria pendiente: C1, C3 y C4 (recién
    // continuado) tienen su trailer en el log.
    expect(resultado.estado).toBe('sin-cambios');
    const log = gitEn(tienda, ['log', '--format=%B']);
    expect(log).toContain(c4);
  });
});
