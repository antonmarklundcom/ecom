import { TEMA_BASE } from "./base";
import { calido } from "./presets/calido";
import { oscuroVivo } from "./presets/oscuro-vivo";
import { vitrina } from "./presets/vitrina";
import type { Tema } from "./tipos";

/**
 * Los temas que trae el template, en el orden en que `pnpm nueva-tienda` los
 * ofrece. El primero es el default.
 *
 * Para sumar uno: un archivo en `src/themes/presets/`, una línea acá y
 * `pnpm temas:css` (NEW-STORE.md §5). Sin la línea acá el tema no existe:
 * `tienda.ts` no compila con su nombre y el CSS no lo trae.
 */
export const TEMAS = {
  clasico: TEMA_BASE,
  vitrina,
  calido,
  "oscuro-vivo": oscuroVivo,
} as const satisfies Record<string, Tema>;

export type TemaId = keyof typeof TEMAS;

export const TEMA_POR_DEFECTO: TemaId = "clasico";

/**
 * Nombres viejos que siguen valiendo. `neutro` era el default antes del kit
 * (`src/styles/temas/neutro.css`) y es exactamente `clasico`.
 */
export const ALIAS_TEMAS: Readonly<Record<string, TemaId>> = {
  neutro: "clasico",
};

export const IDS_TEMAS = Object.keys(TEMAS) as TemaId[];

/** ¿`valor` nombra un tema (o un alias)? */
export function esTemaConocido(valor: string): boolean {
  return valor in TEMAS || valor in ALIAS_TEMAS;
}

/** El id canónico de `valor` (resuelve alias), o `null` si no es un tema. */
export function idTema(valor: unknown): TemaId | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (Object.hasOwn(TEMAS, limpio)) return limpio as TemaId;
  return ALIAS_TEMAS[limpio] ?? null;
}

/**
 * El tema que corresponde a `valor`. Sin valor —una tienda cuyo `tienda.ts`
 * es de antes del kit y no tiene el campo `tema`— es el default, que dibuja
 * exactamente lo de antes.
 */
export function resolverTema(valor: unknown): Tema {
  const id = idTema(valor) ?? TEMA_POR_DEFECTO;
  return TEMAS[id];
}
