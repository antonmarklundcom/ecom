import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SEMANTICOS } from "../../src/themes/tipos";

/**
 * La vidriera lee colores del tema, nunca escritos a mano (NEW-STORE.md §5).
 *
 * Un `text-red-500` o un `#25D366` en un componente de la tienda no cambia
 * con el tema: en `oscuro-vivo` queda un texto gris oscuro sobre fondo
 * oscuro, y en `custom.css` no hay variable que lo arregle. Los colores
 * salen de los tokens (`bg-primary`, `text-muted-foreground`…) o de los
 * semánticos (`text-(--estrella)`, `bg-(--velo)/45`, ver
 * `src/themes/semanticos.css`).
 *
 * Mira `src/components/**` y `src/app/**` menos el panel (`/admin`,
 * `/setup`), las rutas API y los tests. Las excepciones de verdad van en
 * `PERMITIDOS`, cada una con su motivo: agregar una sin motivo es la forma
 * de que este test deje de servir.
 */

const RAICES = [path.join("src", "components"), path.join("src", "app")];
const AFUERA = [
  path.join("src", "components", "admin"),
  path.join("src", "components", "__tests__"),
  path.join("src", "app", "admin"),
  path.join("src", "app", "setup"),
  path.join("src", "app", "api"),
];

type Permitido = { archivo: string; literal: string; motivo: string };

const PERMITIDOS: Permitido[] = [
  {
    archivo: "src/components/whatsapp-fab.tsx",
    literal: "bg-[#25D366]",
    motivo:
      "el verde de WhatsApp es como la compradora reconoce el botón; no es color de la tienda",
  },
  {
    archivo: "src/components/whatsapp-fab.tsx",
    literal: "text-white",
    motivo: "el ícono blanco sobre el verde de WhatsApp, igual que en la app",
  },
  {
    archivo: "src/app/pedido/[orderNumber]/page.tsx",
    literal: "bg-white",
    motivo:
      "un QR necesita fondo blanco para escanearse, también con un tema oscuro",
  },
  {
    archivo: "src/app/opengraph-image.tsx",
    literal: "#0b0b0c",
    motivo:
      "next/og dibuja una imagen en el servidor: no hay variables CSS del tema",
  },
  {
    archivo: "src/app/opengraph-image.tsx",
    literal: "#fafafa",
    motivo: "ídem: imagen de Open Graph, sin tokens",
  },
  {
    archivo: "src/app/opengraph-image.tsx",
    literal: "#a1a1aa",
    motivo: "ídem: imagen de Open Graph, sin tokens",
  },
  {
    archivo: "src/components/ui/button.tsx",
    literal: "text-white",
    motivo:
      "variante `destructive` de shadcn: blanco sobre `--destructive` en todos los temas; `--destructive-foreground` no es blanco puro y cambiarlo movería los píxeles del default",
  },
  {
    archivo: "src/components/ui/badge.tsx",
    literal: "text-white",
    motivo: "ídem `ui/button.tsx`: variante `destructive` de shadcn",
  },
];

const PALETA =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)";
const UTILIDAD =
  "(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|shadow|divide|placeholder|decoration|accent|caret)";

const PATRONES: Array<{ nombre: string; regex: RegExp }> = [
  {
    nombre: "clase de la paleta de Tailwind",
    regex: new RegExp(
      `(?<![\\w-])${UTILIDAD}-(?:white|black|${PALETA})(?:\\/\\d+)?(?![\\w-])`,
      "g"
    ),
  },
  {
    nombre: "color arbitrario en una clase",
    regex: new RegExp(
      `(?<![\\w-])${UTILIDAD}-\\[(?:#|rgb|hsl|oklch|oklab|lab\\(|lch\\(|color\\()[^\\]]*\\]`,
      "g"
    ),
  },
  { nombre: "color hexadecimal", regex: /#[0-9a-fA-F]{3,8}(?![\w-])/g },
  { nombre: "función de color", regex: /\b(?:rgba?|hsla?|oklch|oklab)\(/g },
];

function archivos(dir: string): string[] {
  if (AFUERA.includes(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    if (!/\.(tsx|ts)$/.test(nombre) || /\.test\.tsx?$/.test(nombre)) return [];
    return [ruta];
  });
}

/** Sin comentarios: una explicación que menciona `text-white` no es un uso. */
function sinComentarios(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ARCHIVOS = RAICES.flatMap(archivos).map((ruta) =>
  ruta.split(path.sep).join("/")
);

describe("la vidriera no escribe colores a mano", () => {
  it("encuentra los componentes (el test no está mirando una carpeta vacía)", () => {
    expect(ARCHIVOS).toContain("src/components/site-header.tsx");
    expect(ARCHIVOS).toContain("src/app/page.tsx");
    expect(ARCHIVOS.some((ruta) => ruta.startsWith("src/app/admin/"))).toBe(
      false
    );
  });

  it("ningún componente de la tienda tiene un color fuera de los tokens", () => {
    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS) {
      const source = sinComentarios(readFileSync(archivo, "utf8"));
      for (const { nombre, regex } of PATRONES) {
        for (const match of source.matchAll(regex)) {
          const literal = match[0];
          const permitido = PERMITIDOS.some(
            (p) =>
              p.archivo === archivo &&
              (p.literal.includes(literal) ||
                literal.startsWith(`${p.literal}/`))
          );
          if (!permitido) hallazgos.push(`${archivo}: ${nombre} "${literal}"`);
        }
      }
    }
    expect(
      hallazgos,
      "Usá un token (bg-primary, text-muted-foreground…) o un semántico " +
        "(text-(--estrella), bg-(--velo)/45; src/themes/semanticos.css). " +
        "Si es una excepción de verdad, sumala a PERMITIDOS con su motivo."
    ).toEqual([]);
  });

  it("cada excepción sigue existiendo y tiene motivo", () => {
    for (const p of PERMITIDOS) {
      expect(
        p.motivo.trim().length,
        `${p.archivo} ${p.literal}`
      ).toBeGreaterThan(10);
      const source = readFileSync(p.archivo, "utf8");
      expect(
        source.includes(p.literal),
        `${p.archivo} ya no usa ${p.literal}: sacalo de PERMITIDOS`
      ).toBe(true);
    }
  });

  it("quien usa un color semántico importa su default (semanticos.css)", () => {
    // Sin el import, una tienda con su propio globals.css que recibe este
    // componente por template:sync se queda sin el color: la estrella sale
    // del color del texto y el velo de la portada desaparece.
    const uso = new RegExp(`\\(--(?:${SEMANTICOS.join("|")})\\)`);
    for (const archivo of [
      ...ARCHIVOS,
      ...archivos(path.join("src", "components", "admin")),
    ]) {
      const source = readFileSync(archivo, "utf8");
      if (!uso.test(source)) continue;
      expect(
        source,
        `${archivo} usa un semántico sin importar semanticos.css`
      ).toContain('import "@/themes/semanticos.css";');
    }
  });
});
