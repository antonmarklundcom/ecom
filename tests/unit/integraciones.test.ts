import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { comercioWhatsApp } from '../../src/lib/comercio';
import { r2Configurado } from '../../src/lib/r2';
import { analyticsConfig } from '../../src/lib/analytics';
import { productImageUrl } from '../../src/lib/images';
import {
  CAMPOS,
  INTEGRACIONES,
  integracion,
  invalidarIntegraciones,
  publicarFoto,
  resetIntegracionesForTests,
  resolverIntegracion,
  resumirIntegracion,
} from '../../src/lib/integraciones';
import { errorReportUrl } from '../../src/instrumentation';
import { isPagoparConfigured, pagoparConfig, pagoparPrivateKey } from '../../src/domain/pagopar/config';
import { whatsappCloudConfig, whatsappOwnerTemplate } from '../../src/domain/messaging/whatsapp-cloud';
import { customerNoticeTemplate } from '../../src/domain/order-customer-notifications';
import { digestTemplate } from '../../src/domain/daily-digest';
import { stockAlertTemplate } from '../../src/domain/stock-alerts';

/**
 * La precedencia de `src/lib/integraciones.ts`: **fila de la base > variable
 * de entorno > apagado**, y que cada lector de siempre (Pagopar, WhatsApp,
 * R2, GA4/Pixel, reporte de errores) la respete sin cambiar su firma.
 */

/** Todas las variables de integraciones, vacías: el punto de partida "apagado". */
function sinEntorno(): void {
  for (const nombre of INTEGRACIONES) {
    for (const def of CAMPOS[nombre]) vi.stubEnv(def.env, '');
  }
  vi.stubEnv('PAGOPAR_MODE', '');
}

beforeEach(() => {
  resetIntegracionesForTests();
  sinEntorno();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetIntegracionesForTests();
});

describe('resolverIntegracion (pura)', () => {
  it('fila > entorno > apagado, campo por campo', () => {
    const config = resolverIntegracion(
      'whatsapp',
      { valores: { plantillaPedidoNuevo: 'del_panel' }, ilegibles: [] },
      {
        WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO: 'del_entorno',
        WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO: 'resumen_entorno',
      },
    );
    expect(config.valores.plantillaPedidoNuevo).toBe('del_panel');
    expect(config.fuentes.plantillaPedidoNuevo).toBe('panel');
    expect(config.valores.plantillaResumenDiario).toBe('resumen_entorno');
    expect(config.fuentes.plantillaResumenDiario).toBe('entorno');
    expect(config.valores.plantillaStockDisponible).toBeNull();
    expect(config.fuentes.plantillaStockDisponible).toBeNull();
  });

  it('las credenciales de un grupo no se mezclan entre fuentes', () => {
    // El panel tiene la cuenta de R2; el entorno, la clave de otra.
    // Mezclarlas subiría los comprobantes a donde nadie espera: el grupo
    // entero sale del panel, y lo que falta ahí falta.
    const config = resolverIntegracion(
      'r2',
      { valores: { accountId: '0123456789abcdef0123456789abcdef' }, ilegibles: [] },
      {
        R2_ACCOUNT_ID: 'ffffffffffffffffffffffffffffffff',
        R2_ACCESS_KEY_ID: 'AKIAENTORNO000000',
        R2_SECRET_ACCESS_KEY: 'secreto-del-entorno',
        R2_BUCKET: 'bucket-del-entorno',
        R2_PUBLIC_URL: 'https://img.tienda.test',
      },
    );
    expect(config.valores.accountId).toBe('0123456789abcdef0123456789abcdef');
    expect(config.valores.accessKeyId).toBeNull();
    expect(config.valores.secretAccessKey).toBeNull();
    expect(config.valores.bucket).toBeNull();
    // Lo que no es credencial sigue campo por campo.
    expect(config.valores.publicUrl).toBe('https://img.tienda.test');
    expect(resumirIntegracion('r2', config)).toEqual({
      estado: 'incompleta',
      faltan: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
    });
  });

  it('un secreto que no se puede descifrar deja el grupo apagado, no el del entorno', () => {
    const config = resolverIntegracion(
      'pagopar',
      { valores: { publicKey: 'pub', baseUrl: 'https://api.ejemplo.test' }, ilegibles: ['privateKey'] },
      { PAGOPAR_PRIVATE_KEY: 'la-del-entorno' },
    );
    expect(config.valores.privateKey).toBeNull();
    expect(config.ilegibles).toEqual(['privateKey']);
  });

  it('el changeme de los .env.example viejos cuenta como vacío', () => {
    const config = resolverIntegracion('r2', undefined, {
      R2_ACCOUNT_ID: 'changeme',
      R2_ACCESS_KEY_ID: 'changeme',
      R2_SECRET_ACCESS_KEY: 'changeme',
      R2_BUCKET: 'changeme',
      R2_PUBLIC_URL: 'changeme',
    });
    expect(resumirIntegracion('r2', config)).toEqual({ estado: 'apagada' });
  });

  it('sin fila y sin entorno, todas apagadas', () => {
    for (const nombre of INTEGRACIONES) {
      expect(resumirIntegracion(nombre, resolverIntegracion(nombre, undefined, {})), nombre).toEqual({
        estado: 'apagada',
      });
    }
  });
});

describe('sin configuración, todo queda apagado', () => {
  it('ningún lector inventa nada', () => {
    expect(whatsappCloudConfig()).toBeNull();
    expect(whatsappOwnerTemplate()).toBeNull();
    expect(customerNoticeTemplate('pagado')).toBeNull();
    expect(digestTemplate()).toBeNull();
    expect(stockAlertTemplate()).toBeNull();
    expect(comercioWhatsApp()).toBeNull();
    expect(isPagoparConfigured()).toBe(false);
    expect(pagoparPrivateKey()).toBeNull();
    expect(r2Configurado()).toBe(false);
    expect(productImageUrl('r2:p1/remera-0123456789@1200x900')).toBeNull();
    expect(analyticsConfig()).toEqual({ ga4Id: null, metaPixelId: null });
    expect(errorReportUrl()).toBeNull();
  });
});

describe('el entorno sigue funcionando (legacy)', () => {
  it('sin fila en el panel, cada lector usa sus variables de siempre', () => {
    vi.stubEnv('PAGOPAR_PUBLIC_KEY', 'pub-env');
    vi.stubEnv('PAGOPAR_PRIVATE_KEY', 'priv-env');
    vi.stubEnv('PAGOPAR_BASE_URL', 'https://api.pagopar.test/');
    vi.stubEnv('WHATSAPP_NUMBER', '0981 222 333');
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-ENTORNO1');
    vi.stubEnv('R2_ACCOUNT_ID', '0123456789abcdef0123456789abcdef');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'AKIAENTORNO000000');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secreto-env');
    vi.stubEnv('R2_BUCKET', 'tienda-env');
    vi.stubEnv('R2_PUBLIC_URL', 'https://img-env.tienda.test/');

    expect(pagoparConfig()).toEqual({
      publicKey: 'pub-env',
      privateKey: 'priv-env',
      baseUrl: 'https://api.pagopar.test',
    });
    expect(comercioWhatsApp()).toBe('+595981222333');
    expect(analyticsConfig().ga4Id).toBe('G-ENTORNO1');
    expect(r2Configurado()).toBe(true);
    expect(productImageUrl('r2:p1/remera-0123456789@1200x900')).toBe(
      'https://img-env.tienda.test/p1/remera-0123456789-480.webp',
    );
    // Una referencia que no es de R2 nunca arma una URL: placeholder.
    expect(productImageUrl('productos/x')).toBeNull();
  });
});

describe('el panel manda sobre el entorno', () => {
  it('Pagopar: las tres credenciales salen del panel', () => {
    vi.stubEnv('PAGOPAR_PUBLIC_KEY', 'pub-env');
    vi.stubEnv('PAGOPAR_PRIVATE_KEY', 'priv-env');
    vi.stubEnv('PAGOPAR_BASE_URL', 'https://env.test');
    publicarFoto({
      pagopar: {
        valores: { publicKey: 'pub-panel', privateKey: 'priv-panel', baseUrl: 'https://panel.test' },
        ilegibles: [],
      },
    });

    expect(pagoparConfig()).toEqual({
      publicKey: 'pub-panel',
      privateKey: 'priv-panel',
      baseUrl: 'https://panel.test',
    });
    expect(pagoparPrivateKey()).toBe('priv-panel');
  });

  it('WhatsApp: credenciales, plantillas y número del comercio', () => {
    vi.stubEnv('WHATSAPP_NUMBER', '0981 111 111');
    vi.stubEnv('WHATSAPP_CLOUD_TEMPLATE_RESUMEN_DIARIO', 'resumen_env');
    publicarFoto({
      whatsapp: {
        valores: {
          numeroComercio: '+595981999999',
          phoneNumberId: '1234567',
          accessToken: 'token-del-panel',
          plantillaLogin: 'login_codigo',
          plantillaClientePagado: 'pagado_panel',
        },
        ilegibles: [],
      },
    });

    expect(whatsappCloudConfig()).toEqual({
      phoneNumberId: '1234567',
      accessToken: 'token-del-panel',
      templateName: 'login_codigo',
      apiVersion: 'v21.0',
    });
    expect(comercioWhatsApp()).toBe('+595981999999');
    expect(customerNoticeTemplate('pagado')).toBe('pagado_panel');
    // Lo que el panel no cargó sigue saliendo del entorno.
    expect(digestTemplate()).toBe('resumen_env');
  });

  it('R2: credenciales, bucket y dominio público, sin redeploy', () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://img-env.tienda.test');
    publicarFoto({
      r2: {
        valores: {
          accountId: '0123456789abcdef0123456789abcdef',
          accessKeyId: 'AKIAPANEL00000000',
          secretAccessKey: 's3cr3t-panel',
          bucket: 'tienda-panel',
          publicUrl: 'https://img-panel.tienda.test',
        },
        ilegibles: [],
      },
    });
    expect(r2Configurado()).toBe(true);
    expect(productImageUrl('r2:p1/remera-0123456789@1200x900', 'thumb')).toBe(
      'https://img-panel.tienda.test/p1/remera-0123456789-240.webp',
    );
  });

  it('Medición y reporte de errores', () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-ENTORNO1');
    publicarFoto({
      analitica: { valores: { ga4Id: 'G-PANEL123', metaPixelId: '123456789' }, ilegibles: [] },
      errores: { valores: { reportUrl: 'https://hooks.ejemplo.test/x' }, ilegibles: [] },
    });
    expect(analyticsConfig()).toEqual({ ga4Id: 'G-PANEL123', metaPixelId: '123456789' });
    expect(errorReportUrl()).toBe('https://hooks.ejemplo.test/x');
  });

  it('un id de medición mal formado cargado en el panel tampoco entra al HTML', () => {
    publicarFoto({ analitica: { valores: { ga4Id: '"><script>' }, ilegibles: [] } });
    expect(analyticsConfig().ga4Id).toBeNull();
  });
});

describe('la foto', () => {
  it('invalidar deja la foto vencida para la próxima lectura', async () => {
    const cargador = vi.fn(async () => {});
    const { registrarCargador, fotoVencida } = await import('../../src/lib/integraciones');
    registrarCargador(cargador);
    publicarFoto({});
    expect(fotoVencida()).toBe(false);
    invalidarIntegraciones();
    expect(fotoVencida()).toBe(true);
    // Una lectura vencida dispara la recarga en segundo plano, sin esperarla.
    integracion('errores');
    expect(cargador).toHaveBeenCalledTimes(1);
  });
});
