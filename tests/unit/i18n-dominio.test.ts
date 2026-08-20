import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEXTOS } from '@/i18n';
import { listSourceFiles, readCode } from '../helpers/source';

/**
 * Los errores del dominio no llevan prosa (PLAN.md FASE 2, PR S).
 *
 * El PR S sacó los mensajes de `src/domain/**` al catálogo. Sin este test, el
 * próximo `throw new CheckoutError("...")` los vuelve a repartir por veinte
 * archivos y nadie se entera hasta que alguien intenta traducir el template y
 * encuentra media vidriera en castellano.
 *
 * Lo que se controla es la **familia de errores que alguien lee**: los del
 * checkout, los comprobantes, las cuentas de cliente, el login y los pedidos.
 * Quedan afuera a propósito:
 *
 * - Los del panel (`Admin*Error`): se traducen enteros en el PR R, y partirlos
 *   en dos deja media pantalla en cada idioma.
 * - Los de Pagopar y `MoneyError`: nadie los lee. Van al log del servidor, y
 *   traducir un mensaje de diagnóstico es hacerlo más difícil de encontrar
 *   cuando se busca en Google o en el propio repo.
 */

const CON_CATALOGO = [
  'CheckoutError',
  'CouponRejectedError',
  'ReceiptError',
  'CustomerError',
  'LoginTokenError',
  'MessageSendError',
  'OrderNotFoundError',
  'StockUnavailableError',
  'InvalidTransitionError',
  'InsufficientStockError',
];

/**
 * Una **frase**, no cualquier literal: `"RUC"` o `"approved"` en el mismo
 * argumento son comparaciones, y pedir que tampoco existan convertiría este
 * test en un obstáculo sin relación con lo que cuida.
 */
const FRASE = /(["'`])[^"'`\n]*\s\w+\s\w+[^"'`\n]*\1/;

describe('errores del dominio', () => {
  it('ninguno arma su mensaje con una frase escrita a mano', async () => {
    const files = await listSourceFiles([path.join('src', 'domain')]);
    const offenders: string[] = [];

    for (const file of files) {
      const code = await readCode(file);

      for (const clase of CON_CATALOGO) {
        // El `new` de cada throw, con lo que le pasan como primer argumento.
        const throws = code.matchAll(new RegExp(`new ${clase}\\(([^)]*)`, 'g'));
        for (const match of throws) {
          const args = match[1] ?? '';
          if (FRASE.test(args)) offenders.push(`${file}: new ${clase}(${args.trim()})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('los `super()` de esas clases tampoco', async () => {
    const files = await listSourceFiles([path.join('src', 'domain')]);
    const offenders: string[] = [];

    for (const file of files) {
      const code = await readCode(file);
      // Sólo los archivos que declaran una de estas clases pueden tener el
      // `super()` que arma su mensaje.
      if (!CON_CATALOGO.some((clase) => code.includes(`class ${clase} extends`))) continue;

      for (const match of code.matchAll(/super\(([\s\S]*?)\);/g)) {
        const args = match[1] ?? '';
        if (FRASE.test(args)) offenders.push(`${file}: super(${args.trim().slice(0, 60)}…)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('el catálogo tiene el texto de cada familia', () => {
    expect(TEXTOS.dominio.checkout.carritoVacio).toBeTruthy();
    expect(TEXTOS.dominio.recibo.formato).toBeTruthy();
    expect(TEXTOS.dominio.cliente.nombreCorto).toBeTruthy();
    expect(TEXTOS.dominio.login.noSePudoGenerar).toBeTruthy();
    expect(TEXTOS.dominio.pedido.noExiste(7)).toContain('7');
  });
});

describe('mensajes de WhatsApp', () => {
  it('los templates salen del catálogo, no del código', async () => {
    const code = await readCode(path.join('src', 'domain', 'order-messages.ts'));

    // Lo que se persigue es una frase, no cualquier string: `"\\n"` del join y
    // el `" — "` que separa banco y tipo de cuenta son formato, no texto.
    const frases = [...code.matchAll(/(["'`])([^"'`\n]{12,})\1/g)].map((match) => match[2]);
    const conPalabras = frases.filter((frase) => /\s\w+\s\w+/.test(frase ?? ''));

    expect(conPalabras).toEqual([]);
  });

  it('el mensaje de recuperación arma el texto con lo del catálogo', () => {
    const textos = TEXTOS.dominio.whatsapp.recuperacion;
    expect(textos.hola('Ana')).toContain('Ana');
    expect(textos.vencido('Hola!', 'PY-000123')).toContain('PY-000123');
    expect(textos.subiComprobante('https://tienda.com.py/x')).toContain('https://tienda.com.py/x');
  });
});
