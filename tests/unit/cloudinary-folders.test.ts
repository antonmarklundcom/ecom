import { afterEach, describe, expect, it, vi } from 'vitest';

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
    const { CLOUDINARY_PRODUCTS_FOLDER, CLOUDINARY_RECEIPTS_FOLDER, CLOUDINARY_BANK_FOLDER } =
      await folders('');

    expect(CLOUDINARY_PRODUCTS_FOLDER).toBe('productos');
    expect(CLOUDINARY_RECEIPTS_FOLDER).toBe('comprobantes');
    expect(CLOUDINARY_BANK_FOLDER).toBe('banco');
  });

  it('con prefijo cuelgan todas de él, incluidos los comprobantes', async () => {
    const { CLOUDINARY_PRODUCTS_FOLDER, CLOUDINARY_RECEIPTS_FOLDER, CLOUDINARY_BANK_FOLDER } =
      await folders('lenceria');

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
});
