import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsearGuia } from "@/lib/guias";
import { idDeEncabezado, renderGuia } from "@/lib/markdown-guia";

/**
 * `src/lib/markdown-guia.ts`: el cuerpo de una guía va con
 * `dangerouslySetInnerHTML`, así que la mitad de esto son payloads. La regla
 * es la de `markdown.ts`: se escapa todo antes de agregar nada.
 */

describe("renderGuia — el formato que sí se acepta", () => {
  it("encabezados h2–h4 con id; un # suelto baja a h2", () => {
    expect(renderGuia("## Medidas y **talles**")).toBe(
      '<h2 id="medidas-y-talles">Medidas y <strong>talles</strong></h2>'
    );
    expect(renderGuia("### Uno\n\n#### Dos")).toBe('<h3 id="uno">Uno</h3><h4 id="dos">Dos</h4>');
    expect(renderGuia("# Título")).toBe('<h2 id="titulo">Título</h2>');
    expect(renderGuia("## Igual\n\n## Igual")).toBe(
      '<h2 id="igual">Igual</h2><h2 id="igual-2">Igual</h2>'
    );
  });

  it("párrafos, saltos de línea, listas y listas numeradas", () => {
    expect(renderGuia("Uno\ndos\n\nTres")).toBe("<p>Uno<br>dos</p><p>Tres</p>");
    expect(renderGuia("- a\n- *b*")).toBe("<ul><li>a</li><li><em>b</em></li></ul>");
    expect(renderGuia("1. a\n2. b\n\n- c")).toBe("<ol><li>a</li><li>b</li></ol><ul><li>c</li></ul>");
  });

  it("tablas con cabecera; una fila corta se completa", () => {
    expect(renderGuia("| A | B |\n|---|:--:|\n| 1 | **2** |\n| 3 |")).toBe(
      '<table><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead>' +
        "<tbody><tr><td>1</td><td><strong>2</strong></td></tr><tr><td>3</td><td></td></tr></tbody></table>"
    );
    // Sin la fila separadora no es una tabla.
    expect(renderGuia("| a | b |")).toBe("<p>| a | b |</p>");
  });

  it("citas, con formato adentro", () => {
    expect(renderGuia("> Uno\n> **dos**")).toBe(
      "<blockquote><p>Uno<br><strong>dos</strong></p></blockquote>"
    );
  });

  it("links: https:// con nofollow en otra pestaña; /ruta propia normal", () => {
    expect(renderGuia("[MIC](https://www.mic.gov.py/x)")).toBe(
      '<p><a href="https://www.mic.gov.py/x" rel="nofollow noopener" target="_blank">MIC</a></p>'
    );
    expect(renderGuia("[Colchones](/categoria/colchones)")).toBe(
      '<p><a href="/categoria/colchones">Colchones</a></p>'
    );
  });
});

describe("renderGuia — lo que no pasa", () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    "<svg onload=alert(1)>",
    "&lt;script&gt;",
  ];
  for (const payload of payloads) {
    it(`HTML crudo sale como texto: ${payload}`, () => {
      const html = renderGuia(payload);
      expect(html).not.toMatch(/<(script|img|svg)/i);
      expect(html.startsWith("<p>")).toBe(true);
    });
  }

  it("en un encabezado, una tabla, una cita o una lista también", () => {
    for (const texto of [
      "## <script>x</script>",
      "| <b>a</b> |\n|---|\n| <i>b</i> |",
      "> <script>x</script>",
      "1. <script>x</script>",
    ]) {
      expect(renderGuia(texto), texto).not.toMatch(/<(script|b|i)>/);
    }
  });

  it("destinos que no son https:// ni /ruta no son links", () => {
    for (const destino of [
      "javascript:alert(1)",
      "http://x.py",
      "//evil.example",
      "data:text/html,x",
      "mailto:a@b.py",
      " /espacio",
    ]) {
      expect(renderGuia(`[x](${destino})`), destino).not.toContain("<a ");
    }
  });

  it("una comilla en la URL no cierra el atributo", () => {
    const html = renderGuia('[x](https://a.py/"onmouseover="alert(1))');
    expect(html).not.toMatch(/href="[^"]*" onmouseover/);
    expect(html).toContain("&quot;");
  });

  it("el id de un encabezado sólo lleva a-z0-9-", () => {
    expect(idDeEncabezado('Año "nuevo" <x>')).toBe("ano-nuevo-x");
  });

  it("la guía de ejemplo entera: el <script> del archivo queda escapado", () => {
    const guia = parsearGuia(
      "como-elegir-en-el-navegador",
      readFileSync(
        join(process.cwd(), "tests/fixtures/guias/como-elegir-en-el-navegador.md"),
        "utf8"
      )
    );
    const html = renderGuia(guia.cuerpo);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain("<table>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain('<a href="/categoria/browser-fixtures">');
  });

  it("vacío es vacío", () => {
    expect(renderGuia("")).toBe("");
    expect(renderGuia(null)).toBe("");
  });
});
