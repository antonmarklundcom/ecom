import { describe, expect, it } from 'vitest';

import {
  MAX_AVISOS_DUPLICADOS,
  catalogDuplicateWarnings,
  nombreNormalizado,
  type ProductoEntrante,
} from '../../src/domain/catalog-duplicates';

/**
 * Los posibles productos repetidos de una planilla: señales para que el dueño
 * mire antes de confirmar, no errores. Lo que se fija: que aparezcan las que
 * importan (mismo nombre con otro slug, nombre casi igual en la misma
 * categoría, slug que ya existe sin ningún SKU en común, foto o enlace de
 * proveedor compartido) y que no aparezcan las que no (el mismo producto que
 * se actualiza, nombres parecidos en categorías distintas).
 */

function entrante(extra: Partial<ProductoEntrante> & { slug: string; name: string }): ProductoEntrante {
  return { categoryName: 'Mate', fotos: [], skus: [`${extra.slug}-1`], ...extra };
}

describe('catalogDuplicateWarnings', () => {
  it('un catálogo sin parecidos no avisa nada', () => {
    expect(
      catalogDuplicateWarnings(
        [entrante({ slug: 'termo', name: 'Termo de acero 1 L' }), entrante({ slug: 'guampa', name: 'Guampa de palo santo' })],
        [{ slug: 'bombilla', name: 'Bombilla de alpaca', categoryName: 'Mate', skus: ['B-1'] }],
      ),
    ).toEqual([]);
  });

  it('el mismo nombre con otro slug, contra la tienda o dentro de la planilla', () => {
    const avisos = catalogDuplicateWarnings(
      [entrante({ slug: 'remera-basica', name: 'Remera Básica' }), entrante({ slug: 'remera-2', name: 'remera basica' })],
      [{ slug: 'remera-basica-vieja', name: 'REMERA  BASICA', categoryName: 'Moda', skus: ['R-1'] }],
    );
    expect(avisos.filter((aviso) => aviso.includes('mismo nombre'))).toHaveLength(3);
  });

  it('nombres casi iguales en la misma categoría, sí; en otra categoría, no', () => {
    const avisos = catalogDuplicateWarnings(
      [entrante({ slug: 'termo-inox-1l', name: 'Termo inoxidable 1 litro negro' })],
      [
        { slug: 'termo-negro', name: 'Termos inoxidable negro 1 litro', categoryName: 'Mate', skus: ['T-1'] },
        { slug: 'otro', name: 'Termo inoxidable 1 litro negro (repuesto)', categoryName: 'Repuestos', skus: ['X-1'] },
      ],
    );
    expect(avisos).toEqual([expect.stringContaining('muy parecidos')]);
    expect(avisos[0]).toContain('Termos inoxidable negro 1 litro');
  });

  it('el mismo slug de un producto existente con SKU en común es una actualización: no avisa', () => {
    expect(
      catalogDuplicateWarnings(
        [entrante({ slug: 'termo', name: 'Termo', skus: ['T-1', 'T-2'] })],
        [{ slug: 'termo', name: 'Termo', categoryName: 'Mate', skus: ['t-1'] }],
      ),
    ).toEqual([]);
  });

  it('el mismo slug sin ningún SKU en común: se van a sumar variantes a otro producto', () => {
    const avisos = catalogDuplicateWarnings(
      [entrante({ slug: 'termo', name: 'Termo', skus: ['NUEVO-1'] })],
      [{ slug: 'termo', name: 'Termo', categoryName: 'Mate', skus: ['VIEJO-1'] }],
    );
    expect(avisos).toEqual([expect.stringContaining('ya existe en la tienda')]);
  });

  it('una foto compartida entre dos productos de la planilla, aunque cambie el parámetro', () => {
    const avisos = catalogDuplicateWarnings(
      [
        entrante({ slug: 'a', name: 'Canasta grande', fotos: ['https://cdn.example.com/canasta.jpg?w=800'] }),
        entrante({ slug: 'b', name: 'Bolso matero', categoryName: 'Moda', fotos: ['https://cdn.example.com/canasta.jpg'] }),
      ],
      [],
    );
    expect(avisos).toEqual([expect.stringContaining('comparten una foto')]);
  });

  it('la misma URL de proveedor en dos productos', () => {
    const avisos = catalogDuplicateWarnings(
      [entrante({ slug: 'ventilador', name: 'Ventilador de pie', supplierUrl: 'https://proveedor.example.com/v18' })],
      [
        {
          slug: 'ventilador-18',
          name: 'Ventilador 18"',
          categoryName: 'Electrónica',
          skus: ['V-1'],
          supplierUrl: 'https://proveedor.example.com/v18',
        },
      ],
    );
    expect(avisos).toEqual([expect.stringContaining('URL de proveedor')]);
  });

  it('cada par se avisa una vez y la lista tiene techo', () => {
    const muchos = Array.from({ length: MAX_AVISOS_DUPLICADOS + 10 }, (_, i) =>
      entrante({ slug: `p-${i}`, name: 'Mismo nombre' }),
    );
    const avisos = catalogDuplicateWarnings(muchos, []);
    expect(avisos).toHaveLength(MAX_AVISOS_DUPLICADOS + 1);
    expect(avisos.at(-1)).toContain('coincidencias más');
    expect(new Set(avisos).size).toBe(avisos.length);
  });

  it('nombreNormalizado ignora mayúsculas, acentos y signos', () => {
    expect(nombreNormalizado('  Camisa de Ao Po\'i — Bordada ')).toBe('camisa de ao po i bordada');
  });
});
