import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { META_PERFORMANCE, resumenLighthouse } from '../../scripts/ci/resumen-lighthouse.mjs';
import { SOLO_TEMPLATE } from '../../scripts/template-shared';

/**
 * Minutos de Actions (NEW-STORE.md § "CI y minutos de Actions"): en un repo
 * privado cada job se cobra redondeado al minuto, y `ci.yml` viaja a todas
 * las tiendas. Estos tests cuidan la forma de los workflows —qué job corre en
 * qué evento— para que un cambio inocente en un `if:` no prenda el e2e en
 * cada PR de diez tiendas.
 */

const raiz = process.cwd();
const dirWorkflows = join(raiz, '.github/workflows');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

/** El bloque de un job (desde `  nombre:` hasta el próximo job o el final). */
function bloqueDeJob(yaml: string, job: string): string {
  const inicio = yaml.indexOf(`\n  ${job}:\n`);
  if (inicio === -1) throw new Error(`no encontré el job ${job}`);
  const resto = yaml.slice(inicio + 1);
  const siguiente = resto.slice(1).search(/\n {2}[a-z0-9_-]+:\n/);
  return siguiente === -1 ? resto : resto.slice(0, siguiente + 1);
}

/** El `if:` de un job, como bloque `>-` o en una línea. */
function ifDeJob(yaml: string, job: string): string {
  const bloque = bloqueDeJob(yaml, job);
  const multilinea = /\n {4}if: >-\n((?: {6,}.*\n)+)/.exec(bloque);
  if (multilinea?.[1]) return multilinea[1].replace(/\s+/g, ' ').trim();
  const linea = /\n {4}if: (.+)\n/.exec(bloque);
  if (!linea?.[1]) throw new Error(`el job ${job} no tiene if:`);
  return linea[1].trim();
}

type Escenario = {
  evento: 'pull_request' | 'push' | 'workflow_dispatch';
  privado: boolean;
  accion?: string;
  label?: string;
  labels?: string[];
  rama?: string;
  cancelado?: boolean;
};

type Resultado = 'success' | 'failure' | 'skipped';

/**
 * Evalúa una expresión de `if:` de GitHub Actions traducida a JS. Alcanza
 * para el subconjunto que usa `ci.yml`: `github.*`, `needs.*.result`,
 * `contains`, `startsWith`, `cancelled()`, `==`, `!=`, `&&`, `||`, `!`.
 */
function evaluar(expresion: string, e: Escenario, needs: Record<string, { result: Resultado }>): boolean {
  const js = expresion
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/github\.event\.pull_request\.labels\.\*\.name/g, 'etiquetas')
    .replace(/!=/g, '!==')
    .replace(/([^!=])==/g, '$1===');
  const github = {
    event_name: e.evento,
    head_ref: e.evento === 'pull_request' ? (e.rama ?? 'feature/x') : '',
    event: {
      action: e.accion ?? (e.evento === 'pull_request' ? 'opened' : undefined),
      label: { name: e.label ?? '' },
      repository: { private: e.privado },
    },
  };
  const fn = new Function(
    'github',
    'needs',
    'etiquetas',
    'cancelled',
    'contains',
    'startsWith',
    `return (${js});`,
  ) as (...args: unknown[]) => unknown;
  return Boolean(
    fn(
      github,
      needs,
      e.labels ?? [],
      () => e.cancelado ?? false,
      (lista: string[], item: string) => lista.includes(item),
      (texto: string, prefijo: string) => texto.startsWith(prefijo),
    ),
  );
}

describe('ci.yml: qué corre en cada evento', () => {
  const ci = leer('.github/workflows/ci.yml');
  const siChecks = ifDeJob(ci, 'checks');
  const siE2e = ifDeJob(ci, 'e2e');
  const siLighthouse = ifDeJob(ci, 'lighthouse');

  /** Lo que correría, encadenando `needs` como GitHub: un job salteado da `skipped`. */
  function corrida(e: Escenario, checksFalla = false) {
    const checks: Resultado = evaluar(siChecks, e, {}) ? (checksFalla ? 'failure' : 'success') : 'skipped';
    const e2e: Resultado = evaluar(siE2e, e, { checks: { result: checks } }) ? 'success' : 'skipped';
    const lighthouse: Resultado = evaluar(siLighthouse, e, { e2e: { result: e2e } }) ? 'success' : 'skipped';
    return { checks: checks !== 'skipped', e2e: e2e !== 'skipped', lighthouse: lighthouse !== 'skipped' };
  }

  it('un PR, privado o público, corre sólo checks', () => {
    for (const privado of [true, false]) {
      expect(corrida({ evento: 'pull_request', privado }), `privado=${privado}`).toEqual({
        checks: true,
        e2e: false,
        lighthouse: false,
      });
      expect(corrida({ evento: 'pull_request', privado, accion: 'synchronize' })).toEqual({
        checks: true,
        e2e: false,
        lighthouse: false,
      });
    }
  });

  it('un label que no es ci-completo no corre nada (Renovate etiqueta al abrir)', () => {
    expect(
      corrida({ evento: 'pull_request', privado: true, accion: 'labeled', label: 'dependencias', labels: ['dependencias'] }),
    ).toEqual({ checks: false, e2e: false, lighthouse: false });
  });

  it('con el label ci-completo, el PR suma el e2e (pero no lighthouse)', () => {
    const e: Escenario = { evento: 'pull_request', privado: true, accion: 'labeled', label: 'ci-completo', labels: ['ci-completo'] };
    expect(corrida(e)).toEqual({ checks: true, e2e: true, lighthouse: false });
    expect(corrida({ ...e, accion: 'synchronize', label: undefined })).toEqual({ checks: true, e2e: true, lighthouse: false });
  });

  it('el PR de distribución (template/sync) corre el e2e: así cada tienda prueba la maquinaria nueva', () => {
    expect(corrida({ evento: 'pull_request', privado: true, rama: 'template/sync' })).toEqual({
      checks: true,
      e2e: true,
      lighthouse: false,
    });
  });

  it('el e2e no arranca si checks falló', () => {
    expect(corrida({ evento: 'pull_request', privado: true, rama: 'template/sync' }, true).e2e).toBe(false);
    expect(corrida({ evento: 'push', privado: false }, true)).toEqual({ checks: true, e2e: false, lighthouse: false });
  });

  it('después de mergear (push a main) corren e2e y lighthouse; checks sólo si el repo es público', () => {
    expect(corrida({ evento: 'push', privado: true })).toEqual({ checks: false, e2e: true, lighthouse: true });
    expect(corrida({ evento: 'push', privado: false })).toEqual({ checks: true, e2e: true, lighthouse: true });
  });

  it('a mano corren los tres', () => {
    for (const privado of [true, false]) {
      expect(corrida({ evento: 'workflow_dispatch', privado })).toEqual({ checks: true, e2e: true, lighthouse: true });
    }
  });

  it('una corrida cancelada por concurrency no arranca el e2e ni lighthouse', () => {
    expect(corrida({ evento: 'push', privado: true, cancelado: true })).toEqual({
      checks: false,
      e2e: false,
      lighthouse: false,
    });
  });

  it('ningún job con always(): una corrida cancelada no tiene que arrancar otro runner', () => {
    for (const si of [siChecks, siE2e, siLighthouse]) expect(si).not.toMatch(/always\(\)/);
  });

  it('lighthouse no bloquea y deja el puntaje en el resumen de la corrida', () => {
    const bloque = bloqueDeJob(ci, 'lighthouse');
    expect(bloque).toMatch(/\n {4}continue-on-error: true\n/);
    expect(bloque).toContain('scripts/ci/resumen-lighthouse.mjs >> "$GITHUB_STEP_SUMMARY"');
    expect(bloque).toContain('configPath: ./.lighthouserc.json');
  });

  it('un cambio de sólo docs no corre nada, y una corrida nueva cancela la anterior', () => {
    expect(ci.match(/paths-ignore:\n\s+- "\*\*\.md"/g)).toHaveLength(2);
    expect(ci).toMatch(/\nconcurrency:\n(?: {2}.*\n)*? {2}cancel-in-progress: true\n/);
  });
});

describe('todos los workflows', () => {
  const archivos = readdirSync(dirWorkflows).filter((f) => /\.ya?ml$/.test(f));

  it.each(archivos)('%s: cada job en ubuntu-latest y con timeout-minutes', (archivo) => {
    const yaml = readFileSync(join(dirWorkflows, archivo), 'utf8');
    const runsOn = yaml.match(/\n {4}runs-on: .+/g) ?? [];
    const timeouts = yaml.match(/\n {4}timeout-minutes: \d+/g) ?? [];
    expect(runsOn.length).toBeGreaterThan(0);
    for (const linea of runsOn) expect(linea.trim()).toBe('runs-on: ubuntu-latest');
    // Sin esto un paso colgado se come 360 minutos (el default de GitHub).
    expect(timeouts).toHaveLength(runsOn.length);
  });
});

describe('Renovate', () => {
  const ruta = '.github/renovate.json';

  it('es sólo del template (SOLO_TEMPLATE), como lo era Dependabot', () => {
    expect(SOLO_TEMPLATE).toContain(ruta);
    expect(SOLO_TEMPLATE).toContain('.github/dependabot.yml');
  });

  // En una tienda no existe: las dependencias le llegan con template/sync.
  it.runIf(existsSync(join(raiz, ruta)))('la config del template respeta los pines y no duplica a Dependabot', () => {
    type Regla = { matchPackageNames?: string[]; allowedVersions?: string };
    const config = JSON.parse(leer(ruta)) as {
      timezone: string;
      schedule: string[];
      vulnerabilityAlerts: { enabled: boolean; schedule: string[] };
      lockFileMaintenance: { enabled: boolean };
      packageRules: Regla[];
    };
    const tope = (paquete: string) =>
      config.packageRules.find((r) => r.matchPackageNames?.includes(paquete) && r.allowedVersions)?.allowedVersions;

    expect(config.timezone).toBe('America/Asuncion');
    expect(config.schedule.length).toBeGreaterThan(0);
    // La seguridad no espera la ventana semanal.
    expect(config.vulnerabilityAlerts).toMatchObject({ enabled: true, schedule: [] });
    expect(config.lockFileMaintenance.enabled).toBe(true);

    // KNOWN-ISSUES.md: eslint 10 y typescript 7 todavía no andan con el lint.
    expect(tope('eslint')).toBe('<10');
    expect(tope('typescript')).toBe('<7');
    // @types/node sigue la mayor del runtime (.nvmrc).
    const node = Number.parseInt(leer('.nvmrc').trim(), 10);
    expect(tope('@types/node')).toBe(`<${node + 1}`);

    // Dependabot y Renovate a la vez abrirían dos PRs por cada versión.
    expect(existsSync(join(raiz, '.github/dependabot.yml'))).toBe(false);
  });
});

describe('resumenLighthouse', () => {
  it('pasa el puntaje de performance a 0–100 y lo compara con la meta', () => {
    const manifest = JSON.stringify([
      { url: 'http://127.0.0.1:3000/', isRepresentativeRun: true, summary: { performance: 0.934 } },
      { url: 'http://127.0.0.1:3000/checkout', isRepresentativeRun: true, summary: { performance: 0.71 } },
    ]);
    const md = resumenLighthouse(manifest);
    expect(META_PERFORMANCE).toBe(90);
    expect(md).toContain(`meta ≥ ${META_PERFORMANCE}`);
    expect(md).toContain('| `/` | 93 | ✅ |');
    expect(md).toContain('| `/checkout` | 71 | ⚠️ debajo de la meta |');
  });

  it('con varias corridas por URL usa la representativa', () => {
    const manifest = JSON.stringify([
      { url: 'http://127.0.0.1:3000/', isRepresentativeRun: false, summary: { performance: 0.5 } },
      { url: 'http://127.0.0.1:3000/', isRepresentativeRun: true, summary: { performance: 0.9 } },
    ]);
    const md = resumenLighthouse(manifest);
    expect(md).toContain('| `/` | 90 | ✅ |');
    expect(md).not.toContain('| 50 |');
  });

  it('sin manifest (la action falló) lo dice, sin tirar', () => {
    for (const crudo of [undefined, '', 'no-es-json', '{}']) {
      expect(resumenLighthouse(crudo)).toContain('Lighthouse no dejó resultados');
    }
    expect(resumenLighthouse(JSON.stringify([{ url: 'http://x/', summary: {} }]))).toContain('| `/` | — | — sin puntaje |');
  });
});
