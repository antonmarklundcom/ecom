/**
 * `"Remera Azul"` → `"remera-azul"`.
 *
 * Vivía suelto dentro de `product-form.tsx`; lo mudé acá cuando el ABM de
 * categorías necesitó exactamente el mismo comportamiento. Dos copias de esto
 * es cuestión de tiempo hasta que una acepte una `ñ` y la otra no, y un slug
 * es una URL: la divergencia se paga en links rotos.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
