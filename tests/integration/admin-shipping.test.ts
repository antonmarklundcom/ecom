import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AdminShippingError,
  createShippingZone,
  listAdminShippingZones,
  setShippingZoneActive,
  updateShippingZone,
} from '@/domain/admin-shipping';
import { quoteShipping } from '@/domain/shipping';

import { closeTestDb, hasTestDb, resetTables } from '../helpers/db';

/**
 * `/admin/envios` (PLAN.md FASE 2, PR K).
 *
 * Es plata: `quoteShipping()` lee de esta tabla y el total del pedido la suma.
 * Los tests van de a pares — se escribe desde el ABM y se lee desde la
 * cotización, que es el único camino que le importa a quien compra.
 */

const ZONA = {
  name: 'Gran Asunción',
  cities: ['Asunción', 'Lambaré', 'Fernando de la Mora'],
  pricePyg: 25_000,
};

describe.skipIf(!hasTestDb)('ABM de zonas de envío', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it('lo que se crea acá es lo que cotiza el checkout', async () => {
    await createShippingZone(ZONA);

    const quote = await quoteShipping('asuncion', 100_000);
    expect(quote).toMatchObject({ shippingPyg: 25_000, match: 'exacta', isFree: false });
  });

  it('la ciudad se compara sin acentos ni mayúsculas', async () => {
    await createShippingZone(ZONA);

    const quote = await quoteShipping('FERNANDO DE LA MORA', 100_000);
    expect(quote.match).toBe('exacta');
  });

  it('no guarda la misma ciudad dos veces', async () => {
    await createShippingZone({ ...ZONA, cities: ['Asunción', 'asuncion', 'ASUNCIÓN'] });

    const [zone] = await listAdminShippingZones();
    expect(zone!.cities).toEqual(['Asunción']);
  });

  it('un precio con decimales no entra', async () => {
    await expect(createShippingZone({ ...ZONA, pricePyg: 25_000.5 })).rejects.toThrow();
  });

  it('un umbral de ₲0 se rechaza con la explicación, no en silencio', async () => {
    await expect(createShippingZone({ ...ZONA, freeThresholdPyg: 0 })).rejects.toThrow(
      AdminShippingError,
    );
  });

  it('el umbral de envío gratis se aplica desde el subtotal exacto', async () => {
    await createShippingZone({ ...ZONA, freeThresholdPyg: 500_000 });

    expect((await quoteShipping('asuncion', 499_999)).isFree).toBe(false);
    expect((await quoteShipping('asuncion', 500_000)).isFree).toBe(true);
  });

  it('no deja dos zonas con el mismo identificador', async () => {
    await createShippingZone(ZONA);
    await expect(createShippingZone(ZONA)).rejects.toThrow(AdminShippingError);
  });

  it('editar la tarifa cambia lo que se cobra de ahí en adelante', async () => {
    const id = await createShippingZone(ZONA);
    await updateShippingZone(id, { ...ZONA, pricePyg: 30_000 });

    expect((await quoteShipping('asuncion', 100_000)).shippingPyg).toBe(30_000);
  });

  it('desactivar una zona la saca de la cotización pero no la borra', async () => {
    const gran = await createShippingZone(ZONA);
    await createShippingZone({ name: 'Interior', cities: ['Encarnación'], pricePyg: 60_000 });

    await setShippingZoneActive(gran, false);

    // Asunción ya no cae en ninguna zona activa: paga la más cara de las que
    // quedan, y la cotización lo dice.
    const quote = await quoteShipping('asuncion', 100_000);
    expect(quote).toMatchObject({ shippingPyg: 60_000, match: 'mas_cara' });

    // Sigue en la tabla: los pedidos viejos la nombran por id.
    expect(await listAdminShippingZones()).toHaveLength(2);
  });

  it('sin zonas activas la tienda deja de cobrar envío', async () => {
    const id = await createShippingZone(ZONA);
    await setShippingZoneActive(id, false);

    const quote = await quoteShipping('asuncion', 100_000);
    expect(quote).toMatchObject({ shippingPyg: 0, match: 'sin_zonas', isFree: true });
  });
});
