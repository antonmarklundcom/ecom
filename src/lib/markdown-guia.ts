/**
 * Markdown → HTML seguro para el cuerpo de una guía (fable/plan-trafico.md
 * §2.3). La descripción de un producto sigue con el renderer chico de
 * `markdown.ts`; éste es su hermano grande y sigue **la misma regla**:
 *
 * **Se escapa TODO primero y recién después se agrega el HTML propio.** No
 * hay HTML crudo: un `<script>` en el archivo sale como texto `&lt;script&gt;`.
 *
 * Lo que entiende:
 *
 * - encabezados `##`, `###`, `####` (h2–h4). El `<h1>` de la página es el
 *   `titulo` de la guía, así que un `#` suelto baja a `h2` (y el test de
 *   contenido lo marca);
 * - párrafos, `**negrita**`, `*cursiva*`;
 * - listas `- ` y listas numeradas `1. `;
 * - tablas con `|` y la fila separadora `|---|---|`;
 * - citas `> `;
 * - links: `https://…` salen con `rel="nofollow noopener"` y en otra pestaña;
 *   una ruta propia `/…` es un link interno normal (sí se sigue: es la tienda
 *   enlazándose a sí misma). Cualquier otro destino (`http:`, `javascript:`,
 *   `//otro.sitio`, `mailto:`) no es un link: queda el texto tal cual.
 *
 * Sin APIs de Node, como `markdown.ts`.
 */

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Marcas de línea sobre texto **ya escapado**. Mismo orden que `markdown.ts`. */
function enLinea(escapado: string): string {
  return escapado
    .replace(
      /\[([^\]]+)\]\(((?:https:\/\/|\/(?!\/))[^\s)]*)\)/g,
      (_todo, texto: string, destino: string) =>
        destino.startsWith("https://")
          ? `<a href="${destino}" rel="nofollow noopener" target="_blank">${texto}</a>`
          : `<a href="${destino}">${texto}</a>`
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

const linea = (texto: string): string => enLinea(escapar(texto.trim()));

/**
 * El `id` de un encabezado, para enlazar a una sección (`/guias/x#medidas`).
 * Sólo `a-z0-9-`: sale del texto sin tildes, así que no puede llevar nada que
 * cierre el atributo.
 */
export function idDeEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\*+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** `| a | b |` → `["a", "b"]`. */
function celdas(fila: string): string[] {
  return fila
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((celda) => celda.trim());
}

const ES_SEPARADOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const ES_FILA = /^\s*\|.*\|\s*$/;

type Bloque =
  | { tipo: "p"; lineas: string[] }
  | { tipo: "ul" | "ol"; items: string[] }
  | { tipo: "cita"; lineas: string[] };

/**
 * Cuerpo de guía → HTML. La salida no lleva `class` ni `style`: la piel la
 * estila desde afuera (`.guia-cuerpo h2`, `.guia-cuerpo table`).
 */
export function renderGuia(texto: string | null | undefined): string {
  if (!texto) return "";
  const salida: string[] = [];
  const ids = new Map<string, number>();
  // `as`: sin él, TS angosta a `null` y no ve que `cerrar()` lo reasigna.
  let abierto = null as Bloque | null;

  const cerrar = (): void => {
    if (!abierto) return;
    if (abierto.tipo === "p") {
      salida.push(`<p>${abierto.lineas.map(linea).join("<br>")}</p>`);
    } else if (abierto.tipo === "cita") {
      salida.push(
        `<blockquote>${renderGuia(abierto.lineas.join("\n"))}</blockquote>`
      );
    } else {
      salida.push(
        `<${abierto.tipo}>${abierto.items
          .map((item) => `<li>${linea(item)}</li>`)
          .join("")}</${abierto.tipo}>`
      );
    }
    abierto = null;
  };

  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lineas.length; i += 1) {
    const actual = lineas[i]!;

    if (actual.trim() === "") {
      cerrar();
      continue;
    }

    const encabezado = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(actual);
    if (encabezado) {
      cerrar();
      const nivel = Math.max(2, encabezado[1]!.length);
      const base = idDeEncabezado(encabezado[2]!) || "seccion";
      const vistas = ids.get(base) ?? 0;
      ids.set(base, vistas + 1);
      const id = vistas === 0 ? base : `${base}-${vistas + 1}`;
      salida.push(`<h${nivel} id="${id}">${linea(encabezado[2]!)}</h${nivel}>`);
      continue;
    }

    // Tabla: una fila con `|` seguida de la separadora.
    if (ES_FILA.test(actual) && ES_SEPARADOR.test(lineas[i + 1] ?? "")) {
      cerrar();
      const cabecera = celdas(actual);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && ES_FILA.test(lineas[i]!)) {
        filas.push(celdas(lineas[i]!));
        i += 1;
      }
      i -= 1;
      salida.push(
        `<table><thead><tr>${cabecera
          .map((celda) => `<th scope="col">${linea(celda)}</th>`)
          .join("")}</tr></thead><tbody>${filas
          .map(
            (fila) =>
              `<tr>${cabecera
                .map((_c, indice) => `<td>${linea(fila[indice] ?? "")}</td>`)
                .join("")}</tr>`
          )
          .join("")}</tbody></table>`
      );
      continue;
    }

    const cita = /^\s*>\s?(.*)$/.exec(actual);
    if (cita) {
      if (abierto?.tipo !== "cita") {
        cerrar();
        abierto = { tipo: "cita", lineas: [] };
      }
      abierto.lineas.push(cita[1]!);
      continue;
    }

    const item = /^\s*[-*]\s+(.*)$/.exec(actual);
    const numerado = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(actual);
    if (item || numerado) {
      const tipo = item ? "ul" : "ol";
      if (abierto?.tipo !== tipo) {
        cerrar();
        abierto = { tipo, items: [] };
      }
      abierto.items.push((item ?? numerado)![1]!);
      continue;
    }

    if (abierto?.tipo !== "p") {
      cerrar();
      abierto = { tipo: "p", lineas: [] };
    }
    abierto.lineas.push(actual);
  }
  cerrar();
  return salida.join("");
}
