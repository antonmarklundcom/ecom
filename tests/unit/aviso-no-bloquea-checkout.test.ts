import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readCode, stripComments } from '../helpers/source';

/**
 * Guardarraíl del aviso de pedido nuevo (fable/plan.md §5.2).
 *
 * La regla: el aviso al comercio **no puede demorar ni hacer fallar el
 * checkout**. `notifyOwnerNewOrder` ya está escrita para no tirar nunca, pero
 * eso no alcanza: un `await` puesto de buena fe en el checkout le sumaría al
 * pedido de la compradora los segundos que tarde Meta en contestar, y en un
 * timeout serían diez.
 *
 * Esto no se ve en ningún test de comportamiento —el pedido igual se crea— así
 * que se verifica sobre el código, como el resto de las reglas que se pierden
 * cuando alguien "ordena" un archivo.
 */
const CHECKOUT = path.join('src', 'app', 'actions', 'checkout.ts');

describe('el aviso al comercio no bloquea el checkout', () => {
  it('el checkout llama a notifyOwnerNewOrder sin await', async () => {
    const code = stripComments(await readCode(CHECKOUT));

    expect(code).toContain('notifyOwnerNewOrder');
    expect(code).toMatch(/void\s+notifyOwnerNewOrder\s*\(/);
    expect(code).not.toMatch(/await\s+notifyOwnerNewOrder\s*\(/);
  });

  it('la promesa suelta lleva su .catch(): un rechazo sin manejar tumba el proceso', async () => {
    const code = stripComments(await readCode(CHECKOUT));

    expect(code).toMatch(/void\s+notifyOwnerNewOrder\s*\([^)]*\)\s*\.catch\s*\(/);
  });

  it('el aviso se dispara después de createOrder, no antes', async () => {
    const code = stripComments(await readCode(CHECKOUT));

    expect(code.indexOf('await createOrder(')).toBeGreaterThan(-1);
    expect(code.indexOf('notifyOwnerNewOrder(')).toBeGreaterThan(code.indexOf('await createOrder('));
  });
});
