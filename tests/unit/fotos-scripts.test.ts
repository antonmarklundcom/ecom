import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  FotosError,
  itemsParaReparar,
  leerCatalogo,
  parsearManifiesto,
  parsearOpciones,
  reescribirCsv,
  totales,
  type FotoManifiesto,
} from '../../scripts/fotos-lib';
import {
  idLegacyValido,
  parseArgs,
  urlComprobanteFirmada,
  urlPublicaLegacy,
} from '../../scripts/fotos-migrar-cloudinary';
import { planImagen } from '../../src/lib/imagenes-r2';

/**
 * Los scripts de carga masiva (`pnpm fotos:preparar` / `fotos:subir` /
 * `fotos:reparar`) y la migración única desde Cloudinary
 * (`pnpm fotos:migrar-cloudinary`), en su parte pura: sin red ni base.
 */

const CSV = [
  'SKU;Producto;Categoría;Variante;Precio (₲);Stock;Fotos;Notas',
  'REM-S;Remera azul;Moda;S;100000;3;https://cdn.test/a.jpg|https://cdn.test/b.jpg;nota 1',
  'REM-M;Remera azul;Moda;M;100000;2;;nota 2',
  'TAZ-1;Taza;Hogar;Única;50000;1;https://cdn.test/t.jpg;',
].join('\n');

function manifiestoDe(): FotoManifiesto {
  const sha = 'd'.repeat(64);
  const plan = planImagen('remera-azul', sha, 1200, 900)!;
  return {
    version: 1,
    policy: 'p1',
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
    productos: [
      { slug: 'remera-azul', nombre: 'Remera azul', skus: ['REM-S', 'REM-M'], fuentes: ['https://cdn.test/a.jpg'] },
      { slug: 'taza', nombre: 'Taza', skus: ['TAZ-1'], fuentes: ['https://cdn.test/t.jpg'] },
    ],
    fotos: [
      {
        slug: 'remera-azul',
        posicion: 0,
        fuente: 'https://cdn.test/a.jpg',
        estado: 'ok',
        error: null,
        sha256: sha,
        width: 1200,
        height: 900,
        ref: plan.ref,
        objetos: plan.objects.map((o) => ({
          key: o.key,
          format: o.format,
          width: o.width,
          height: o.height,
          bytes: 100,
          sha256: createHash('sha256').update(o.key).digest('hex'),
          subido: false,
        })),
      },
      {
        slug: 'taza',
        posicion: 0,
        fuente: 'https://cdn.test/t.jpg',
        estado: 'fallo',
        error: 'el servidor respondió HTTP 404',
        sha256: null,
        width: null,
        height: null,
        ref: null,
        objetos: [],
      },
    ],
  };
}

describe('fotos-lib', () => {
  it('lee la planilla agrupando variantes por producto y conserva todas las columnas', () => {
    const catalogo = leerCatalogo(CSV);
    expect(catalogo.productos.map((p) => [p.slug, p.skus, p.fuentes])).toEqual([
      ['remera-azul', ['REM-S', 'REM-M'], ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']],
      ['taza', ['TAZ-1'], ['https://cdn.test/t.jpg']],
    ]);
    expect(leerCatalogo(CSV, ['TAZ-1']).productos.map((p) => p.slug)).toEqual(['taza']);
    expect(() => leerCatalogo(CSV, ['NO-EXISTE'])).toThrow(FotosError);
  });

  it('reescribe la columna Fotos con las referencias r2, sólo en la primera fila', () => {
    const manifiesto = manifiestoDe();
    const csv = reescribirCsv(leerCatalogo(CSV), manifiesto.fotos);
    const ref = manifiesto.fotos[0]!.ref!;
    expect(csv).toContain(`REM-S;Remera azul;Moda;S;100000;3;${ref};nota 1`);
    expect(csv).toContain('REM-M;Remera azul;Moda;M;100000;2;;nota 2');
    // La taza no tiene ninguna foto lista: no entra.
    expect(csv).not.toContain('TAZ-1');
  });

  it('un manifiesto editado a mano con una clave que no es la de su contenido se rechaza', () => {
    expect(parsearManifiesto(manifiestoDe())).toBeTruthy();
    const malo = manifiestoDe();
    malo.fotos[0]!.objetos[0]!.key = 'p1/otra-cosa-0123456789-240.webp';
    expect(() => parsearManifiesto(malo)).toThrow('MANIFIESTO_INVALIDO');
    const sinPlan = manifiestoDe();
    sinPlan.fotos[0]!.objetos.pop();
    expect(() => parsearManifiesto(sinPlan)).toThrow('MANIFIESTO_INVALIDO');
  });

  it('reparar exige que todo esté subido', () => {
    const manifiesto = manifiestoDe();
    expect(() => itemsParaReparar(manifiesto, 'remera-azul')).toThrow('FALTA_SUBIR_OBJETOS');
    for (const o of manifiesto.fotos[0]!.objetos) o.subido = true;
    expect(itemsParaReparar(manifiesto, 'remera-azul')).toEqual([
      { ref: manifiesto.fotos[0]!.ref, alt: 'Remera azul' },
    ]);
    expect(() => itemsParaReparar(manifiesto, 'taza')).toThrow('SIN_FOTOS_LISTAS');
    expect(totales(manifiesto)).toMatchObject({ fotosListas: 1, fotosFallidas: 1, objetos: 5, subidos: 5, pendientes: 0 });
  });

  it('las opciones de la línea de comandos', () => {
    expect([...parsearOpciones(['--', '--csv', 'a.csv', '--aplicar'], ['--csv'], ['--aplicar'])]).toEqual([
      ['--csv', 'a.csv'],
      ['--aplicar', 'true'],
    ]);
    expect(() => parsearOpciones(['--borrar-todo'], [], [])).toThrow(FotosError);
    expect(() => parsearOpciones([], ['--csv'])).toThrow('FALTA --csv');
  });
});

describe('fotos:migrar-cloudinary', () => {
  it('ensayo por defecto; las credenciales de comprobantes van juntas', () => {
    expect(parseArgs(['--', '--cloud', 'tienda-vieja'])).toEqual({
      cloud: 'tienda-vieja',
      aplicar: false,
      apiKey: null,
      apiSecret: null,
    });
    expect(parseArgs(['--cloud', 'x', '--aplicar']).aplicar).toBe(true);
    expect(() => parseArgs([])).toThrow(/--cloud/);
    expect(() => parseArgs(['--cloud', 'mala/nube'])).toThrow(/--cloud/);
    expect(() => parseArgs(['--cloud', 'x', '--api-key', 'k'])).toThrow(/van juntos/);
    expect(() => parseArgs(['--cloud', 'x', '--otra'])).toThrow(/no conozco/);
  });

  it('la URL pública es la del original, sin transformaciones', () => {
    expect(urlPublicaLegacy('tienda-vieja', 'productos/remera azul')).toBe(
      'https://res.cloudinary.com/tienda-vieja/image/upload/productos/remera%20azul',
    );
    expect(idLegacyValido('productos/remera-azul')).toBe(true);
    for (const malo of ['', '../x', 'a//b', '/abs', 'x?y=1', 'r2:p1/x']) expect(idLegacyValido(malo), malo).toBe(false);
  });

  it('la descarga firmada de un comprobante: SHA-1 de los parámetros ordenados más el secret', () => {
    const url = new URL(
      urlComprobanteFirmada('tienda-vieja', '1234', 'secreto', 'comprobantes/PY-000001-1', new Date('2026-11-04T00:00:00Z'), 300),
    );
    expect(url.origin + url.pathname).toBe('https://api.cloudinary.com/v1_1/tienda-vieja/image/download');
    const ts = String(Date.parse('2026-11-04T00:00:00Z') / 1000);
    const esperada = createHash('sha1')
      .update(`expires_at=${Number(ts) + 300}&public_id=comprobantes/PY-000001-1&timestamp=${ts}&type=authenticated` + 'secreto')
      .digest('hex');
    expect(url.searchParams.get('signature')).toBe(esperada);
    expect(url.searchParams.get('api_key')).toBe('1234');
    expect(url.toString()).not.toContain('secreto');
  });
});
