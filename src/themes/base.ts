import type { Tema } from "./tipos";

/**
 * El tema base: **`clasico`**, la tienda tal como se veía antes del kit.
 *
 * Todos los demás temas salen de éste con `extenderTema` y cambian sólo lo
 * suyo. Los colores son los de `src/styles/temas/neutro.css` byte a byte (el
 * `neutro` de antes, que sigue andando como alias): si un dígito de acá
 * cambia, la tienda que nunca eligió tema se ve distinta después de un
 * `template:sync`, y eso es un bug. `temas.test.ts` lo cuida.
 *
 * Sin `escala`: header, pie y home miden lo de Tailwind de siempre.
 */
export const TEMA_BASE: Tema = {
  id: "clasico",
  nombre: "Clásico",
  paraQuien:
    "El default del template: blanco y negro sobrio, para el comercio que todavía no tiene una identidad de color o la resuelve con fotos y logo.",
  fuentes:
    "Geist / Geist Mono (las de `src/app/layout.tsx`, no hay que tocar nada)",
  header: "clasico",
  footer: "columnas",
  home: ["hero", "categorias", "destacados"],
  legado: "neutro",
  tokens: {
    radio: "0.625rem",
    claro: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0.145 0 0)",
      popover: "oklch(1 0 0)",
      "popover-foreground": "oklch(0.145 0 0)",
      primary: "oklch(0.205 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      "secondary-foreground": "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      "accent-foreground": "oklch(0.205 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
      "destructive-foreground": "oklch(0.985 0 0)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
    },
    oscuro: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      "card-foreground": "oklch(0.985 0 0)",
      popover: "oklch(0.205 0 0)",
      "popover-foreground": "oklch(0.985 0 0)",
      primary: "oklch(0.922 0 0)",
      "primary-foreground": "oklch(0.205 0 0)",
      secondary: "oklch(0.269 0 0)",
      "secondary-foreground": "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      "muted-foreground": "oklch(0.708 0 0)",
      accent: "oklch(0.269 0 0)",
      "accent-foreground": "oklch(0.985 0 0)",
      destructive: "oklch(0.704 0.191 22.216)",
      "destructive-foreground": "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.556 0 0)",
    },
  },
};
