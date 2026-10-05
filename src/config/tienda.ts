/**
 * Identidad de la tienda — **el archivo que se edita en cada tienda nueva**.
 *
 * Todo lo que cambia de una tienda a otra y no es un secreto vive acá: el
 * nombre que se ve en el header, el pie y los títulos del navegador, la
 * descripción para buscadores y el idioma. Los datos que sí son secretos o
 * cambian por ambiente (WhatsApp, banco, Pagopar, Cloudinary) siguen en el
 * entorno — ver `docs/ENV-OPCIONAL.md` y `src/lib/comercio.ts`.
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

  /**
   * El bloque de arriba de todo de la home (PLAN.md FASE 2, PR O).
   *
   * **`null` = la home de siempre**, con el texto por defecto del template.
   * Ése es el default y está bien para arrancar: una tienda recién clonada no
   * tiene una foto de portada, y un hueco gris arriba de todo es peor que un
   * párrafo honesto.
   *
   * Esto es **piel**, la única de la FASE 2 (NEW-STORE.md §5): cada tienda lo
   * rediseña libre. Lo que hay acá es el mínimo que sirve sin tocar código —
   * foto, título, bajada y un botón— para que el comercio pueda cambiar su
   * portada de temporada sin llamar a nadie. Una portada más ambiciosa
   * (carrusel, vídeo, dos columnas) se escribe en `src/app/page.tsx`, que es
   * de la tienda.
   */
  hero: Hero | null;
};

/** La portada de la home. Ver `Tienda["hero"]`. */
export type Hero = {
  /**
   * Foto de fondo. El id público de Cloudinary, igual que en las fotos de
   * producto (ej. `"portadas/verano-2026"`). Sin `CLOUDINARY_CLOUD_NAME` en el
   * entorno o sin id, el hero se dibuja sin foto y con el fondo de siempre —
   * nunca con un rectángulo roto.
   */
  imagen?: { cloudinaryId: string; alt: string } | null;
  titulo: string;
  /** Una o dos líneas abajo del título. */
  texto?: string;
  /**
   * El botón. `href` puede ser cualquier ruta interna (`/categoria/ofertas`).
   * Sin CTA, el hero es sólo un cartel — que también es una decisión válida.
   */
  cta?: { label: string; href: string };
};

/**
 * El nombre con el que se clona el template.
 *
 * No se edita en la tienda nueva: es la definición de "todavía no lo
 * renombraron", y `pnpm preflight` bloquea mientras `TIENDA.nombre` siga
 * siendo éste. Vive acá y no en `preflight.ts` porque este archivo es el único
 * al que `marca-centralizada.test.ts` le permite escribir el nombre.
 */
export const MARCA_PLACEHOLDER = "TiendaPY";

export const TIENDA: Tienda = {
  nombre: MARCA_PLACEHOLDER,
  titulo: "TiendaPY — Comprá online en Paraguay",
  descripcion:
    "Catálogo online en Paraguay. Consultá los productos y las opciones disponibles del comercio.",
  tagline: "Conocé nuestro catálogo y las opciones disponibles.",
  lang: "es-PY",
  ogLocale: "es_PY",
  cuentasClientes: false,
  hero: null,
};

/**
 * **Legacy**: lo que dice este archivo, sin mirar el panel. La decisión real
 * la toma `cuentasClientesHabilitadas()` de `src/lib/cuentas.ts` (async), que
 * deja que el dueño prenda o apague las cuentas desde `/admin/ajustes` y usa
 * `TIENDA.cuentasClientes` sólo como default. Queda por compatibilidad con
 * código de tiendas que todavía la importe.
 */
export function cuentasClientesHabilitadas(): boolean {
  return TIENDA.cuentasClientes;
}
