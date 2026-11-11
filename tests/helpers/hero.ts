import type { Hero } from "@/config/tienda";

/**
 * Un hero escrito como lo escribe el template hoy (`imagen.imageRef`).
 *
 * `Hero` vive en `src/config/tienda.ts`, que es de cada tienda y
 * `template:sync` nunca pisa: en una tienda de antes de R2 el tipo todavía
 * dice `imagen: { cloudinaryId: string; alt: string }`, y un literal con
 * `imageRef` no compila ahí (O23: Norte, en el arnés). El código del template
 * acepta las dos formas (`src/lib/hero-imagen.ts`); los tests las arman con
 * esto para compilar en las dos.
 */
export type HeroDelTemplate = {
  titulo: string;
  texto?: string;
  cta?: { label: string; href: string };
  imagen?: { imageRef?: string; cloudinaryId?: string; alt: string } | null;
};

export function heroDelTemplate(hero: HeroDelTemplate): Hero {
  return hero as unknown as Hero;
}
