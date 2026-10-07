/**
 * Lo que esta tienda declara sobre los datos que publica afuera: la imagen
 * para compartir, el JSON-LD y el feed de Google/Meta
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md E2, E6).
 *
 * Archivo de la tienda: cambialo acá, no en `src/lib`. Los valores de abajo
 * son los del template y no cambian nada para quien no los toque.
 */
export const PUBLIC_FACTS: {
  /**
   * Fotos sin procedencia marcada en el panel. `true` (template): se publican
   * como siempre. `false`: afuera sólo salen las marcadas como foto propia o
   * autorizada por el proveedor. Las ilustrativas nunca salen afuera, con
   * cualquier valor.
   */
  publishUnknownImages: boolean;
  /**
   * `true` sólo si lo que vende esta tienda no tiene GTIN/MPN de fabricante
   * (producción propia, artesanía). Entonces una variante sin identificador
   * verificado va al feed con `identifier_exists=no`. Con `false` (template)
   * no se afirma nada: decir "no tiene" de un producto de marca que sí tiene
   * GTIN es motivo de rechazo en Merchant Center.
   */
  noManufacturerIdentifiers: boolean;
} = {
  publishUnknownImages: true,
  noManufacturerIdentifiers: false,
};
