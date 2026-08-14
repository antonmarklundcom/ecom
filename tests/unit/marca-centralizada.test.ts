import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TIENDA } from '../../src/config/tienda';
import { listSourceFiles, readCode } from '../helpers/source';

/**
 * Guardarraíl del template (NEW-STORE.md): el nombre de la tienda se escribe
 * **una sola vez**, en `src/config/tienda.ts`.
 *
 * Sin esto, cada tienda nueva vuelve a ser una cacería del nombre viejo por
 * componentes, metadatos y títulos del panel — que es exactamente el trabajo
 * que este repo existe para no repetir. Si el test falla, la solución no es
 * agregar una excepción: es leer el nombre de `TIENDA`.
 */
const ROOTS = ['src', 'scripts'];
const CONFIG_MODULE = path.join('src', 'config', 'tienda.ts');

describe('la marca vive sólo en src/config/tienda.ts', () => {
  it('ningún otro módulo escribe el nombre de la tienda a mano', async () => {
    const needle = TIENDA.nombre.toLowerCase();
    const offenders: string[] = [];

    for (const file of await listSourceFiles(ROOTS)) {
      if (file === CONFIG_MODULE) continue;
      const code = await readCode(file);
      if (code.toLowerCase().includes(needle)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
