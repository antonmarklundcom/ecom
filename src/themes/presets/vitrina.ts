import { TEMA_BASE } from "../base";
import { extenderTema } from "../tipos";

/**
 * `vitrina` — la tienda como una vidriera de boutique: logo al centro,
 * productos antes que categorías, más aire y letra más grande.
 *
 * Es el ejemplo de un tema que cambia **todo** lo que el kit permite:
 * colores (papel y tinta con un verde profundo), radio, escala de la
 * vidriera, variante de header y de pie, y orden de la home. Para un tema
 * propio, copiá este archivo, cambiale el `id` y registralo en
 * `src/themes/presets.ts` (NEW-STORE.md §5).
 */
export const vitrina = extenderTema(TEMA_BASE, {
  id: "vitrina",
  nombre: "Vitrina",
  paraQuien:
    "Boutiques, moda, joyería, regalos: pocas categorías y mucha foto. Los productos destacados van primero y el header pone el logo al centro.",
  fuentes: "Playfair Display (títulos) + DM Sans (cuerpo)",
  header: "centrado",
  footer: "compacto",
  home: ["hero", "destacados", "categorias"],
  tokens: {
    radio: "0.375rem",
    claro: {
      background: "oklch(0.985 0.006 85)",
      foreground: "oklch(0.2 0.015 260)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0.2 0.015 260)",
      popover: "oklch(1 0 0)",
      "popover-foreground": "oklch(0.2 0.015 260)",
      primary: "oklch(0.36 0.07 165)",
      "primary-foreground": "oklch(0.985 0.006 85)",
      secondary: "oklch(0.95 0.012 85)",
      "secondary-foreground": "oklch(0.25 0.02 260)",
      muted: "oklch(0.955 0.01 85)",
      "muted-foreground": "oklch(0.5 0.015 260)",
      accent: "oklch(0.93 0.03 165)",
      "accent-foreground": "oklch(0.28 0.06 165)",
      destructive: "oklch(0.577 0.245 27.325)",
      "destructive-foreground": "oklch(0.985 0 0)",
      border: "oklch(0.9 0.01 85)",
      input: "oklch(0.9 0.01 85)",
      ring: "oklch(0.55 0.08 165)",
      // El descuento en rojo, como en la vidriera de una tienda de ropa.
      oferta: "oklch(0.55 0.2 27)",
    },
    oscuro: {
      background: "oklch(0.17 0.012 260)",
      foreground: "oklch(0.96 0.006 85)",
      card: "oklch(0.21 0.012 260)",
      "card-foreground": "oklch(0.96 0.006 85)",
      popover: "oklch(0.21 0.012 260)",
      "popover-foreground": "oklch(0.96 0.006 85)",
      primary: "oklch(0.78 0.09 165)",
      "primary-foreground": "oklch(0.2 0.03 165)",
      secondary: "oklch(0.27 0.012 260)",
      "secondary-foreground": "oklch(0.96 0.006 85)",
      muted: "oklch(0.27 0.012 260)",
      "muted-foreground": "oklch(0.72 0.012 85)",
      accent: "oklch(0.32 0.04 165)",
      "accent-foreground": "oklch(0.96 0.006 85)",
      destructive: "oklch(0.704 0.191 22.216)",
      "destructive-foreground": "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.6 0.08 165)",
      oferta: "oklch(0.72 0.17 25)",
    },
    escala: {
      espaciado: "0.275rem",
      ancho: "80rem",
      texto: { lg: "1.375rem", "2xl": "1.875rem", "4xl": "3rem" },
    },
  },
});
