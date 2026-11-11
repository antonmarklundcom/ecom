import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARCA_PLACEHOLDER, TIENDA } from '../../src/config/tienda';
import { archivosDeTemas } from '../../scripts/temas-css';
import { TEMA_BASE } from '../../src/themes/base';
import { resolverTema, TEMA_POR_DEFECTO, TEMAS } from '../../src/themes/presets';
import {
  COLORES,
  SEMANTICOS,
  SECCIONES_HOME,
  TAMANOS_TEXTO,
  VARIANTES_FOOTER,
  VARIANTES_HEADER,
} from '../../src/themes/tipos';
import { esPielDelTemplate, pielDelTemplate } from '../helpers/piel';

/**
 * Kit de piel (plan-crecimiento §6.2) — los archivos de `src/styles/temas/`,
 * el formato de antes del kit de temas (`src/themes/`), que sigue andando
 * para un `globals.css` viejo. Todos los temas tienen que definir
 * exactamente el mismo conjunto de variables CSS en `:root` y en `.dark`.
 * Una variable que le falte a un tema no rompe el build —Tailwind no avisa
 * de una custom property que no existe— pero deja un botón o un texto
 * invisible en esa combinación de tema/modo. Esto lo lee de los `.css`
 * reales, no de memoria: es la única forma de que el test detecte un tema
 * nuevo que se escribió incompleto.
 *
 * Los temas son **todos los `.css` de `src/styles/temas/`**, no la lista
 * `TEMAS` del wizard: una tienda con su propio tema (NEW-STORE.md §5) no
 * tiene que tocar `scripts/nueva-tienda.ts`, que es maquinaria y chocaría en
 * el próximo `template:sync`. `TEMAS` sólo tiene que existir en disco.
 */

const DIR_TEMAS = path.join('src', 'styles', 'temas');
const TEMAS_EN_DISCO = readdirSync(DIR_TEMAS)
  .filter((archivo) => archivo.endsWith('.css'))
  .map((archivo) => archivo.replace(/\.css$/, ''))
  // neutro primero: es la referencia contra la que se comparan los demás.
  .sort((a, b) => (a === 'neutro' ? -1 : b === 'neutro' ? 1 : a.localeCompare(b)));

function leerTema(nombre: string): string {
  return readFileSync(path.join(DIR_TEMAS, `${nombre}.css`), 'utf8');
}

/** El bloque `selector { … }` de nivel superior, o null si no está. */
function bloque(source: string, selector: string): string | null {
  const inicio = source.indexOf(`${selector} {`);
  if (inicio === -1) return null;
  const abre = source.indexOf('{', inicio);
  let nivel = 0;
  for (let i = abre; i < source.length; i += 1) {
    if (source[i] === '{') nivel += 1;
    else if (source[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return source.slice(abre, i + 1);
    }
  }
  return null;
}

/** `--nombre:` → `nombre`, en el orden en que aparecen. */
function variables(bloqueCss: string): string[] {
  return [...bloqueCss.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1] ?? '');
}

describe('kit de piel: paridad de variables entre temas', () => {
  const porTema = Object.fromEntries(TEMAS_EN_DISCO.map((tema) => [tema, leerTema(tema)]));

  it('los presets con archivo legado lo tienen en disco', () => {
    for (const tema of Object.values(TEMAS)) {
      if (!tema.legado) continue;
      expect(TEMAS_EN_DISCO, `falta src/styles/temas/${tema.legado}.css`).toContain(tema.legado);
    }
  });

  it('todos los archivos existen y no están vacíos', () => {
    for (const tema of TEMAS_EN_DISCO) {
      expect(porTema[tema]?.length ?? 0, `${tema}.css está vacío`).toBeGreaterThan(0);
    }
  });

  it('cada tema define un bloque :root y un bloque .dark', () => {
    for (const tema of TEMAS_EN_DISCO) {
      expect(bloque(porTema[tema] ?? '', ':root'), `${tema}.css sin :root`).not.toBeNull();
      expect(bloque(porTema[tema] ?? '', '.dark'), `${tema}.css sin .dark`).not.toBeNull();
    }
  });

  it('todos los :root definen exactamente el mismo conjunto de variables', () => {
    const [primero = 'neutro', ...resto] = TEMAS_EN_DISCO;
    const base = new Set(variables(bloque(porTema[primero] ?? '', ':root') ?? ''));
    expect(base.size, 'neutro.css:root no tiene variables').toBeGreaterThan(0);

    for (const tema of resto) {
      const propias = new Set(variables(bloque(porTema[tema] ?? '', ':root') ?? ''));
      expect(propias, `:root de ${tema}.css difiere de neutro.css`).toEqual(base);
    }
  });

  it('todos los .dark definen exactamente el mismo conjunto de variables', () => {
    const [primero = 'neutro', ...resto] = TEMAS_EN_DISCO;
    const base = new Set(variables(bloque(porTema[primero] ?? '', '.dark') ?? ''));
    expect(base.size, 'neutro.css .dark no tiene variables').toBeGreaterThan(0);

    for (const tema of resto) {
      const propias = new Set(variables(bloque(porTema[tema] ?? '', '.dark') ?? ''));
      expect(propias, `.dark de ${tema}.css difiere de neutro.css`).toEqual(base);
    }
  });

  it('cada tema documenta para quién es, las fuentes y las líneas de layout.tsx', () => {
    for (const tema of TEMAS_EN_DISCO) {
      const source = porTema[tema] ?? '';
      const cabecera = source.slice(0, source.indexOf('*/') + 2);
      expect(cabecera, `${tema}.css sin "Para quién"`).toMatch(/Para qui[ée]n/i);
      expect(cabecera, `${tema}.css sin fuentes sugeridas`).toMatch(/[Ff]uentes sugeridas/);
      expect(cabecera, `${tema}.css sin mención a layout.tsx`).toMatch(/layout\.tsx/);
    }
  });

  // Test de piel (TESTS_DE_PIEL): una tienda de antes del kit retocó su tema acá,
  // como decía NEW-STORE.md §5 (O23: Sur). Ese archivo es suyo.
  it.runIf(pielDelTemplate('src/styles/temas/neutro.css'))('neutro.css es exactamente lo que había en globals.css antes de esta fase', () => {
    // Los valores de hoy, movidos byte a byte (plan §6.2.A): si alguno de
    // estos dos números cambia, alguien "retocó" el tema por accidente y
    // las capturas de CI van a salir distintas de las de antes de esta fase.
    expect(porTema.neutro).toContain('--radius: 0.625rem;');
    expect(porTema.neutro).toContain('--background: oklch(1 0 0);');
    expect(porTema.neutro).toContain('--primary: oklch(0.205 0 0);');
    const dark = bloque(porTema.neutro ?? '', '.dark') ?? '';
    expect(dark).toContain('--background: oklch(0.145 0 0);');
    expect(dark).toContain('--primary: oklch(0.922 0 0);');
  });

  it('globals.css importa el kit (o un tema real del formato viejo) y no define :root/.dark', () => {
    const globals = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8');
    expect(globals).not.toMatch(/^:root\s*\{/m);
    expect(globals).not.toMatch(/^\.dark\s*\{/m);
    if (/@import\s+"\.\.\/themes\/temas\.css";/.test(globals)) return;
    const match = /@import\s+"\.\.\/styles\/temas\/([a-z0-9-]+)\.css";/.exec(globals);
    expect(match, 'globals.css no importa ni el kit ni un tema').not.toBeNull();
    expect(TEMAS_EN_DISCO).toContain(match?.[1]);
  });
});

/**
 * El kit de temas (`src/themes/`): los temas son datos y el CSS sale de
 * ellos. Lo que se cuida es que un tema nuevo o retocado no deje un color
 * sin definir, una variante que no existe o un CSS viejo commiteado.
 */
describe('kit de temas: los presets', () => {
  const presets = Object.entries(TEMAS);

  it('cada preset se llama como su clave, en kebab-case', () => {
    for (const [clave, tema] of presets) {
      expect(tema.id, clave).toBe(clave);
      expect(tema.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(tema.nombre.trim(), clave).not.toBe('');
      expect(tema.paraQuien.trim(), clave).not.toBe('');
      expect(tema.fuentes.trim(), clave).not.toBe('');
    }
  });

  it('cada preset define todos los colores, en claro y en oscuro, y nada inventado', () => {
    const conocidos = new Set<string>([...COLORES, ...SEMANTICOS]);
    for (const [clave, tema] of presets) {
      for (const modo of ['claro', 'oscuro'] as const) {
        const paleta = tema.tokens[modo] as Record<string, string | undefined>;
        for (const color of COLORES) {
          expect(paleta[color]?.trim() ?? '', `${clave}.${modo}.${color}`).not.toBe('');
        }
        for (const nombre of Object.keys(paleta)) {
          expect(conocidos.has(nombre), `${clave}.${modo}: "${nombre}" no es un token`).toBe(true);
        }
      }
      expect(tema.tokens.radio, clave).toMatch(/^\d*\.?\d+(rem|px)$/);
    }
  });

  it('variantes de header y pie, secciones de la home y escala son de las que existen', () => {
    for (const [clave, tema] of presets) {
      expect(VARIANTES_HEADER, clave).toContain(tema.header);
      expect(VARIANTES_FOOTER, clave).toContain(tema.footer);
      expect(new Set(tema.home).size, `${clave}: sección repetida en home`).toBe(tema.home.length);
      for (const seccion of tema.home) expect(SECCIONES_HOME, clave).toContain(seccion);
      for (const tamano of Object.keys(tema.tokens.escala?.texto ?? {})) {
        expect(TAMANOS_TEXTO as readonly string[], clave).toContain(tamano);
      }
    }
  });

  it('clasico es el base y el default, y es la tienda de antes del kit', () => {
    expect(TEMA_POR_DEFECTO).toBe('clasico');
    expect(TEMAS.clasico).toBe(TEMA_BASE);
    expect(TEMA_BASE.header).toBe('clasico');
    expect(TEMA_BASE.footer).toBe('columnas');
    expect(TEMA_BASE.home).toEqual(['hero', 'categorias', 'destacados']);
    // Sin escala: header, pie y home miden lo de Tailwind de siempre.
    expect(TEMA_BASE.tokens.escala).toBeUndefined();
    // Los valores de neutro.css, byte a byte (ver el test de arriba).
    expect(TEMA_BASE.tokens.radio).toBe('0.625rem');
    expect(TEMA_BASE.tokens.claro.background).toBe('oklch(1 0 0)');
    expect(TEMA_BASE.tokens.claro.primary).toBe('oklch(0.205 0 0)');
    expect(TEMA_BASE.tokens.oscuro.background).toBe('oklch(0.145 0 0)');
    expect(TEMA_BASE.tokens.oscuro.primary).toBe('oklch(0.922 0 0)');
    expect(TEMA_BASE.legado).toBe('neutro');
  });

  it('vitrina se distingue del base en todo lo que el kit permite', () => {
    const { vitrina } = TEMAS;
    expect(vitrina.tokens.claro.primary).not.toBe(TEMA_BASE.tokens.claro.primary);
    expect(vitrina.tokens.radio).not.toBe(TEMA_BASE.tokens.radio);
    expect(vitrina.tokens.escala?.espaciado).toBeDefined();
    expect(vitrina.tokens.escala?.texto).toBeDefined();
    expect(vitrina.header).not.toBe(TEMA_BASE.header);
    expect(vitrina.footer).not.toBe(TEMA_BASE.footer);
    expect(vitrina.home).not.toEqual(TEMA_BASE.home);
  });

  it('resolverTema: sin campo o con un nombre que no existe, el default; neutro es clasico', () => {
    expect(resolverTema(undefined)).toBe(TEMA_BASE);
    expect(resolverTema('neutro')).toBe(TEMA_BASE);
    expect(resolverTema('no-existe')).toBe(TEMA_BASE);
    expect(resolverTema(42)).toBe(TEMA_BASE);
    expect(resolverTema('vitrina')).toBe(TEMAS.vitrina);
  });

  it('el tema de tienda.ts existe (o el campo no está, en un tienda.ts de antes del kit)', () => {
    const pedido = (TIENDA as { tema?: unknown }).tema;
    if (pedido === undefined) return;
    expect(Object.keys(TEMAS)).toContain(pedido);
  });
});

describe('kit de temas: el CSS', () => {
  const leer = (archivo: string): string | null =>
    existsSync(archivo) ? readFileSync(archivo, 'utf8') : null;

  it('temas.css y los archivos legados están al día con los presets (pnpm temas:css)', () => {
    // Un archivo que la tienda retocó (piel, TESTS_DE_PIEL) no se regenera: es suyo.
    for (const { archivo, contenido } of archivosDeTemas(leer)) {
      if (!esPielDelTemplate(archivo.split(path.sep).join('/'))) continue;
      expect(leer(archivo), `${archivo} desactualizado: corré \`pnpm temas:css\``).toBe(contenido);
    }
  });

  it('temas.css trae el base sin condición y cada otro tema bajo su data-tema', () => {
    const css = readFileSync(path.join('src', 'themes', 'temas.css'), 'utf8');
    expect(bloque(css, ':root'), 'falta el :root del base').not.toBeNull();
    expect(bloque(css, '.dark'), 'falta el .dark del base').not.toBeNull();
    for (const tema of Object.values(TEMAS)) {
      if (tema.id === TEMA_BASE.id) continue;
      expect(css).toContain(`:root:where([data-tema="${tema.id}"]) {`);
    }
  });

  it('los colores semánticos tienen su default en semanticos.css', () => {
    const css = readFileSync(path.join('src', 'themes', 'semanticos.css'), 'utf8');
    const raiz = bloque(css, ':where(:root)') ?? '';
    for (const nombre of SEMANTICOS) expect(raiz, nombre).toContain(`--${nombre}:`);
  });

  it('custom.css existe y globals.css lo importa último', () => {
    expect(existsSync(path.join('src', 'themes', 'custom.css'))).toBe(true);
    const globals = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8');
    if (!/@import\s+"\.\.\/themes\/temas\.css";/.test(globals)) return; // globals.css viejo
    const sinComentarios = globals.replace(/\/\*[\s\S]*?\*\//g, '').trimEnd();
    expect(sinComentarios.endsWith('@import "../themes/custom.css";'), 'custom.css tiene que ser lo último').toBe(true);
  });

  it('el template trae custom.css sin reglas (sólo el comentario)', () => {
    // En una tienda es suyo y tiene lo que quiera: sólo se mira en el template.
    if (TIENDA.nombre !== MARCA_PLACEHOLDER) return;
    const css = readFileSync(path.join('src', 'themes', 'custom.css'), 'utf8');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('');
  });
});
