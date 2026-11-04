/**
 * Kit de temas — la piel como configuración (NEW-STORE.md §5).
 *
 * Un tema es **datos**: los tokens (colores, radio, escala de texto,
 * espaciado y ancho), qué variante de header y de pie dibuja, y en qué orden
 * van las secciones de la home. El CSS sale de estos objetos con
 * `pnpm temas:css` (`src/themes/temas.css`, generado y commiteado: Tailwind
 * v4 necesita el CSS estático). La tienda elige uno en `src/config/tienda.ts`
 * (`tema: "clasico"`) y lo retoca en `src/themes/custom.css`, que es suyo y
 * `template:sync` nunca pisa.
 *
 * Este archivo no importa nada a propósito: lo lee `tienda.ts` (por el tipo),
 * el script que genera el CSS y los tests, sin arrastrar el resto del grafo.
 */

/**
 * Los colores que todo tema define, en claro y en oscuro. Son las variables
 * CSS de siempre (`--background`, `--primary`…), mapeadas a clases de
 * Tailwind en el `@theme inline` de `globals.css` (`bg-background`,
 * `text-primary`…). Falta uno = un botón o un texto invisible en ese tema:
 * `temas.test.ts` lo bloquea.
 */
export const COLORES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
] as const;
export type Color = (typeof COLORES)[number];
export type Paleta = Record<Color, string>;

/**
 * Colores con significado que la vidriera usaba escritos a mano (estrellas
 * ámbar, descuento verde, corazón rojo, el velo negro sobre la foto de
 * portada). Son **opcionales** en cada tema: el default vive en
 * `src/themes/semanticos.css` —con los mismos valores de Tailwind que había
 * antes— y un tema sólo los pisa si quiere. Los componentes los leen con
 * `text-(--estrella)` y no con una clase registrada en `globals.css`, para
 * que una tienda con su propio `globals.css` los siga viendo.
 */
export const SEMANTICOS = [
  "estrella",
  "oferta",
  "favorito",
  "velo",
  "sobre-velo",
] as const;
export type Semantico = (typeof SEMANTICOS)[number];
export type PaletaSemantica = Partial<Record<Semantico, string>>;

/** Cómo se arma el header. Las dos dibujan los mismos `data-testid`. */
export const VARIANTES_HEADER = ["clasico", "centrado"] as const;
export type VarianteHeader = (typeof VARIANTES_HEADER)[number];

/** Cómo se arma el pie. */
export const VARIANTES_FOOTER = ["columnas", "compacto"] as const;
export type VarianteFooter = (typeof VARIANTES_FOOTER)[number];

/**
 * Las secciones de la home (`src/app/page.tsx`), en el orden en que el tema
 * las quiere. Una que no está en la lista no se dibuja; sin `hero`, el `<h1>`
 * de la página sigue existiendo (oculto) para lectores de pantalla.
 */
export const SECCIONES_HOME = ["hero", "categorias", "destacados"] as const;
export type SeccionHome = (typeof SECCIONES_HOME)[number];

/** Los tamaños de texto de Tailwind que un tema puede reescalar. */
export const TAMANOS_TEXTO = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
] as const;
export type TamanoTexto = (typeof TAMANOS_TEXTO)[number];

/**
 * Escala de la vidriera: pisa variables de Tailwind (`--spacing`,
 * `--text-*`, `--container-6xl`) **sólo** adentro del header, el pie y la
 * home (`[data-site-header]`, `[data-site-footer]`, `[data-vidriera]`). El
 * checkout, la ficha y el panel no cambian de tamaño con el tema: ahí el
 * tema sólo pone colores y radio.
 *
 * Todo opcional: sin escala, la vidriera mide lo de Tailwind de siempre.
 */
export type Escala = {
  /** Unidad de espaciado (`p-4` = 4 × esto). Tailwind: `0.25rem`. */
  espaciado?: string;
  /** Ancho máximo del contenido (`max-w-6xl`). Tailwind: `72rem`. */
  ancho?: string;
  /** Tamaños de letra (`text-lg`…). El interlineado acompaña solo. */
  texto?: Partial<Record<TamanoTexto, string>>;
};

export type Tokens = {
  /** `--radius`: de él salen `rounded-sm`…`rounded-xl`. */
  radio: string;
  claro: Paleta & PaletaSemantica;
  oscuro: Paleta & PaletaSemantica;
  escala?: Escala;
};

export type Tema = {
  /** Lo que va en `tienda.ts` (`tema: "vitrina"`) y en `<html data-tema>`. */
  id: string;
  /** Para la pregunta de `pnpm nueva-tienda` y los docs. */
  nombre: string;
  /** Para qué comercio sirve, en una o dos líneas. */
  paraQuien: string;
  /** Las fuentes que combinan (se cambian en `src/app/layout.tsx`). */
  fuentes: string;
  header: VarianteHeader;
  footer: VarianteFooter;
  home: readonly SeccionHome[];
  tokens: Tokens;
  /**
   * El archivo de `src/styles/temas/` con los mismos colores, para las
   * tiendas cuyo `globals.css` todavía elige el tema con
   * `@import "../styles/temas/<x>.css"` (el formato de antes de este kit).
   * `pnpm temas:css` lo mantiene al día.
   */
  legado?: string;
};

/** Lo que un tema cambia respecto del que extiende. */
export type CambiosTema = Omit<Partial<Tema>, "tokens"> & {
  id: string;
  nombre: string;
  paraQuien: string;
  tokens?: {
    radio?: string;
    claro?: Partial<Paleta & PaletaSemantica>;
    oscuro?: Partial<Paleta & PaletaSemantica>;
    escala?: Escala;
  };
};

/**
 * Un tema nuevo a partir de otro: hereda todo lo que no cambia. Los colores
 * se combinan uno por uno; la escala, si viene, reemplaza la del padre.
 */
export function extenderTema(padre: Tema, cambios: CambiosTema): Tema {
  const { tokens, ...resto } = cambios;
  const tema: Tema = {
    ...padre,
    legado: undefined,
    ...resto,
    tokens: {
      radio: tokens?.radio ?? padre.tokens.radio,
      claro: { ...padre.tokens.claro, ...tokens?.claro },
      oscuro: { ...padre.tokens.oscuro, ...tokens?.oscuro },
      escala: tokens?.escala ?? padre.tokens.escala,
    },
  };
  if (tema.legado === undefined) delete tema.legado;
  if (tema.tokens.escala === undefined) delete tema.tokens.escala;
  return tema;
}
