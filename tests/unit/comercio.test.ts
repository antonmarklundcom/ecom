import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatGs, formatGsPlain } from '../../src/lib/money';

/**
 * Datos bancarios del comercio (PLAN.md 3.4).
 *
 * Lo que se protege acá no es el formato: es la regla de "todo o nada". Una
 * pantalla de pago con el banco pero sin número de cuenta hace que el
 * comprador crea que puede pagar, se trabe, y el pedido se pierda sin que
 * nadie se entere.
 */

const OBLIGATORIAS = [
  'COMERCIO_BANCO',
  'COMERCIO_TITULAR',
  'COMERCIO_RUC',
  'COMERCIO_CUENTA',
] as const;

function stubCompletos(): void {
  vi.resetModules();
  vi.stubEnv('COMERCIO_BANCO', 'Banco Continental');
  vi.stubEnv('COMERCIO_TITULAR', 'Comercial San Roque S.A.');
  vi.stubEnv('COMERCIO_RUC', '80012345-0');
  vi.stubEnv('COMERCIO_CUENTA', '1234567890');
  vi.stubEnv('COMERCIO_ALIAS', '');
  vi.stubEnv('COMERCIO_QR_URL', '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('datosBancarios', () => {
  it('devuelve los datos cuando están los cuatro obligatorios', async () => {
    stubCompletos();
    const { datosBancarios } = await import('../../src/lib/comercio');

    expect(datosBancarios()).toEqual({
      banco: 'Banco Continental',
      titular: 'Comercial San Roque S.A.',
      ruc: '80012345-0',
      cuenta: '1234567890',
      alias: null,
      qrUrl: null,
    });
  });

  it.each(OBLIGATORIAS)('devuelve null si falta %s', async (faltante) => {
    stubCompletos();
    vi.stubEnv(faltante, '');
    const { datosBancarios } = await import('../../src/lib/comercio');

    // Todo o nada: nada de mostrar tres de cuatro campos.
    expect(datosBancarios()).toBeNull();
  });

  it('un valor con sólo espacios cuenta como faltante', async () => {
    stubCompletos();
    vi.stubEnv('COMERCIO_CUENTA', '   ');
    const { datosBancarios, datosBancariosFaltantes } = await import('../../src/lib/comercio');

    expect(datosBancarios()).toBeNull();
    expect(datosBancariosFaltantes()).toEqual(['COMERCIO_CUENTA']);
  });

  it('los opcionales no bloquean, pero se devuelven si están', async () => {
    stubCompletos();
    vi.stubEnv('COMERCIO_ALIAS', 'sanroque.py');
    vi.stubEnv('COMERCIO_QR_URL', 'https://res.cloudinary.com/x/qr.png');
    const { datosBancarios } = await import('../../src/lib/comercio');

    expect(datosBancarios()).toMatchObject({
      alias: 'sanroque.py',
      qrUrl: 'https://res.cloudinary.com/x/qr.png',
    });
  });

  it('datosBancariosFaltantes nombra exactamente lo que hay que cargar', async () => {
    vi.resetModules();
    for (const name of OBLIGATORIAS) vi.stubEnv(name, '');
    vi.stubEnv('COMERCIO_BANCO', 'Banco Continental');
    const { datosBancariosFaltantes } = await import('../../src/lib/comercio');

    expect(datosBancariosFaltantes()).toEqual([
      'COMERCIO_TITULAR',
      'COMERCIO_RUC',
      'COMERCIO_CUENTA',
    ]);
  });

  it('sin nada configurado no explota: devuelve null y lista los cuatro', async () => {
    vi.resetModules();
    for (const name of OBLIGATORIAS) vi.stubEnv(name, '');
    const { datosBancarios, datosBancariosFaltantes } = await import('../../src/lib/comercio');

    expect(datosBancarios()).toBeNull();
    expect(datosBancariosFaltantes()).toEqual([...OBLIGATORIAS]);
  });
});

describe('el monto que se copia al portapapeles', () => {
  /**
   * Lo que se **muestra** lleva formato; lo que se **copia** tiene que entrar
   * tal cual en el campo "monto" de la app del banco.
   *
   * Ojo con `formatGsPlain`: el nombre invita a usarlo acá, pero sigue
   * agrupando de miles ("570.000"), y ese punto una app bancaria lo lee como
   * decimal o directamente rechaza el pegado. Para copiar van los dígitos
   * pelados.
   */
  it('formatGs y formatGsPlain sirven para mostrar, no para copiar', () => {
    expect(formatGs(570000)).toBe('₲ 570.000');
    expect(formatGsPlain(570000)).toBe('570.000');
  });

  it('lo que va al portapapeles son dígitos pelados', () => {
    expect(String(570000)).toBe('570000');
    expect(String(570000)).not.toContain('.');
    expect(String(570000)).not.toContain('₲');
  });

  it('la página de pago copia el total sin separadores', async () => {
    const { readCode } = await import('../helpers/source');
    const page = await readCode('src/app/pedido/[orderNumber]/page.tsx');

    // El campo destacado es el total: tiene que copiar String(totalPyg) y no
    // una versión formateada.
    expect(page).toMatch(/copy:\s*String\(order\.totalPyg\)/);
    expect(page).not.toMatch(/copy:\s*formatGsPlain/);
  });
});
