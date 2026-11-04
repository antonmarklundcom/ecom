import { TEMA_BASE } from "../base";
import { extenderTema, type Paleta } from "../tipos";

/**
 * Claro y oscuro llevan los mismos valores a propósito: el fondo oscuro es
 * una decisión de marca, no una preferencia del sistema operativo de quien
 * visita.
 */
const OSCURO: Paleta = {
  background: "oklch(0.16 0.02 260)",
  foreground: "oklch(0.96 0 0)",
  card: "oklch(0.2 0.02 260)",
  "card-foreground": "oklch(0.96 0 0)",
  popover: "oklch(0.2 0.02 260)",
  "popover-foreground": "oklch(0.96 0 0)",
  primary: "oklch(0.72 0.19 310)",
  "primary-foreground": "oklch(0.14 0.02 260)",
  secondary: "oklch(0.26 0.02 260)",
  "secondary-foreground": "oklch(0.96 0 0)",
  muted: "oklch(0.26 0.02 260)",
  "muted-foreground": "oklch(0.68 0.02 260)",
  accent: "oklch(0.3 0.05 300)",
  "accent-foreground": "oklch(0.96 0 0)",
  destructive: "oklch(0.65 0.24 25)",
  "destructive-foreground": "oklch(0.96 0 0)",
  border: "oklch(1 0 0 / 12%)",
  input: "oklch(1 0 0 / 16%)",
  ring: "oklch(0.72 0.19 310)",
};

/**
 * `oscuro-vivo` — fondo oscuro fijo con un acento saturado, redondeo chico.
 * Los colores son los de `src/styles/temas/oscuro-vivo.css` (el tema de
 * antes del kit, que sigue andando). Header, pie y home: los del base.
 */
export const oscuroVivo = extenderTema(TEMA_BASE, {
  id: "oscuro-vivo",
  nombre: "Oscuro vivo",
  paraQuien:
    'Tech, gaming, indumentaria urbana: una marca que quiere la tienda siempre oscura, con un acento que resalte precio y "Agregar al carrito".',
  fuentes: "Sora (títulos) + Inter (cuerpo)",
  legado: "oscuro-vivo",
  tokens: {
    radio: "0.25rem",
    claro: OSCURO,
    oscuro: OSCURO,
  },
});
