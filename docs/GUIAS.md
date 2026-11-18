# Guías de compra — cómo se escriben

Para la sesión que escribe guías en una tienda. El plan es
`fable/plan-trafico.md` §2.3 y §6.5 (sólo en el template); esto es lo que
necesitás en la tienda.

## Qué es una guía

Un archivo `src/content/guias/<slug>.md` en el repo de la tienda. No hay
tabla, ni migración, ni editor en el panel: una guía se escribe en una rama,
se revisa en un PR y se publica con el deploy.

- `/guias` lista las publicadas (más nueva primero) y `/guias/<slug>` muestra
  una. Las dos son páginas estáticas, con canonical, `Article` y
  `BreadcrumbList`, y entran al sitemap con `actualizada` como fecha.
- La home muestra las tres más nuevas (sección de tema `guias`; un tema la
  mueve o la saca de su lista `home`). El pie lleva un link "Guías".
- Links en los dos sentidos: la guía muestra sus categorías y productos; una
  categoría o un producto muestra "Guías relacionadas" con las guías que lo
  nombran.
- Sin ninguna guía publicada: `/guias` da 404, no hay link en ningún lado y el
  sitemap no la nombra. El template no trae guías.
- Un borrador (`borrador: true`) da 404 en producción. Con `pnpm dev` se ve,
  con un aviso arriba.

`src/content/` es **de la tienda**: `pnpm template:sync` nunca pisa ni borra
un archivo de ahí, y `pnpm nueva-tienda` lo deja como está.

## El archivo

```markdown
---
titulo: Cómo elegir un colchón para dos
descripcion: "Medidas, firmeza y materiales: qué mirar antes de comprar un colchón de dos plazas en Paraguay, y qué preguntar por WhatsApp."
publicada: 2026-11-20
actualizada: 2026-11-20
borrador: false
categorias: [colchones]
productos:
  - colchon-resortes-140
faq:
  - pregunta: ¿Cada cuánto se cambia un colchón?
    respuesta: Depende del uso y del material; el fabricante lo indica.
fuentes:
  - titulo: Nombre de la fuente citada
    url: https://www.ejemplo.gov.py/pagina
---

Primer párrafo: a quién le sirve la guía y qué va a saber al terminar.

## Medidas

| Medida | Para |
|---|---|
| 140 × 190 | dos personas |

1. Paso uno.
2. Paso dos.

> Una cita o un aviso.

Ver la [categoría de colchones](/categoria/colchones).
```

**Front matter** (entre las dos líneas `---`):

| Clave | Obligatoria | Qué es |
|---|---|---|
| `titulo` | sí | El `<h1>` y el `<title>`. Máximo 70 caracteres |
| `descripcion` | sí | La meta description. Entre 110 y 160 caracteres. Con comillas si lleva `:` o `,` |
| `publicada` | sí | `YYYY-MM-DD` |
| `actualizada` | no | `YYYY-MM-DD`, no antes que `publicada`. Sin ella, vale `publicada`. Cambiala cuando cambie el contenido, no por una coma |
| `categorias` | una de las dos | Slugs de categoría: `[a, b]` o una lista `- a` |
| `productos` | una de las dos | Slugs de producto |
| `faq` | no | Pares `pregunta` / `respuesta`. Se muestran en la página; **no** se publican como `FAQPage` |
| `fuentes` | no | Pares `titulo` / `url` (`https://`). Se listan al final, con `nofollow` |
| `borrador` | no | `true` o `false` (default `false`) |
| `imagen` | no | `https://…` o una ruta propia `/…`. Va al `Article` y a la vista previa al compartir. Nunca una foto generada (decisión 8) |

Es un subconjunto chico de YAML: escalares, listas `[a, b]` o `- a`, y listas
de pares. Una clave desconocida, un `|` multilínea o una sangría rara son un
error del archivo, no algo que se adivina.

**Cuerpo** (markdown de guía, `src/lib/markdown-guia.ts`):

- encabezados `##`, `###`, `####`. **No** uses `#`: el `<h1>` es el `titulo`;
- párrafos, `**negrita**`, `*cursiva*`, listas `- ` y `1. `, tablas con
  `|` y la fila `|---|`, citas `> `;
- links `[texto](https://…)` (salen con `nofollow`, en otra pestaña) o
  `[texto](/categoria/x)` (internos, se siguen). Nada de `http://`, `mailto:`
  ni `//otro.sitio`: quedan como texto;
- **no hay HTML**: un `<b>` o un `<iframe>` salen escritos tal cual.

El nombre del archivo es la URL: minúsculas, números y guiones
(`como-elegir-un-colchon.md`).

## Reglas editoriales

1. **Nada inventado** (plan, decisión 8). Ni stock, plazo de entrega, costo de
   envío, precio, material, origen, certificación, reseña, testimonio o
   volumen de búsqueda que Anton, un proveedor o una fuente citada no hayan
   dado. Lo que falta se deja afuera o se marca `[COMPLETAR]` y se anota en el
   log de la sesión. Una guía con `[COMPLETAR]` no se publica: va con
   `borrador: true` hasta que alguien complete el dato.
2. **Para una compradora en Paraguay**, en `es-PY` (voseo: "elegí", "mirá"),
   en guaraníes cuando hay plata, con las medidas que se usan acá.
3. **Una intención de búsqueda por guía.** "Cómo elegir un colchón para dos"
   y "colchón de resortes o de espuma" son dos guías, no una.
4. **Cada afirmación que no es de sentido común lleva su fuente** en
   `fuentes`, con un link `https://` a la página exacta.
5. **Al menos un link a una categoría** de la tienda: en `categorias` y, si
   suma, en el texto (`/categoria/<slug>`).
6. Sin precios en el texto (cambian; la ficha del producto los tiene
   frescos) y sin promesas que la tienda no hizo.

## Lo que el test exige

`tests/unit/guias-contenido.test.ts` corre con `pnpm test` en cada PR y lee
`src/content/guias/`. Frena el PR si:

- un archivo no se puede leer (front matter roto, clave desconocida);
- el nombre del archivo no es un slug;
- `titulo` falta o pasa de 70 caracteres;
- `descripcion` no está entre 110 y 160 caracteres;
- `publicada` o `actualizada` no es una fecha `YYYY-MM-DD` real, o
  `actualizada` es anterior;
- dos guías tienen el mismo título;
- un link del cuerpo no es `https://` ni una ruta `/…`, o una fuente no es
  `https://`, o la imagen no es ni una ni otra;
- la guía no nombra ninguna categoría ni producto;
- el cuerpo está vacío o usa un `#` (h1);
- una guía publicada (sin `borrador: true`) tiene `[COMPLETAR]`.

Y **informa** (no frena) los slugs de categoría y producto que nombra cada
guía. Si uno no existe en el catálogo, la página lo saltea y lo deja en el log
del servidor (`guias: slugs que el catálogo no tiene`); nunca rompe el build.
Confirmalos contra `/admin` o el sitemap de la tienda antes del PR.

Para correrlo solo:

```bash
pnpm exec vitest run --project unit tests/unit/guias-contenido.test.ts
```

## Checklist antes del PR

- [ ] Un archivo por guía, nombre = slug.
- [ ] `titulo` ≤ 70, `descripcion` 110–160, fechas reales.
- [ ] Al menos una categoría; los slugs existen en el catálogo.
- [ ] Cada dato que no es de sentido común tiene su fuente `https://`.
- [ ] Nada inventado; lo que falta, `[COMPLETAR]` + `borrador: true` + el log.
- [ ] `pnpm test` verde.
- [ ] Mirada en `pnpm dev`: `/guias`, la guía, y la categoría que nombra.

## Para el template (no para la tienda)

- `src/lib/guias.ts` (lectura, reglas) y `src/lib/markdown-guia.ts` son
  maquinaria; `src/app/guias/**` es mixto (piel sobre maquinaria);
  `src/components/guia-*.tsx` es piel.
- Las páginas leen los archivos al construirse (`generateStaticParams`,
  `dynamicParams = false`, ISR de 5 minutos por los links al catálogo). Home,
  categoría, producto y sitemap los leen al regenerarse, memoizados por
  proceso. Corre igual con `next start` en Hostinger.
- Los tests de navegador construyen con `GUIAS_DIR=tests/fixtures/guias`
  (`tests/e2e/guias.spec.ts`). La variable sólo se acepta adentro de
  `tests/fixtures/`: no es una variable de la tienda.
