# Guías de esta tienda

Cada guía es un archivo `<slug>.md` en esta carpeta: front matter entre dos
`---` y el cuerpo en markdown. El nombre del archivo es la URL:
`como-elegir-un-colchon.md` → `/guias/como-elegir-un-colchon`.

El formato, las reglas editoriales y lo que el test exige están en
`docs/GUIAS.md`. Antes de abrir el PR: `pnpm test tests/unit/guias-contenido.test.ts`.

Esta carpeta es **de la tienda**: `pnpm template:sync` nunca la pisa ni la
borra, y `pnpm nueva-tienda` la deja como está. El template no trae guías:
mientras no haya ninguna publicada, `/guias` da 404, el pie no tiene link y el
sitemap no la nombra.

Este README no es una guía (se ignora).
