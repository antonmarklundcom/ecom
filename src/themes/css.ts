import {
  COLORES,
  SEMANTICOS,
  type Escala,
  type Paleta,
  type PaletaSemantica,
  type Tema,
} from "./tipos";

/**
 * De los temas (datos) al CSS (`src/themes/temas.css`). Puro: lo usan
 * `pnpm temas:css`, que escribe los archivos, y `temas.test.ts`, que falla si
 * el CSS commiteado no es lo que sale de acá.
 *
 * Cómo queda la cascada, de menor a mayor:
 *
 *   1. El tema base en `:root` / `.dark`, sin condición: una tienda cuyo
 *      `layout.tsx` es de antes del kit (sin `data-tema` en `<html>`) se ve
 *      exactamente como antes.
 *   2. Cada otro tema en `:root:where([data-tema="x"])`. `:where()` no suma
 *      especificidad: el selector pesa lo mismo que `:root`, gana por estar
 *      después, y un `:root { … }` de `custom.css` (que va último) le gana a
 *      él sin pelear con `!important`.
 *   3. El color de marca de `/admin/ajustes`, que va en el `style` de
 *      `<html>` y le gana a todo (`src/lib/marca.ts`, sin cambios).
 */

const AVISO = `/*
 * GENERADO por \`pnpm temas:css\` desde \`src/themes/presets.ts\`: no lo
 * edites a mano (el próximo \`pnpm temas:css\` lo pisa y \`temas.test.ts\`
 * falla mientras tanto). Para retocar la tienda, \`src/themes/custom.css\`;
 * para cambiar un tema, su archivo en \`src/themes/presets/\`.
 */`;

/** Lo que la escala de un tema pisa, adentro del header, el pie y la home. */
const ZONA_VIDRIERA = "[data-site-header], [data-site-footer], [data-vidriera]";

function declaraciones(
  paleta: Paleta & PaletaSemantica,
  radio: string | null
): string[] {
  const lineas: string[] = [];
  if (radio !== null) lineas.push(`  --radius: ${radio};`);
  for (const color of COLORES) lineas.push(`  --${color}: ${paleta[color]};`);
  for (const semantico of SEMANTICOS) {
    const valor = paleta[semantico];
    if (valor !== undefined) lineas.push(`  --${semantico}: ${valor};`);
  }
  return lineas;
}

function declaracionesEscala(escala: Escala): string[] {
  const lineas: string[] = [];
  if (escala.espaciado) lineas.push(`  --spacing: ${escala.espaciado};`);
  if (escala.ancho) lineas.push(`  --container-6xl: ${escala.ancho};`);
  for (const [tamano, valor] of Object.entries(escala.texto ?? {})) {
    if (valor) lineas.push(`  --text-${tamano}: ${valor};`);
  }
  return lineas;
}

function regla(selector: string, lineas: string[]): string {
  return `${selector} {\n${lineas.join("\n")}\n}`;
}

/** Los bloques del tema base, sin condición. */
function bloquesBase(base: Tema): string[] {
  const bloques = [
    regla(":root", declaraciones(base.tokens.claro, base.tokens.radio)),
    regla(".dark", declaraciones(base.tokens.oscuro, null)),
  ];
  const escala = base.tokens.escala;
  if (escala && declaracionesEscala(escala).length > 0) {
    bloques.push(
      regla(`:where(${ZONA_VIDRIERA})`, declaracionesEscala(escala))
    );
  }
  return bloques;
}

/** Los bloques de un tema que no es el base, sólo con su `data-tema`. */
function bloquesScoped(tema: Tema): string[] {
  const attr = `[data-tema="${tema.id}"]`;
  const bloques = [
    regla(
      `:root:where(${attr})`,
      declaraciones(tema.tokens.claro, tema.tokens.radio)
    ),
    regla(
      `:where(${attr}) .dark,\n.dark:where(${attr})`,
      declaraciones(tema.tokens.oscuro, null)
    ),
  ];
  const escala = tema.tokens.escala;
  if (escala && declaracionesEscala(escala).length > 0) {
    bloques.push(
      regla(
        `:where(${attr})\n  :where(${ZONA_VIDRIERA})`,
        declaracionesEscala(escala)
      )
    );
  }
  return bloques;
}

/** `src/themes/temas.css` entero. */
export function cssDeTemas(temas: readonly Tema[], base: Tema): string {
  const partes = [AVISO, `/* ${base.id} (base) */`, ...bloquesBase(base)];
  for (const tema of temas) {
    if (tema.id === base.id) continue;
    partes.push(`/* ${tema.id} */`, ...bloquesScoped(tema));
  }
  return `${partes.join("\n\n")}\n`;
}

/**
 * Los bloques `:root` / `.dark` de un archivo de `src/styles/temas/` (el
 * formato de antes del kit), sin condición: ese archivo se importa solo, en
 * lugar de `temas.css`, desde un `globals.css` viejo.
 */
export function cssLegado(tema: Tema): string {
  return (
    regla(":root", declaraciones(tema.tokens.claro, tema.tokens.radio)) +
    "\n\n" +
    regla(".dark", declaraciones(tema.tokens.oscuro, null)) +
    "\n"
  );
}

/**
 * Reescribe los bloques de un archivo legado y deja su comentario de
 * cabecera (para quién es, fuentes) como está. Sin `:root {`, `null`.
 */
export function sincronizarLegado(source: string, tema: Tema): string | null {
  const inicio = source.search(/^:root \{/m);
  if (inicio === -1) return null;
  return source.slice(0, inicio) + cssLegado(tema);
}
