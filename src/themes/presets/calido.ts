import { TEMA_BASE } from "../base";
import { extenderTema } from "../tipos";

/**
 * `calido` — tierra y terracota, redondeo grande. Los colores son los de
 * `src/styles/temas/calido.css` (el tema de antes del kit, que sigue
 * andando). Header, pie y home: los del base.
 */
export const calido = extenderTema(TEMA_BASE, {
  id: "calido",
  nombre: "Cálido",
  paraQuien:
    "Rubros cálidos o artesanales —comida, cuero, decoración, productos de campo— donde un blanco y negro estricto queda frío. Foco en la foto de producto sobre fondo cálido.",
  fuentes: "Fraunces (títulos) + Figtree (cuerpo)",
  legado: "calido",
  tokens: {
    radio: "1rem",
    claro: {
      background: "oklch(0.98 0.012 70)",
      foreground: "oklch(0.24 0.02 40)",
      card: "oklch(0.99 0.01 70)",
      "card-foreground": "oklch(0.24 0.02 40)",
      popover: "oklch(0.99 0.01 70)",
      "popover-foreground": "oklch(0.24 0.02 40)",
      primary: "oklch(0.55 0.16 40)",
      "primary-foreground": "oklch(0.98 0.012 70)",
      secondary: "oklch(0.94 0.03 60)",
      "secondary-foreground": "oklch(0.3 0.03 40)",
      muted: "oklch(0.94 0.02 60)",
      "muted-foreground": "oklch(0.5 0.03 50)",
      accent: "oklch(0.9 0.05 50)",
      "accent-foreground": "oklch(0.3 0.03 40)",
      destructive: "oklch(0.577 0.245 27.325)",
      "destructive-foreground": "oklch(0.98 0.012 70)",
      border: "oklch(0.88 0.02 60)",
      input: "oklch(0.88 0.02 60)",
      ring: "oklch(0.6 0.1 40)",
    },
    oscuro: {
      background: "oklch(0.2 0.02 40)",
      foreground: "oklch(0.96 0.01 70)",
      card: "oklch(0.25 0.02 40)",
      "card-foreground": "oklch(0.96 0.01 70)",
      popover: "oklch(0.25 0.02 40)",
      "popover-foreground": "oklch(0.96 0.01 70)",
      primary: "oklch(0.65 0.15 45)",
      "primary-foreground": "oklch(0.2 0.02 40)",
      secondary: "oklch(0.32 0.03 45)",
      "secondary-foreground": "oklch(0.96 0.01 70)",
      muted: "oklch(0.32 0.03 45)",
      "muted-foreground": "oklch(0.75 0.03 60)",
      accent: "oklch(0.38 0.05 45)",
      "accent-foreground": "oklch(0.96 0.01 70)",
      destructive: "oklch(0.704 0.191 22.216)",
      "destructive-foreground": "oklch(0.96 0.01 70)",
      border: "oklch(1 0 0 / 12%)",
      input: "oklch(1 0 0 / 18%)",
      ring: "oklch(0.6 0.1 45)",
    },
  },
});
