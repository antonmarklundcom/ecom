import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CAMPOS, INTEGRACIONES, resetIntegracionesForTests } from '../../src/lib/integraciones';
import {
  R2Error,
  R2NoConfiguradoError,
  claveDeRefPrivada,
  clavePrivada,
  clienteR2,
  crearClienteR2,
  leerConfigR2,
  mensajeR2,
  parsearListado,
  r2Configurado,
  refPrivada,
} from '../../src/lib/r2';
import { probarCanariosPrivados } from '../../src/domain/preflight-r2';
import { CONFIG_FALSA, ENDPOINT_FALSO, ENV_R2_FALSO, crearR2Falso } from '../helpers/r2-falso';

/**
 * El cliente de R2 (`src/lib/r2.ts`): firma SigV4 contra la API S3, sin red
 * (un `fetch` de mentira), y nunca deja el secret en una URL, un header que no
 * sea la firma, o un mensaje de error.
 */

beforeEach(() => {
  resetIntegracionesForTests();
  for (const nombre of INTEGRACIONES) for (const def of CAMPOS[nombre]) vi.stubEnv(def.env, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetIntegracionesForTests();
});

describe('la configuración', () => {
  it('importar nunca falla; sin config, usarlo tira con un mensaje que dice dónde cargarla', () => {
    expect(r2Configurado()).toBe(false);
    expect(() => clienteR2()).toThrow(R2NoConfiguradoError);
    expect(() => clienteR2()).toThrow(/\/admin\/integraciones/);
  });

  it('un Account ID o un bucket con forma imposible cuentan como faltantes', () => {
    for (const [k, v] of Object.entries(ENV_R2_FALSO)) vi.stubEnv(k, v);
    expect(r2Configurado()).toBe(true);
    vi.stubEnv('R2_ACCOUNT_ID', 'evil.example.com/');
    expect(leerConfigR2().faltan).toContain('R2_ACCOUNT_ID');
    expect(r2Configurado()).toBe(false);
    vi.stubEnv('R2_ACCOUNT_ID', ENV_R2_FALSO.R2_ACCOUNT_ID!);
    vi.stubEnv('R2_BUCKET', 'Bucket_Raro');
    expect(r2Configurado()).toBe(false);
  });

  it('sin la base pública no está "configurado": las fotos no se verían', () => {
    for (const [k, v] of Object.entries(ENV_R2_FALSO)) vi.stubEnv(k, v);
    vi.stubEnv('R2_PUBLIC_URL', '');
    expect(leerConfigR2().faltan).toEqual(['R2_PUBLIC_URL']);
    expect(r2Configurado()).toBe(false);
  });
});

describe('las firmas', () => {
  it('cada pedido va al endpoint S3 de la cuenta, firmado, y el secret no viaja', async () => {
    const r2 = crearR2Falso();
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch, datetime: '20261104T120000Z' });
    await cliente.put('p1/x-0123456789-240.webp', new Uint8Array([1, 2, 3]), {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      soloSiNoExiste: true,
    });
    const [pedido] = r2.pedidos;
    expect(pedido!.url).toBe(`${ENDPOINT_FALSO}/p1/x-0123456789-240.webp`);
    const auth = pedido!.headers.get('authorization')!;
    expect(auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTTEST0000\/20261104\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    // If-None-Match va firmado: un intermediario no lo puede sacar.
    expect(auth).toContain('if-none-match');
    for (const valor of [...pedido!.headers.values(), pedido!.url]) {
      expect(valor).not.toContain(CONFIG_FALSA.secretAccessKey);
    }
  });

  it('la misma fecha firma igual: determinístico, sin red', async () => {
    const firmas: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r2 = crearR2Falso();
      const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch, datetime: '20261104T120000Z' });
      await cliente.head('p1/x-0123456789.jpg');
      firmas.push(r2.pedidos[0]!.headers.get('authorization')!);
    }
    expect(firmas[0]).toBe(firmas[1]);
  });

  it('la URL prefirmada vence (X-Amz-Expires) y lleva la firma en la query, no el secret', async () => {
    const cliente = crearClienteR2(CONFIG_FALSA, { datetime: '20261104T120000Z' });
    const url = new URL(await cliente.urlFirmada('comprobantes/abc/PY-000123.jpg', 120));
    expect(url.origin + url.pathname).toBe(`${ENDPOINT_FALSO}/comprobantes/abc/PY-000123.jpg`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain(CONFIG_FALSA.secretAccessKey);
    await expect(cliente.urlFirmada('comprobantes/x', 0)).rejects.toThrow();
    await expect(cliente.urlFirmada('comprobantes/x', 7200)).rejects.toThrow();
  });

  it('una clave que se escapa del bucket no se pide', async () => {
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: crearR2Falso().fetch });
    await expect(cliente.get('../otro-bucket/x')).rejects.toThrow('Clave de objeto inválida');
    await expect(cliente.get('/x')).rejects.toThrow('Clave de objeto inválida');
  });
});

describe('las respuestas', () => {
  it('412 con soloSiNoExiste es "ya estaba" (claves inmutables), no un error', async () => {
    const r2 = crearR2Falso();
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch });
    const bytes = new Uint8Array([9]);
    expect(await cliente.put('p1/a.jpg', bytes, { contentType: 'image/jpeg', soloSiNoExiste: true })).toEqual({ yaExistia: false });
    expect(await cliente.put('p1/a.jpg', bytes, { contentType: 'image/jpeg', soloSiNoExiste: true })).toEqual({ yaExistia: true });
    expect(await cliente.get('p1/a.jpg')).toEqual(bytes);
    expect(await cliente.get('p1/no-existe.jpg')).toBeNull();
    expect(await cliente.head('p1/a.jpg')).toEqual({ existe: true, bytes: 1 });
    await cliente.delete('p1/a.jpg');
    expect(await cliente.head('p1/a.jpg')).toEqual({ existe: false, bytes: null });
  });

  it('un error dice método, status y código, sin el secret ni la parte aleatoria de la clave', async () => {
    const fetchImpl = vi.fn(async () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }));
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const key = `comprobantes/${'f'.repeat(32)}/PY-000123.jpg`;
    const error = await cliente.put(key, new Uint8Array([1]), { contentType: 'image/jpeg' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(R2Error);
    expect(mensajeR2(error)).toBe('R2 PUT comprobantes/…/PY-000123.jpg: HTTP 403 (AccessDenied)');
    expect(mensajeR2(error)).not.toContain('f'.repeat(32));
    // Un 403 no se reintenta.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un 5xx se reintenta y después se informa', async () => {
    // Con las esperas de verdad (0,5 s + 1 s): los timers falsos no se llevan
    // bien con la firma asíncrona de WebCrypto.
    const fetchImpl = vi.fn(async () => new Response('<Error><Code>InternalError</Code></Error>', { status: 503 }));
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await cliente.head('p1/a.jpg').catch((e: unknown) => e);
    expect(mensajeR2(error)).toBe('R2 HEAD p1/a.jpg: HTTP 503 (InternalError)');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('parsea ListObjectsV2, con paginado', () => {
    const xml =
      '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken>' +
      '<Contents><Key>backups/a/manifest.json</Key><Size>12</Size><LastModified>2026-11-01T03:00:00.000Z</LastModified></Contents>' +
      '<Contents><Key>backups/a/orders.jsonl.gz</Key><Size>34</Size><LastModified>2026-11-01T03:00:01.000Z</LastModified></Contents>' +
      '</ListBucketResult>';
    expect(parsearListado(xml)).toEqual({
      objetos: [
        { key: 'backups/a/manifest.json', size: 12, lastModified: new Date('2026-11-01T03:00:00.000Z') },
        { key: 'backups/a/orders.jsonl.gz', size: 34, lastModified: new Date('2026-11-01T03:00:01.000Z') },
      ],
      siguiente: 'tok&1',
    });
  });
});

describe('las claves privadas', () => {
  it('llevan 128 bits aleatorios antes del nombre legible', () => {
    const una = clavePrivada('comprobantes/', 'PY-000123.jpg');
    const otra = clavePrivada('comprobantes/', 'PY-000123.jpg');
    expect(una).toMatch(/^comprobantes\/[0-9a-f]{32}\/PY-000123\.jpg$/);
    expect(una).not.toBe(otra);
    expect(clavePrivada('backups/', '../../etc/passwd')).toMatch(/^backups\/[0-9a-f]{32}\/[A-Za-z0-9._-]+$/);
  });

  it('la referencia guardada distingue lo de R2 de lo viejo', () => {
    const key = clavePrivada('comprobantes/', 'PY-1.pdf');
    expect(claveDeRefPrivada(refPrivada(key))).toBe(key);
    for (const viejo of ['comprobantes/PY-000123-1700000000', 'r2:p1/x-0123456789@1x1', 'r2:comprobantes/../x', '']) {
      expect(claveDeRefPrivada(viejo), viejo).toBeNull();
    }
  });
});

describe('preflight: el canario privado', () => {
  it('con el dominio bloqueando los prefijos privados, bloqueado y sin dejar nada', async () => {
    const r2 = crearR2Falso();
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch });
    const resultados = await probarCanariosPrivados(cliente, r2.fetch);
    expect(resultados).toEqual([
      { prefijo: 'comprobantes/', estado: 'bloqueado' },
      { prefijo: 'backups/', estado: 'bloqueado' },
    ]);
    expect(r2.objetos.size).toBe(0);
  });

  it('sin la regla del dominio, público (y preflight sale con 1)', async () => {
    const r2 = crearR2Falso({ publicoSirvePrivados: true });
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch });
    const resultados = await probarCanariosPrivados(cliente, r2.fetch);
    expect(resultados.map((r) => r.estado)).toEqual(['publico', 'publico']);
    expect(r2.objetos.size).toBe(0);
  });
});
