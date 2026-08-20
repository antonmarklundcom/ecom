import { TEXTOS } from "@/i18n";

/**
 * Los textos de los errores del dominio, en un solo lugar (PLAN.md FASE 2, PR S).
 *
 * Antes cada `throw` llevaba su frase escrita al lado. Funcionaba, y era
 * exactamente lo que hacía imposible traducir el template: los mensajes que la
 * compradora lee cuando algo sale mal —"el carrito está vacío", "el total
 * cambió"— estaban repartidos en veinte archivos de `src/domain/**`, mezclados
 * con la lógica que los produce.
 *
 * Ahora el dominio pide el texto acá y `MENSAJES` lo saca del catálogo del
 * idioma de la tienda. La regla que lo sostiene no es la disciplina de quien
 * escribe el próximo `throw`: `tests/unit/i18n-dominio.test.ts` falla si un
 * error del dominio vuelve a llevar una frase escrita a mano.
 *
 * Un solo símbolo para grepear, y un solo import en cada archivo del dominio.
 */
export const MENSAJES = TEXTOS.dominio;
