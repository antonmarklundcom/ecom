import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `pagoparCheckoutRedirectUrl` / `isPagoparCheckoutOfferable` (PLAN.md 5.5).
 *
 * `PAGOPAR_CHECKOUT_URL` no tiene default (config.ts explica por qué, mismo
 * criterio que `PAGOPAR_BASE_URL`): sin ella el checkout no ofrece "Tarjeta"
 * aunque las claves de Pagopar estén cargadas.
 */

const PAGOPAR_VARS = [
  'PAGOPAR_PUBLIC_KEY',
  'PAGOPAR_PRIVATE_KEY',
  'PAGOPAR_BASE_URL',
  'PAGOPAR_CHECKOUT_URL',
] as const;

function clearPagoparEnv(): void {
  vi.resetModules();
  for (const name of PAGOPAR_VARS) vi.stubEnv(name, '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('pagoparCheckoutRedirectUrl', () => {
  it('tira si falta PAGOPAR_CHECKOUT_URL', async () => {
    clearPagoparEnv();
    const { pagoparCheckoutRedirectUrl, PagoparCheckoutUrlError } = await import(
      '../../src/domain/pagopar/checkout'
    );
    expect(() => pagoparCheckoutRedirectUrl('abc123')).toThrow(PagoparCheckoutUrlError);
  });

  it('reemplaza el placeholder {hash_pedido}', async () => {
    clearPagoparEnv();
    vi.stubEnv('PAGOPAR_CHECKOUT_URL', 'https://pagopar.example/pagos/{hash_pedido}/checkout');
    vi.resetModules();

    const { pagoparCheckoutRedirectUrl } = await import('../../src/domain/pagopar/checkout');
    expect(pagoparCheckoutRedirectUrl('abc123')).toBe(
      'https://pagopar.example/pagos/abc123/checkout'
    );
  });

  it('sin placeholder, pega el hash al final del path', async () => {
    clearPagoparEnv();
    vi.stubEnv('PAGOPAR_CHECKOUT_URL', 'https://pagopar.example/pagos/');
    vi.resetModules();

    const { pagoparCheckoutRedirectUrl } = await import('../../src/domain/pagopar/checkout');
    expect(pagoparCheckoutRedirectUrl('abc123')).toBe('https://pagopar.example/pagos/abc123');
  });

  it('codifica el hash', async () => {
    clearPagoparEnv();
    vi.stubEnv('PAGOPAR_CHECKOUT_URL', 'https://pagopar.example/pagos/{hash_pedido}');
    vi.resetModules();

    const { pagoparCheckoutRedirectUrl } = await import('../../src/domain/pagopar/checkout');
    expect(pagoparCheckoutRedirectUrl('a/b c')).toBe('https://pagopar.example/pagos/a%2Fb%20c');
  });
});

describe('isPagoparCheckoutOfferable', () => {
  it('false sin ninguna variable de Pagopar', async () => {
    clearPagoparEnv();
    const { isPagoparCheckoutOfferable } = await import('../../src/domain/pagopar/config');
    expect(isPagoparCheckoutOfferable()).toBe(false);
  });

  it('false con las claves cargadas pero sin PAGOPAR_CHECKOUT_URL', async () => {
    clearPagoparEnv();
    vi.stubEnv('PAGOPAR_PUBLIC_KEY', 'pub');
    vi.stubEnv('PAGOPAR_PRIVATE_KEY', 'priv');
    vi.stubEnv('PAGOPAR_BASE_URL', 'https://pagopar.example');
    vi.resetModules();

    const { isPagoparCheckoutOfferable } = await import('../../src/domain/pagopar/config');
    expect(isPagoparCheckoutOfferable()).toBe(false);
  });

  it('true con las cuatro variables cargadas', async () => {
    clearPagoparEnv();
    vi.stubEnv('PAGOPAR_PUBLIC_KEY', 'pub');
    vi.stubEnv('PAGOPAR_PRIVATE_KEY', 'priv');
    vi.stubEnv('PAGOPAR_BASE_URL', 'https://pagopar.example');
    vi.stubEnv('PAGOPAR_CHECKOUT_URL', 'https://pagopar.example/pagos/{hash_pedido}');
    vi.resetModules();

    const { isPagoparCheckoutOfferable } = await import('../../src/domain/pagopar/config');
    expect(isPagoparCheckoutOfferable()).toBe(true);
  });
});
