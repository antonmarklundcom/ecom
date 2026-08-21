import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TIENDA, cuentasClientesHabilitadas } from '@/config/tienda';

import { exportedAsyncFunctions, listSourceFiles, readCode } from '../helpers/source';

/**
 * **Guardarraíl 1 del PLAN.md, en CI**: con todos los flags apagados la tienda
 * se comporta exactamente como antes de la FASE 2.
 *
 * Este es el test que el plan pide en el PR E, y la razón por la que existe es
 * concreta: el template se instala en tiendas que **no** quieren cuentas de
 * cliente, y esas tiendas tienen que poder actualizarse sin que les aparezca
 * un "Entrar" en el header ni una ruta nueva. Un flag que "está apagado" pero
 * cuya feature igual se filtra en tres lugares no es un flag, es una promesa.
 *
 * Cubre las dos mitades del problema:
 *
 * 1. **El default es apagado** — lo que se instala de fábrica.
 * 2. **Todo lo nuevo consulta el flag** antes de existir: las páginas de
 *    `/cuenta`, los componentes que la vidriera renderiza, y cada server
 *    action de la feature. Se verifica sobre el código, no sobre una lista
 *    escrita a mano, así que un archivo nuevo entra solo al control.
 */

const FLAG = /cuentasClientesHabilitadas\s*\(/;

describe('flags apagados = la tienda de hoy', () => {
  it('el default que se instala tiene las cuentas de cliente apagadas', () => {
    expect(TIENDA.cuentasClientes).toBe(false);
    expect(cuentasClientesHabilitadas()).toBe(false);
  });

  it('toda la rama /cuenta está detrás del flag', async () => {
    const files = await listSourceFiles([path.join('src', 'app', 'cuenta')]);
    expect(files.length).toBeGreaterThan(0);

    // Alcanza con que el layout lo mire —404 tapa toda la rama—, pero cada
    // página que se agregue tiene que colgar de ese layout. Eso es lo que se
    // verifica: que exista el layout y que sea el que corta.
    const layout = path.join('src', 'app', 'cuenta', 'layout.tsx');
    expect(files).toContain(layout);

    const code = await readCode(layout);
    expect(code).toMatch(FLAG);
    expect(code).toContain('notFound');
  });

  it('cada server action de cuenta mira el flag antes de tocar nada', async () => {
    const actionsModule = path.join('src', 'app', 'actions', 'cuenta.ts');
    const code = await readCode(actionsModule);

    const offenders: string[] = [];
    for (const action of exportedAsyncFunctions(code)) {
      const flagAt = action.body.search(FLAG);
      if (flagAt === -1) {
        offenders.push(`${action.name}(): no mira el flag`);
        continue;
      }
      // Antes de leer la entrada y antes del guard de sesión: una acción de
      // una feature apagada no tiene por qué validar nada ni abrir la DB.
      const workAt = action.body.search(/\.safeParse\s*\(|requireCustomerSession\s*\(/);
      if (workAt !== -1 && workAt < flagAt) {
        offenders.push(`${action.name}(): hace trabajo antes de mirar el flag`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('todo componente de cuenta que la vidriera renderiza devuelve null sin el flag', async () => {
    // Los que se montan desde el header o la página del pedido: son los que
    // pueden filtrar la feature a una tienda que no la quiere. Los formularios
    // sólo se renderizan adentro de /cuenta, que ya está tapado por el layout.
    const montadosEnLaVidriera = [
      path.join('src', 'components', 'cuenta', 'header-entry.tsx'),
      path.join('src', 'components', 'cuenta', 'guardar-datos.tsx'),
    ];

    for (const file of montadosEnLaVidriera) {
      const code = await readCode(file);
      expect(code, `${file} no consulta el flag`).toMatch(FLAG);
      expect(code, `${file} no corta con null`).toMatch(/return null/);
    }
  });

  it('el checkout de invitado no depende de la feature', async () => {
    // Lo que el plan protege con más énfasis: la cuenta es un upsell, jamás
    // una pared. Nada del camino de compra puede *exigir* sesión de cliente.
    const checkout = await readCode(path.join('src', 'app', 'actions', 'checkout.ts'));

    expect(checkout).not.toMatch(/requireCustomerSession/);
    // Sí puede *leerla* para prefills y para atar el pedido: eso es
    // `currentCustomer()`, que devuelve null sin sesión y nunca tira.
    expect(checkout).toMatch(/currentCustomer\s*\(/);
  });

  it('el panel sólo consulta cuentas si la feature está prendida', async () => {
    const clientes = await readCode(
      path.join('src', 'app', 'admin', '(panel)', 'clientes', 'page.tsx'),
    );
    expect(clientes).toMatch(FLAG);
  });
});
