import { describe, expect, it } from 'vitest';

import { stripComments } from '../helpers/source';

/**
 * `stripComments()` es la lupa con la que varios tests miran el código:
 * `marca-centralizada` busca el nombre de la tienda, `security-review` busca
 * directivas del CSP, `admin-guards` busca los guards de cada acción.
 *
 * Por eso importa para qué lado falla. Si borra de más, el test que exige que
 * algo **esté** se cae ruidosamente y alguien lo mira; pero el que exige que
 * algo **no** esté —`not.toContain('unsafe-inline')`, "ninguna acción sin
 * guard"— pasa feliz, en verde, justamente porque ya no está mirando nada.
 *
 * Los dos casos de abajo no son hipotéticos: los dos rompieron este repo.
 */
describe('stripComments', () => {
  it('saca los comentarios de línea y de bloque', () => {
    // El salto de línea queda: sólo se va el comentario, no la línea.
    expect(stripComments('const a = 1; // nota\n')).toBe('const a = 1; \n');
    expect(stripComments('/* nota */const a = 1;')).toBe('const a = 1;');
    expect(stripComments('/**\n * doc\n */\nconst a = 1;')).toBe('\nconst a = 1;');
  });

  it('no confunde un `/*` que vive adentro de un string', () => {
    // El caso real: src/proxy.ts arma el CSP con una URL de medidores que
    // dice https://*.google-analytics.com. Para una regex ingenua ese `/*`
    // abre un comentario, y el primer `*/` de más abajo lo cierra — borrando
    // todas las directivas del CSP que quedaron en el medio.
    const codigo = [
      'const hosts = "https://*.google-analytics.com";',
      'const csp = "script-src \'self\' \'unsafe-inline\'";',
      '/* un comentario cualquiera, más abajo */',
      'const fin = 1;',
    ].join('\n');

    const salida = stripComments(codigo);
    expect(salida).toContain('google-analytics');
    expect(salida).toContain("script-src 'self' 'unsafe-inline'");
    expect(salida).not.toContain('un comentario cualquiera');
  });

  it('no confunde las comillas que viven adentro de una expresión regular', () => {
    // El otro caso real: scripts/nueva-tienda.ts tiene un regex con comillas
    // adentro. Leído como si abriera un string, todo lo que sigue se
    // interpreta mal y los comentarios de más abajo dejan de reconocerse —
    // así, el nombre del template aparecía "escrito en el código" cuando en
    // realidad estaba en un comentario.
    const codigo = [
      'const partes = /"((?:[^"\\\\]|\\\\.)*)"/g;',
      '// TiendaPY sólo se nombra acá, en un comentario',
      'const fin = 1;',
    ].join('\n');

    const salida = stripComments(codigo);
    expect(salida).toContain('const partes =');
    expect(salida).toContain('const fin = 1;');
    expect(salida).not.toContain('TiendaPY');
  });

  it('sigue tratando la división como división', () => {
    const salida = stripComments('const mitad = total / 2; // la mitad\nconst x = (a + b) / c;');
    expect(salida).toContain('total / 2;');
    expect(salida).toContain('(a + b) / c;');
    expect(salida).not.toContain('la mitad');
  });

  it('respeta las comillas escapadas y los template literals', () => {
    expect(stripComments('const a = "dice \\"hola\\""; // nota')).toBe(
      'const a = "dice \\"hola\\""; ',
    );
    expect(stripComments('const a = `no // es un comentario`;')).toBe(
      'const a = `no // es un comentario`;',
    );
  });
});
