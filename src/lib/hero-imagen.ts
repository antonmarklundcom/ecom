/**
 * La referencia de la foto del hero de `src/config/tienda.ts`, venga con el
 * nombre de hoy (`imageRef`) o con el de antes del cambio a R2
 * (`cloudinaryId`, deprecado).
 *
 * Vive acá y no en `tienda.ts` a propósito: ese archivo es de la tienda y
 * `template:sync` nunca lo pisa, así que la maquinaria no puede depender de
 * nada que se agregue ahí. Lo que sí puede hacer es leerlo por su forma: el
 * tipo de abajo acepta el `Hero` viejo (`{ cloudinaryId: string }`) y el nuevo.
 */
export type HeroImagenCompat = {
  imageRef?: string;
  /** @deprecated usar `imageRef`. */
  cloudinaryId?: string;
};

export function refDeHeroImagen(imagen: HeroImagenCompat | null | undefined): string | null {
  return imagen?.imageRef ?? imagen?.cloudinaryId ?? null;
}
