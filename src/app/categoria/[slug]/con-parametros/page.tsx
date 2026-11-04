import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import Categoria, { generateMetadata as metadataDeLaCategoria } from "../page";
import { HEADER_CON_PARAMETROS } from "@/lib/vidriera-cache";

/**
 * La categoría **con parámetros** (filtros, orden, página), renderizada por
 * request.
 *
 * No es otra página: es `../page.tsx` tal cual, pero con `conParametros`, que
 * es lo que le hace leer `searchParams`. La categoría de arriba sale de la
 * caché, y la caché es una sola por URL limpia; cada combinación de filtros
 * es una página distinta con sus conteos en vivo. `src/proxy.ts` reescribe esas requests acá (la URL del
 * navegador no cambia) y las marca con un header; abierta a mano, esta ruta
 * da 404.
 *
 * No se rediseña: una tienda que cambia la categoría cambia `../page.tsx`, y
 * esto la sigue sola (ver `src/lib/vidriera-cache.ts`).
 */
export const dynamic = "force-dynamic";

type Props = Omit<Parameters<typeof Categoria>[0], "conParametros">;

/**
 * Lo que le hace leer `searchParams` a `../page.tsx` (`parametrosDeLaUrl`).
 * Va sin tipo a propósito: una tienda que rediseñó la página y todavía no
 * acepta `conParametros` sigue compilando, y su página —que lee
 * `searchParams` por su cuenta— lo ignora.
 */
const CON_PARAMETROS: Record<string, unknown> = { conParametros: true };

async function llegoPorElProxy(): Promise<boolean> {
  return (await headers()).get(HEADER_CON_PARAMETROS) === "1";
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!(await llegoPorElProxy())) return { robots: { index: false } };
  return metadataDeLaCategoria({ ...props, ...CON_PARAMETROS });
}

export default async function CategoriaConParametros(props: Props) {
  if (!(await llegoPorElProxy())) notFound();
  return <Categoria {...props} {...CON_PARAMETROS} />;
}
