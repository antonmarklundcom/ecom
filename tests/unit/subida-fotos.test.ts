import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { verificarSetPreparado } from '../../src/domain/product-images';
import { DescargaError, descargarImagen, ipNoPublica, urlPermitida } from '../../src/lib/descarga-segura';
import { boxesFor, sizeForBox } from '../../src/lib/imagenes-r2';

/**
 * Lo que llega de afuera y termina en el bucket público:
 *
 * - el set que prepara el navegador en el panel (`verificarSetPreparado`):
 *   cada archivo se mira por sus bytes —firma y dimensiones— y el juego de
 *   cajas tiene que ser exactamente el que corresponde;
 * - la foto que el servidor baja de una URL de la planilla
 *   (`descargarImagen`): https, sin hosts privados, redirecciones contadas,
 *   tope de bytes, y contenido que sea una imagen.
 */

async function codificar(w: number, h: number, formato: 'webp' | 'jpeg'): Promise<Blob> {
  const imagen = sharp({ create: { width: w, height: h, channels: 3, background: '#4080c0' } });
  const bytes = await (formato === 'webp' ? imagen.webp() : imagen.jpeg()).toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: `image/${formato}` });
}

/** Lo que manda `preparar-imagen.ts` para una foto de `w`×`h`. */
async function setDelNavegador(w: number, h: number): Promise<FormData> {
  const form = new FormData();
  form.set('imageWidth', String(w));
  form.set('imageHeight', String(h));
  form.set('alt', 'una foto');
  for (const box of boxesFor(w, h)) {
    const d = sizeForBox(w, h, box)!;
    form.set(`webp${box}`, await codificar(d.width, d.height, 'webp'), `${box}.webp`);
  }
  form.set('jpeg', await codificar(w, h, 'jpeg'), 'respaldo.jpg');
  return form;
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  const error = (await promesa.catch((e: unknown) => e)) as { code?: string };
  return error?.code ?? 'sin error';
}

describe('verificarSetPreparado (lo que sube el panel)', () => {
  it('un set bien armado pasa, con el hash de sus bytes', async () => {
    const set = await verificarSetPreparado(await setDelNavegador(1200, 900));
    expect([set.width, set.height]).toEqual([1200, 900]);
    expect(set.objetos.map((o) => [o.format, o.box, o.width, o.height])).toEqual([
      ['webp', 240, 240, 180],
      ['webp', 480, 480, 360],
      ['webp', 800, 800, 600],
      ['webp', 1200, 1200, 900],
      ['jpeg', 1200, 1200, 900],
    ]);
    expect(set.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sin dimensiones (el original sin preparar) se pide preparar', async () => {
    const form = new FormData();
    form.set('file', await codificar(3000, 2000, 'jpeg'), 'foto.jpg');
    expect(await codigoDe(verificarSetPreparado(form))).toBe('adminError.foto.sinPreparar');
  });

  it('un SVG declarado como WebP no pasa', async () => {
    const form = await setDelNavegador(480, 480);
    form.set(
      'webp240',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/webp' }),
      '240.webp',
    );
    expect(await codigoDe(verificarSetPreparado(form))).toBe('adminError.foto.formato');
  });

  it('dimensiones declaradas que no son las de los bytes no pasan', async () => {
    const form = await setDelNavegador(800, 800);
    form.set('imageWidth', '801');
    expect(await codigoDe(verificarSetPreparado(form))).not.toBe('sin error');

    const otra = await setDelNavegador(800, 800);
    otra.set('webp480', await codificar(480, 479, 'webp'), '480.webp');
    expect(await codigoDe(verificarSetPreparado(otra))).toBe('adminError.foto.formato');
  });

  it('un JPEG donde va un WebP no pasa', async () => {
    const form = await setDelNavegador(480, 480);
    form.set('webp480', await codificar(480, 480, 'jpeg'), '480.webp');
    expect(await codigoDe(verificarSetPreparado(form))).toBe('adminError.foto.formato');
  });

  it('una caja de menos o un archivo de más no pasan', async () => {
    const falta = await setDelNavegador(1200, 1200);
    falta.delete('webp800');
    expect(await codigoDe(verificarSetPreparado(falta))).toBe('adminError.foto.vacia');

    const sobra = await setDelNavegador(480, 480);
    sobra.set('webp1600', await codificar(1600, 1600, 'webp'), '1600.webp');
    expect(await codigoDe(verificarSetPreparado(sobra))).toBe('adminError.foto.formato');
  });

  it('más grande que 1200 no pasa, aunque el set sea coherente', async () => {
    const form = new FormData();
    form.set('imageWidth', '1600');
    form.set('imageHeight', '1600');
    expect(await codigoDe(verificarSetPreparado(form))).toBe('adminError.foto.formato');
  });

  it('el total tiene techo', async () => {
    const form = await setDelNavegador(240, 240);
    const pesado = new Uint8Array(6 * 1024 * 1024);
    pesado.set(new Uint8Array(await (await codificar(240, 240, 'jpeg')).arrayBuffer()));
    form.set('jpeg', new Blob([pesado], { type: 'image/jpeg' }), 'respaldo.jpg');
    expect(await codigoDe(verificarSetPreparado(form))).toBe('adminError.foto.pesada');
  });
});

/** Todo nombre resuelve a una IP pública de documentación (RFC 5737). */
const dnsPublico = async () => ['203.0.113.10', '2001:db8::10'];

describe('descargarImagen (las URLs de la planilla)', () => {
  const jpeg = async () => new Uint8Array(await (await codificar(50, 40, 'jpeg')).arrayBuffer());

  it('sólo https, sin credenciales ni hosts privados', () => {
    for (const malo of [
      'http://cdn.test/a.jpg',
      'https://user:pass@cdn.test/a.jpg',
      'https://localhost/a.jpg',
      'https://127.0.0.1/a.jpg',
      'https://10.0.0.5/a.jpg',
      'https://192.168.1.10/a.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a.jpg',
      'ftp://cdn.test/a.jpg',
      'no es una url',
    ]) {
      expect(() => urlPermitida(malo), malo).toThrow(DescargaError);
    }
    expect(urlPermitida('https://cdn.tienda.com/a.jpg').hostname).toBe('cdn.tienda.com');
  });

  it('baja la imagen y sigue redirecciones https, revisando cada una', async () => {
    const bytes = await jpeg();
    const fetchImpl = vi.fn(async (url: string) =>
      url === 'https://cdn.test/a.jpg'
        ? new Response(null, { status: 302, headers: { location: '/b.jpg' } })
        : new Response(bytes as BodyInit, { status: 200 }),
    );
    expect(await descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico })).toEqual(bytes);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
    // Las redirecciones se siguen a mano, nunca solas.
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('manual');
  });

  it('una redirección a un host privado o a http se corta', async () => {
    for (const destino of ['http://cdn.test/b.jpg', 'https://127.0.0.1/b.jpg']) {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 301, headers: { location: destino } }));
      await expect(
        descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico }),
      ).rejects.toThrow(DescargaError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('demasiadas redirecciones se cortan', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: `/r${++n}` } }));
    await expect(
      descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico, maxRedirects: 2 }),
    ).rejects.toThrow('demasiadas redirecciones');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('el tope de bytes se aplica al leer, aunque el Content-Length mienta', async () => {
    const grande = new Uint8Array(2048);
    grande.set(await jpeg());
    const fetchImpl = vi.fn(async () => new Response(grande as BodyInit, { status: 200, headers: { 'content-length': '10' } }));
    await expect(
      descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico, maxBytes: 1024 }),
    ).rejects.toThrow(/pesa más de/);
  });

  it('un 200 que no es una imagen no pasa', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>no encontrado</html>', { status: 200 }));
    await expect(
      descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico }),
    ).rejects.toThrow('no es una imagen JPG, PNG, WebP o GIF');
  });

  it('un error HTTP se dice con su status', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 404 }));
    await expect(
      descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver: dnsPublico }),
    ).rejects.toThrow('el servidor respondió HTTP 404');
  });
});

describe('descargarImagen resuelve el nombre antes de cada pedido', () => {
  const imagen = async () => new Uint8Array(await (await codificar(20, 20, 'jpeg')).arrayBuffer());

  it.each([
    ['una IPv4 privada', ['10.1.2.3']],
    ['loopback IPv6', ['::1']],
    ['loopback IPv4 mapeada en IPv6', ['::ffff:127.0.0.1']],
    ['link-local mapeada en hex', ['::ffff:a9fe:a9fe']],
    ['CGNAT', ['100.64.0.7']],
    ['única local IPv6', ['fd12:3456::1']],
    ['no especificada', ['0.0.0.0']],
    ['multicast IPv6', ['ff02::1']],
    ['una pública y una privada mezcladas', ['203.0.113.10', '192.168.0.5']],
  ])('un nombre público que resuelve a %s se rechaza sin pedir nada', async (_caso, direcciones) => {
    const fetchImpl = vi.fn();
    await expect(
      descargarImagen('https://fotos.proveedor.test/a.jpg', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolver: async () => direcciones,
      }),
    ).rejects.toThrow('el nombre resuelve a una dirección local o privada');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('una redirección a un nombre que resuelve adentro se corta en ese salto', async () => {
    const bytes = await imagen();
    const fetchImpl = vi.fn(async (url: string) =>
      url.startsWith('https://cdn.test/')
        ? new Response(null, { status: 302, headers: { location: 'https://interno.proveedor.test/x.jpg' } })
        : new Response(bytes as BodyInit, { status: 200 }),
    );
    const resolver = vi.fn(async (host: string) => (host === 'cdn.test' ? ['203.0.113.10'] : ['127.0.0.1']));
    await expect(
      descargarImagen('https://cdn.test/a.jpg', { fetchImpl: fetchImpl as unknown as typeof fetch, resolver }),
    ).rejects.toThrow('el nombre resuelve a una dirección local o privada');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls.map(([h]) => h)).toEqual(['cdn.test', 'interno.proveedor.test']);
  });

  it('un nombre que no resuelve no se pide', async () => {
    const fetchImpl = vi.fn();
    await expect(
      descargarImagen('https://no-existe.test/a.jpg', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolver: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).rejects.toThrow('el nombre no resuelve');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ipNoPublica: las públicas pasan, todas las formas de las privadas no', () => {
    for (const publica of ['203.0.113.10', '8.8.8.8', '2001:db8::1', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(ipNoPublica(publica), publica).toBe(false);
    }
    for (const privada of [
      '127.0.0.1', '10.0.0.1', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.100.0.1', '255.255.255.255',
      '::', '::1', '[::1]', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:c0a8:101::1',
      'fe80::1', 'fc00::1', 'ff05::2', 'no-es-ip',
    ]) {
      expect(ipNoPublica(privada), privada).toBe(true);
    }
  });
});
