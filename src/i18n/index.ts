import { TIENDA } from "@/config/tienda";

import { esPY } from "./es-py";
import { en } from "./en";

/**
 * i18n del template — **un idioma por tienda** (PLAN.md FASE 2, PR P).
 *
 * Nivel A y a propósito: `TIENDA.lang` elige el catálogo y listo. No hay
 * switcher para el visitante, ni rutas por idioma, ni negociación por
 * `Accept-Language`. Una tienda paraguaya vende en español y una tienda que
 * se clone para otro mercado cambia una línea de `tienda.ts`; todo lo demás
 * —rutas por locale, hreflang, contenido duplicado— es un problema de SEO que
 * no hace falta tener para resolver el problema que sí hay.
 *
 * **Las URLs quedan en español para siempre.** `/categoria`, `/producto`,
 * `/checkout`, `/pedido` son parte del template, no texto traducible: son
 * links que la gente ya compartió y que Google ya indexó.
 *
 * **La plata queda afuera.** `money.ts` sigue siendo PYG entero con su `₲`
 * literal: traducir un texto es una decisión de presentación, cambiar de
 * moneda es una decisión de negocio con IVA, redondeo y facturación atrás.
 *
 * Por qué un módulo propio y no `next-intl`: sin routing ni switcher, lo que
 * queda de una librería de i18n es un diccionario. Esto son cuarenta líneas,
 * anda igual en Server y en Client Components sin provider, y el catálogo es
 * un objeto tipado — una clave que no existe **no compila**, que es más de lo
 * que da el lookup por string de cualquier librería.
 */

export type Messages = typeof esPY;

/**
 * Un catálogo que no es el default puede estar incompleto: lo que falte cae
 * en es-PY. Es la diferencia entre una traducción a medio hacer y una tienda
 * con huecos en pantalla.
 */
export type PartialMessages = DeepPartial<Messages>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** El default y fallback. Siempre completo — lo verifica un test de CI. */
export const DEFAULT_LANG = "es-PY";

export const CATALOGS: Record<string, PartialMessages> = {
  [DEFAULT_LANG]: esPY,
  en,
};

/**
 * Mezcla el catálogo elegido sobre es-PY.
 *
 * Recursivo sobre objetos planos y nada más: una función (los mensajes con
 * parámetros) o un string se reemplazan enteros. Corre una sola vez, al
 * importar el módulo.
 */
function merge<T>(base: T, override: DeepPartial<T>): T {
  const result = { ...base };

  for (const key of Object.keys(override) as Array<keyof T>) {
    const value = override[key];
    if (value === undefined) continue;

    const current = result[key];
    if (
      typeof current === "object" &&
      current !== null &&
      typeof value === "object" &&
      value !== null
    ) {
      result[key] = merge(current, value as DeepPartial<T[keyof T]>);
    } else {
      result[key] = value as T[keyof T];
    }
  }

  return result;
}

/**
 * Los textos de esta tienda. Se usa como objeto: `TEXTOS.home.titulo`.
 *
 * Un idioma que no tenga catálogo cae en es-PY entero en vez de romper: una
 * tienda mal configurada tiene que seguir vendiendo.
 */
export const TEXTOS: Messages = merge(esPY, CATALOGS[TIENDA.lang] ?? {});
