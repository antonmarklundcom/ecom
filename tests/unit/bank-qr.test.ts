import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La URL pública del QR SPI (`bankQrUrl`, PLAN.md FASE 2, PR T).
 *
 * Vive acá y no en el test de integración porque no necesita base: es armar
 * una URL pública de R2 con la base del bucket (`R2_PUBLIC_URL`). Se
 * reimporta el módulo con el entorno ya puesto para probar las dos puntas.
 */

const REF = 'r2:p1/qr-banco-0123456789@1200x1200';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('bankQrUrl', () => {
  it('usa el archivo más grande, sin recortar', async () => {
    vi.resetModules();
    vi.stubEnv('R2_PUBLIC_URL', 'https://img.tienda.test');

    const { bankQrUrl } = await import('../../src/lib/images');
    // Recortar un QR lo rompe: deja de escanear, y del otro lado hay alguien
    // parado frente a la app del banco que no puede pagar. Las cajas de p1
    // nunca recortan; el QR usa la más grande.
    expect(bankQrUrl(REF)).toBe('https://img.tienda.test/p1/qr-banco-0123456789-1200.webp');
  });

  it('sin base pública devuelve null en vez de un <img> roto', async () => {
    vi.resetModules();
    vi.stubEnv('R2_PUBLIC_URL', '');

    const { bankQrUrl } = await import('../../src/lib/images');
    expect(bankQrUrl(REF)).toBeNull();
  });

  it('un id viejo que no es de R2 devuelve null (placeholder)', async () => {
    vi.resetModules();
    vi.stubEnv('R2_PUBLIC_URL', 'https://img.tienda.test');

    const { bankQrUrl } = await import('../../src/lib/images');
    expect(bankQrUrl('banco/qr-spi')).toBeNull();
  });

  it('sin id guardado devuelve null: ahí manda BANCO_QR_URL del entorno', async () => {
    vi.resetModules();
    vi.stubEnv('R2_PUBLIC_URL', 'https://img.tienda.test');

    const { bankQrUrl } = await import('../../src/lib/images');
    expect(bankQrUrl(null)).toBeNull();
  });
});
