import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCode } from '../helpers/source';

/**
 * `CLOUDINARY_FOLDER_PREFIX` (PLAN.md FASE 2, PR U).
 *
 * El prefijo existe por un choque concreto: el `public_id` de un comprobante
 * sale del número de pedido, y los números se repiten entre tiendas — todas
 * acuñan `PY-000123`. Con dos tiendas en una misma cuenta de Cloudinary y sin
 * prefijo, los comprobantes de las dos caen en la misma carpeta.
 *
 * Las constantes se resuelven al importar el módulo, así que cada caso
 * reimporta con el entorno ya puesto.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function folders(prefix: string | undefined) {
  vi.resetModules();
  vi.stubEnv('CLOUDINARY_FOLDER_PREFIX', prefix ?? '');
  return import('../../src/lib/cloudinary');
}

describe('las carpetas de Cloudinary', () => {
  it('sin prefijo son las de siempre', async () => {
    const {
      CLOUDINARY_PRODUCTS_FOLDER,
      CLOUDINARY_RECEIPTS_FOLDER,
      CLOUDINARY_BANK_FOLDER,
      CLOUDINARY_CATEGORIES_FOLDER,
    } = await folders('');

    expect(CLOUDINARY_PRODUCTS_FOLDER).toBe('productos');
    expect(CLOUDINARY_RECEIPTS_FOLDER).toBe('comprobantes');
    expect(CLOUDINARY_BANK_FOLDER).toBe('banco');
    expect(CLOUDINARY_CATEGORIES_FOLDER).toBe('categorias');
  });

  it('con prefijo cuelgan todas de él, incluidos los comprobantes', async () => {
    const {
      CLOUDINARY_PRODUCTS_FOLDER,
      CLOUDINARY_RECEIPTS_FOLDER,
      CLOUDINARY_BANK_FOLDER,
      CLOUDINARY_CATEGORIES_FOLDER,
    } = await folders('lenceria');

    expect(CLOUDINARY_CATEGORIES_FOLDER).toBe('lenceria/categorias');
    expect(CLOUDINARY_PRODUCTS_FOLDER).toBe('lenceria/productos');
    // Ésta es la que importa: es la que colisiona entre tiendas.
    expect(CLOUDINARY_RECEIPTS_FOLDER).toBe('lenceria/comprobantes');
    expect(CLOUDINARY_BANK_FOLDER).toBe('lenceria/banco');
  });

  it('tolera las barras que escribe alguien apurado', async () => {
    const { CLOUDINARY_PRODUCTS_FOLDER } = await folders('/lenceria/');
    expect(CLOUDINARY_PRODUCTS_FOLDER).toBe('lenceria/productos');
  });

  it('un prefijo de sólo espacios es no tener prefijo', async () => {
    const { CLOUDINARY_RECEIPTS_FOLDER } = await folders('   ');
    expect(CLOUDINARY_RECEIPTS_FOLDER).toBe('comprobantes');
  });

  it('acepta un prefijo anidado', async () => {
    const { CLOUDINARY_RECEIPTS_FOLDER } = await folders('clientes/lenceria');
    expect(CLOUDINARY_RECEIPTS_FOLDER).toBe('clientes/lenceria/comprobantes');
  });

  /**
   * La constante existe desde O7, pero hasta O14 nadie subía a ella: la foto
   * de una categoría se cargaba pegando el `public_id` a mano. Ahora que
   * `uploadCategoryImage` sube de verdad, este test cuida que use **la
   * constante** y no un `"categorias"` literal, que es como se pierde el
   * prefijo de una tienda que comparte cuenta de Cloudinary.
   */
  it('la subida de la foto de categoría usa la constante, no un literal', async () => {
    const code = await readCode(path.join('src', 'app', 'actions', 'admin-categories.ts'));

    expect(code).toMatch(/folder:\s*CLOUDINARY_CATEGORIES_FOLDER/);
    expect(code).not.toMatch(/folder:\s*['"`]categorias/);
  });
});
