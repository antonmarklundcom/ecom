/**
 * Qué páginas de la vidriera salen de la caché (ISR) y cuándo no.
 *
 * La home, la categoría y la ficha de producto se arman una vez y se sirven
 * armadas (`export const revalidate` en cada una; ARCH.md §6, "Caché de la
 * vidriera"). El problema son los parámetros: una página de ISR es **una sola**
 * por URL sin query, y `/categoria/remeras?marca=nike&orden=precio` no es la
 * misma página que `/categoria/remeras`, ni `/producto/x?variante=AZUL-M`
 * tiene que perder la variante si el producto cambió de slug.
 *
 * Por eso `src/proxy.ts` mira el query string: sin parámetros que cambien la
 * página, la request va a la ruta cacheada; con alguno, se reescribe (sin que
 * cambie la URL que ve el navegador) a la gemela `…/con-parametros`, que
 * renderiza **la misma página** por request, con sus `searchParams` reales.
 *
 * Los parámetros de seguimiento de campañas (`utm_*`, `fbclid`, `gclid`…) no
 * cambian nada de lo que se dibuja: un click desde un anuncio de Instagram
 * sale de la caché igual que uno desde el menú. La URL con ellos se marca
 * `noindex` con un header (`X-Robots-Tag`), lo mismo que hacía el metadata
 * antes de la caché: el canonical ya apunta a la URL limpia.
 *
 * Puro y sin Next adentro: lo usan el proxy y los tests.
 */

/** El header con que el proxy marca la request reescrita a la gemela. */
export const HEADER_CON_PARAMETROS = "x-vidriera-con-parametros";

/** El segmento de la ruta gemela: `/producto/[slug]/con-parametros`. */
export const SEGMENTO_CON_PARAMETROS = "con-parametros";

/**
 * Los que agregan las campañas y las plataformas, nunca la tienda. `srsltid`
 * lo pone Google Merchant en los links de sus listados de producto.
 */
const DE_SEGUIMIENTO = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "msclkid",
  "ttclid",
  "igshid",
  "srsltid",
  "_ga",
  "_gl",
]);

/** `_rsc` es el parámetro interno de Next en las navegaciones del cliente. */
const INTERNOS = new Set(["_rsc"]);

function esDeSeguimiento(nombre: string): boolean {
  return nombre.startsWith("utm_") || DE_SEGUIMIENTO.has(nombre);
}

/** Las páginas de la vidriera que tienen gemela por request. */
const CON_GEMELA = /^\/(producto|categoria)\/([^/]+)$/;

export type DestinoVidriera =
  /** No es una página de la vidriera con caché: el proxy no toca nada. */
  | { tipo: "otra" }
  /** Sale de la caché. `noindex`: vino con parámetros de seguimiento. */
  | { tipo: "cacheada"; noindex: boolean }
  /** Va por request a la gemela, en `pathname`. */
  | { tipo: "con-parametros"; pathname: string };

/**
 * Adónde va una request a la vidriera, según su path y su query.
 *
 * Sólo decide para `/producto/<slug>` y `/categoria/<slug>`; la home no lee
 * parámetros y sale siempre de la caché (eso lo decide `esRutaCacheada` en
 * el proxy).
 */
export function destinoVidriera(
  pathname: string,
  searchParams: URLSearchParams
): DestinoVidriera {
  const match = CON_GEMELA.exec(pathname);
  if (!match) return { tipo: "otra" };

  const nombres = [...new Set(searchParams.keys())].filter(
    (nombre) => !INTERNOS.has(nombre)
  );
  if (nombres.some((nombre) => !esDeSeguimiento(nombre))) {
    return {
      tipo: "con-parametros",
      pathname: `${pathname}/${SEGMENTO_CON_PARAMETROS}`,
    };
  }
  return { tipo: "cacheada", noindex: nombres.length > 0 };
}

export type ParametrosDeLaUrl = Record<string, string | string[] | undefined>;

/**
 * Los `searchParams` de la página, **sólo** cuando la renderiza la gemela
 * (`con-parametros/`, que pasa `conParametros`). En la ruta cacheada ni se
 * tocan: con sólo esperarlos, Next la vuelve dinámica —el build falla con
 * "dynamic usage… `await searchParams`" y la página queda fuera de la caché—.
 * Ahí la página se dibuja como la URL limpia, que es lo que es.
 */
export function parametrosDeLaUrl(props: {
  searchParams: Promise<ParametrosDeLaUrl>;
  conParametros?: boolean;
}): Promise<ParametrosDeLaUrl> {
  return props.conParametros ? props.searchParams : Promise.resolve({});
}
