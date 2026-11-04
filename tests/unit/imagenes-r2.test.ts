import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { infoImagen, sniffFormato } from '../../src/lib/imagen-bytes';
import {
  boxesFor,
  esRefR2,
  formatRef,
  fuentesR2,
  jpegKeyFor,
  keyFor,
  normalizarBasePublica,
  parseRef,
  planImagen,
  slugParaClave,
  urlR2,
} from '../../src/lib/imagenes-r2';
import { prepararDesdeOriginal, subirSetImagen } from '../../src/lib/r2-imagenes';
import { crearClienteR2 } from '../../src/lib/r2';
import { CONFIG_FALSA, crearR2Falso } from '../helpers/r2-falso';

/**
 * El formato `p1` de las fotos públicas en R2 (`src/lib/imagenes-r2.ts`): la
 * referencia que se guarda en la base, las claves que se derivan de ella y
 * las URLs que dibuja la vidriera. Es el contrato entre la subida del panel,
 * la importación, los scripts de carga masiva y la migración: si una deriva
 * distinto, una foto queda apuntando a un objeto que no existe.
 */

const SHA = 'a'.repeat(10) + 'b'.repeat(54);
const BASE = 'https://img.tienda.test';

describe('la referencia r2:p1', () => {
  it('ida y vuelta', () => {
    const ref = formatRef('remera-azul-0123456789', 1200, 900);
    expect(ref).toBe('r2:p1/remera-azul-0123456789@1200x900');
    expect(parseRef(ref)).toEqual({ base: 'remera-azul-0123456789', width: 1200, height: 900 });
  });

  it('cualquier cosa que no sea una referencia válida es null (placeholder, nunca URL rota)', () => {
    for (const malo of [
      null,
      undefined,
      '',
      'productos/remera-azul',
      'r2:p1/remera-azul@1200x900',
      'r2:p1/Remera-0123456789@1200x900',
      'r2:p1/remera-0123456789@0x900',
      'r2:p1/remera-0123456789@1200x900 ',
      'r2:p1/../secreto-0123456789@1x1',
      'r2:comprobantes/abc/PY-1.jpg',
      `r2:p1/${'a'.repeat(81)}-0123456789@1x1`,
    ]) {
      expect(parseRef(malo), String(malo)).toBeNull();
      expect(esRefR2(malo)).toBe(false);
      expect(urlR2(malo, 'card', BASE)).toBeNull();
      expect(fuentesR2(malo, BASE)).toBeNull();
    }
  });

  it('sin base pública no hay URL', () => {
    expect(urlR2('r2:p1/remera-0123456789@1200x900', 'card', null)).toBeNull();
  });
});

describe('las claves', () => {
  it('un WebP por caja, sin agrandar, y el JPEG de respaldo', () => {
    expect(boxesFor(1200, 900)).toEqual([240, 480, 800, 1200]);
    expect(boxesFor(1000, 1000)).toEqual([240, 480, 800, 1000]);
    expect(boxesFor(820, 600)).toEqual([240, 480, 800]);
    expect(boxesFor(200, 100)).toEqual([200]);
    expect(keyFor('remera-0123456789', 480)).toBe('p1/remera-0123456789-480.webp');
    expect(jpegKeyFor('remera-0123456789')).toBe('p1/remera-0123456789.jpg');
  });

  it('planImagen: el hash del contenido va en la clave, así nunca se pisa', () => {
    const plan = planImagen('remera-azul', SHA, 1200, 900)!;
    expect(plan.ref).toBe('r2:p1/remera-azul-aaaaaaaaaa@1200x900');
    expect(plan.objects.map((o) => [o.key, o.width, o.height])).toEqual([
      ['p1/remera-azul-aaaaaaaaaa-240.webp', 240, 180],
      ['p1/remera-azul-aaaaaaaaaa-480.webp', 480, 360],
      ['p1/remera-azul-aaaaaaaaaa-800.webp', 800, 600],
      ['p1/remera-azul-aaaaaaaaaa-1200.webp', 1200, 900],
      ['p1/remera-azul-aaaaaaaaaa.jpg', 1200, 900],
    ]);
    // Otro contenido, otra clave.
    expect(planImagen('remera-azul', 'c'.repeat(64), 1200, 900)!.ref).not.toBe(plan.ref);
    // Un slug o un hash con forma rara no planifican nada.
    expect(planImagen('Remera Azul', SHA, 1200, 900)).toBeNull();
    expect(planImagen('remera', 'xyz', 1200, 900)).toBeNull();
  });

  it('slugParaClave limpia lo que escribió una persona', () => {
    expect(slugParaClave('Remera Azul Ñandú — talle M')).toBe('remera-azul-nandu-talle-m');
    expect(slugParaClave('🔥🔥', 'producto')).toBe('producto');
    expect(slugParaClave('x'.repeat(120)).length).toBeLessThanOrEqual(80);
  });
});

describe('las URLs', () => {
  const ref = 'r2:p1/remera-0123456789@1200x900';

  it('cada tamaño elige su caja', () => {
    expect(urlR2(ref, 'thumb', BASE)).toBe(`${BASE}/p1/remera-0123456789-240.webp`);
    expect(urlR2(ref, 'card', BASE)).toBe(`${BASE}/p1/remera-0123456789-480.webp`);
    expect(urlR2(ref, 'detail', BASE)).toBe(`${BASE}/p1/remera-0123456789-1200.webp`);
    expect(urlR2(ref, 'og', BASE)).toBe(`${BASE}/p1/remera-0123456789.jpg`);
    // Una foto chica: la caja preferida no existe, se usa la más grande que hay.
    expect(urlR2('r2:p1/chica-0123456789@200x200', 'card', BASE)).toBe(`${BASE}/p1/chica-0123456789-200.webp`);
  });

  it('el srcset lleva el ancho real de cada archivo y el JPEG va aparte', () => {
    const fuentes = fuentesR2(ref, BASE)!;
    expect(fuentes.srcSet).toBe(
      [240, 480, 800, 1200].map((b) => `${BASE}/p1/remera-0123456789-${b}.webp ${b}w`).join(', '),
    );
    expect(fuentes.jpeg).toBe(`${BASE}/p1/remera-0123456789.jpg`);
    expect([fuentes.width, fuentes.height]).toEqual([1200, 900]);
  });

  it('la base pública: sólo https, sin credenciales ni query, sin barra final', () => {
    expect(normalizarBasePublica('https://img.tienda.test/')).toBe('https://img.tienda.test');
    expect(normalizarBasePublica('  https://pub-123.r2.dev  ')).toBe('https://pub-123.r2.dev');
    for (const malo of ['', 'http://img.tienda.test', 'https://u:p@img.test', 'https://img.test/?x=1', 'img.test', 'https://img.test/#a']) {
      expect(normalizarBasePublica(malo), malo).toBeNull();
    }
  });
});

describe('los bytes deciden, no el navegador', () => {
  it('JPEG, PNG y WebP: formato y dimensiones de la cabecera', async () => {
    const lienzo = () => sharp({ create: { width: 321, height: 123, channels: 4, background: '#33669980' } });
    const jpeg = new Uint8Array(await lienzo().jpeg().toBuffer());
    const png = new Uint8Array(await lienzo().png().toBuffer());
    const webp = new Uint8Array(await lienzo().webp().toBuffer());
    const webpSinPerdida = new Uint8Array(await lienzo().webp({ lossless: true }).toBuffer());
    const webpOpaco = new Uint8Array(await lienzo().flatten().webp().toBuffer());
    expect(infoImagen(jpeg)).toEqual({ format: 'jpeg', width: 321, height: 123 });
    expect(infoImagen(png)).toEqual({ format: 'png', width: 321, height: 123 });
    expect(infoImagen(webp)).toEqual({ format: 'webp', width: 321, height: 123 });
    expect(infoImagen(webpSinPerdida)).toEqual({ format: 'webp', width: 321, height: 123 });
    expect(infoImagen(webpOpaco)).toEqual({ format: 'webp', width: 321, height: 123 });
  });

  it('un SVG, un HTML o un archivo truncado no son imágenes', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffFormato(svg)).toBeNull();
    expect(infoImagen(new TextEncoder().encode('<html>hola</html>'))).toBeNull();
    const jpeg = new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer());
    expect(infoImagen(jpeg.slice(0, 8))).toBeNull();
    // "RIFF" sin "WEBP" no es WebP.
    expect(sniffFormato(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]))).toBeNull();
  });
});

describe('el pipeline del servidor (importación, migración, carga masiva)', () => {
  it('achica a 1200, deriva las cajas, y se sube con claves inmutables', async () => {
    const original = new Uint8Array(
      await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#a0522d' } })
        .jpeg()
        .toBuffer(),
    );
    const set = await prepararDesdeOriginal(original);
    expect([set.width, set.height]).toEqual([1200, 800]);
    expect(set.objetos.map((o) => [o.format, o.width, o.height])).toEqual([
      ['webp', 240, 160],
      ['webp', 480, 320],
      ['webp', 800, 533],
      ['webp', 1200, 800],
      ['jpeg', 1200, 800],
    ]);
    for (const objeto of set.objetos) {
      expect(infoImagen(objeto.bytes)).toEqual({ format: objeto.format, width: objeto.width, height: objeto.height });
    }

    const r2 = crearR2Falso();
    const cliente = crearClienteR2(CONFIG_FALSA, { fetchImpl: r2.fetch });
    const ref = await subirSetImagen(cliente, set, 'Remera Azul');
    expect(ref).toMatch(/^r2:p1\/remera-azul-[0-9a-f]{10}@1200x800$/);
    expect([...r2.objetos.keys()].sort()).toEqual(
      planImagen('remera-azul', set.sha256, 1200, 800)!.objects.map((o) => o.key).sort(),
    );
    // Todos con If-None-Match: una clave nunca se pisa.
    expect(r2.pedidos.every((p) => p.method !== 'PUT' || p.headers.get('if-none-match') === '*')).toBe(true);
    // El JPEG es el último: si algo falla antes, no hay referencia que guardar.
    expect(r2.pedidos.at(-1)!.url).toMatch(/\.jpg$/);

    // La misma foto otra vez: misma clave, R2 contesta 412 y cuenta como éxito.
    expect(await subirSetImagen(cliente, set, 'Remera Azul')).toBe(ref);
  });

  it('un archivo que no es imagen no entra al pipeline', async () => {
    await expect(prepararDesdeOriginal(new TextEncoder().encode('<svg/>'))).rejects.toThrow('FORMATO');
  });
});
