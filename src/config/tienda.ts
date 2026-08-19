/**
 * Identidad de la tienda — **el archivo que se edita en cada tienda nueva**.
 *
 * Todo lo que cambia de una tienda a otra y no es un secreto vive acá: el
 * nombre que se ve en el header, el pie y los títulos del navegador, la
 * descripción para buscadores y el idioma. Los datos que sí son secretos o
 * cambian por ambiente (WhatsApp, banco, Pagopar, Cloudinary) siguen en el
 * entorno — ver `.env.example` y `src/lib/comercio.ts`.
 *
 * Regla para no romper el template: nada del dominio (checkout, pedidos,
 * panel) lee este archivo. Es sólo presentación. Si aparece la tentación de
 * meter acá una regla de negocio, va en `src/domain/`.
 *
 * Ver NEW-STORE.md para el checklist completo de una tienda nueva.
 */
export type Tienda = {
  /** Nombre comercial. Header, pie y `siteName` de Open Graph. */
  nombre: string;
  /** Título de la home y default del `<title>`. */
  titulo: string;
  /** Meta description — 150/160 caracteres, en el idioma de la tienda. */
  descripcion: string;
  /** Una línea abajo del nombre en el pie. */
  tagline: string;
  /** `<html lang>`. */
  lang: string;
  /** `locale` de Open Graph. */
  ogLocale: string;

  /**
   * ¿Esta tienda ofrece cuentas de cliente? (PLAN.md FASE 2, PR E)
   *
   * **Apagado por defecto, y ése es el default correcto.** Con `false` la
   * tienda se comporta exactamente como antes de que existiera la feature:
   * `/cuenta/*` devuelve 404, el header no muestra nada, el checkout no
   * cambia. Prenderlo es una decisión por tienda, no algo que se hereda del
   * template.
   *
   * Lo que **nunca** cambia con este flag: el checkout de invitado. La cuenta
   * es un "guardá tus datos para la próxima", jamás una pared antes de
   * comprar.
   *
   * (Este archivo es presentación y no lo lee el dominio. Un flag de feature
   * es la excepción declarada en el plan: lo leen las rutas y la UI para
   * decidir qué existe, nunca `src/domain/**` para decidir una regla de
   * negocio.)
   */
  cuentasClientes: boolean;
};

export const TIENDA: Tienda = {
  nombre: "TiendaPY",
  titulo: "TiendaPY — Comprá online en Paraguay",
  descripcion:
    "Tienda online paraguaya. Precios en guaraníes, IVA incluido, envíos a todo el país y atención por WhatsApp.",
  tagline: "Precios en guaraníes, IVA incluido. Enviamos a todo el país.",
  lang: "es-PY",
  ogLocale: "es_PY",
  cuentasClientes: false,
};

/**
 * El único lugar que decide si las cuentas de cliente existen.
 *
 * Una función y no el booleano suelto para que haya un solo símbolo que
 * grepear: hay un test de CI que verifica que **toda** ruta y acción de
 * `/cuenta` pase por acá antes de tocar nada.
 */
export function cuentasClientesHabilitadas(): boolean {
  return TIENDA.cuentasClientes;
}
