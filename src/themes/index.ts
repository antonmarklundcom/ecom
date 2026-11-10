import { TIENDA } from "@/config/tienda";

import { resolverTema } from "./presets";
import type { Tema } from "./tipos";

export type { Tema } from "./tipos";
export { TEMAS, type TemaId } from "./presets";

/**
 * El tema de esta tienda, según `TIENDA.tema` (`src/config/tienda.ts`).
 *
 * Se lee con un cast y no como `TIENDA.tema` a secas a propósito: el
 * `tienda.ts` es de cada tienda y `template:sync` no lo pisa, así que una
 * tienda creada antes del kit trae este archivo nuevo con su `tienda.ts`
 * viejo, sin el campo. Ahí el tema es el default (`clasico`), que dibuja la
 * tienda exactamente como antes. Un nombre que no existe no llega hasta acá:
 * el tipo `TemaId` de `tienda.ts` no compila.
 *
 * Sólo servidor (header, pie, home, layout): los presets no viajan al
 * navegador.
 */
export function temaActivo(): Tema {
  return resolverTema((TIENDA as { tema?: unknown }).tema);
}
