/**
 * Lo que buscan los guardarraíles de marca: `TIENDA.marcaBuscable`, o el
 * `nombre` sin el campo.
 *
 * Se lee así y no como `TIENDA.marcaBuscable` porque `src/config/tienda.ts` es
 * de la tienda (`template:sync` no lo pisa): una tienda nacida antes de v2.1.0
 * tiene un tipo `Tienda` sin el campo y el test no le compilaba (O36).
 */
export function marcaBuscable(tienda: { nombre: string }): string {
  const valor = (tienda as { marcaBuscable?: unknown }).marcaBuscable;
  return typeof valor === "string" && valor.trim() ? valor : tienda.nombre;
}
