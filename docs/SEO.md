# SEO — qué publica el template, qué escribe la tienda

Desde O35 (fable/plan-trafico.md §2.4). El código está en `src/lib/seo.ts`
(maquinaria); las páginas sólo traen los datos y lo llaman.

## 1. Qué publica el template en cada página

| Página | `<title>` / descripción | Datos estructurados | Sitemap |
|---|---|---|---|
| Home `/` | título y descripción SEO de `/admin/ajustes` → Identidad (si no, `titulo` y `descripcion` de `tienda.ts`) | `Organization` (con logo, contacto y redes si están cargados) y `WebSite` con el buscador | sí, con la fecha del último producto |
| Categoría `/categoria/<slug>` | título SEO > nombre; descripción SEO > descripción (texto) > "{nombre} en guaraníes, IVA incluido." | `ItemList` de la grilla, `BreadcrumbList` | sí; canonical sin filtros, los filtros no se indexan |
| Producto `/producto/<slug>` | título SEO > nombre; descripción SEO > descripción > nombre y precio | `Product` (o `ProductGroup` con variantes), `Offer` por variante con precio (§2), reseñas aprobadas, envío y devoluciones **sólo** si el dueño los cargó, `BreadcrumbList` | sí, con hasta 5 fotos públicas (`<image:image>`) |
| Políticas `/envios`, `/devoluciones`, `/preguntas-frecuentes`, `/terminos`, `/privacidad` | el título y el texto del panel | — | sí, las prendidas |
| Contacto `/contacto` | "Contacto" y los medios cargados | — (el `Organization` de la home ya lo dice) | sí, si hay algún dato |
| Guías `/guias`, `/guias/<slug>` (O34, `docs/GUIAS.md`) | `titulo` y `descripcion` del archivo | `Article`, `BreadcrumbList` | sí, con `actualizada` como fecha |
| `/feed.xml` (Merchant Center, Meta) | — | — | no; sólo productos que se pueden pagar en la página |

`robots.txt` bloquea panel, API, checkout, pedidos, cuentas, favoritos y
comparar (`RUTAS_PRIVADAS`). Sin `NEXT_PUBLIC_SITE_URL` no hay sitemap ni
`url` en los datos estructurados: un dominio inventado es peor que nada.

**Fotos que salen afuera** (JSON-LD, sitemap, feed, la imagen para compartir):
nunca una ilustrativa; una sin marcar según `PUBLIC_FACTS.publishUnknownImages`.

**`/contacto`** muestra sólo lo que está en `/admin/ajustes` → Contacto (y
`WHATSAPP_NUMBER` para el WhatsApp): WhatsApp, e-mail, dirección, horario y
redes. Nada de envíos, plazos ni devoluciones. Sin ningún dato es 404, y no va
al pie ni al sitemap. Es piel: una tienda que ya tiene su
`src/app/contacto/` la conserva en `template:sync` (acción `conservar`).

## 2. Disponibilidad

Una función decide, en el servidor (`src/domain/disponibilidad.ts`); la línea
de la ficha y el `Offer` reciben la misma palabra. A la página sólo llega la
palabra: ningún dato del proveedor (nombre, costo, stock, fecha).

| Caso | Palabra | schema.org |
|---|---|---|
| Stock propio disponible > 0 | En stock | `InStock` |
| `enquiry` (por columna, o `stock` en modo consulta), con `proveedores: true` y la oferta preferida —activa y confirmada— con stock > 0 mirado en los últimos 7 días | En stock | `InStock` |
| `enquiry` en cualquier otro caso | Por encargo | `BackOrder` |
| `stock` sin nada disponible (modo carrito) | Sin stock | `OutOfStock` |
| `showcase` | — (sin línea, sin `Offer`) | — |

Un `Offer` necesita un precio que se muestra y se cobra: precio oculto o
`showcase`, sin `Offer`; nunca un precio 0 ni una lista `offers` vacía.

## 3. Qué escribe cada tienda

El template no inventa textos. Lo que una tienda escribe y revisa:

- **Categorías**: descripción de 120–250 palabras que ayude a elegir, título
  SEO ≤ 60 caracteres (las palabras de la búsqueda primero, la marca al
  final), descripción SEO de 110–160. Van en `src/content/categorias.json` y
  se cargan con `pnpm categorias:aplicar` (§4).
- **Productos**: descripción (≥ 50 palabras), al menos una foto, descripción
  SEO de 110–160 (en el panel o en la planilla del catálogo,
  `docs/CATALOGO-CSV.md`). El título SEO es opcional.
- **Home**: título y descripción SEO (`/admin/ajustes` → Identidad).
- **Guías**: `src/content/guias/` según `docs/GUIAS.md`.
- **Políticas y contacto**: lo verdadero para esta tienda. Ninguna tarifa,
  zona o plazo que el dueño no haya dado.

## 4. `src/content/categorias.json` y `pnpm categorias:aplicar`

Una lista; cada categoría:

```json
[
  {
    "slug": "anillos-de-compromiso",
    "nombre": "Anillos de compromiso",
    "padre": "anillos",
    "posicion": 1,
    "descripcion": "Texto en markdown, 120–250 palabras…",
    "seoTitulo": "Anillos de compromiso en Paraguay",
    "seoDescripcion": "110 a 160 caracteres…"
  }
]
```

Obligatorios `slug` (minúsculas, números y guiones) y `nombre`; el resto
opcional. `padre` es el slug de otra categoría del archivo o de la base.
`posicion` falta = el orden del archivo.

```
pnpm categorias:aplicar                    # ensayo: muestra qué haría, no escribe
pnpm categorias:aplicar --aplicar          # escribe
pnpm categorias:aplicar --aplicar --pisar  # y reemplaza lo que ya había
pnpm categorias:aplicar otro.json          # otro archivo
```

- Valida el archivo entero antes de escribir: slug repetido, madre que no
  existe, ciclo o un campo inválido frenan todo.
- Una transacción. Nunca borra, activa ni desactiva una categoría.
- En una que ya existe llena sólo los campos vacíos (madre, descripción,
  título y descripción SEO); `--pisar` reemplaza también nombre, madre y
  posición. Un texto que el archivo no trae nunca borra el de la base.
- Una línea por categoría: `+` nueva, `~` cambia (y qué), `=` igual.
- Necesita `DATABASE_URL`. La vidriera lo muestra en el próximo revalidate
  (5 minutos como mucho).

## 5. `pnpm seo:auditar`

Sólo lee. Una fila por hallazgo: tipo (categoría, producto, guía), slug y qué
falta. `--json` para sesiones; `--estricto` sale con 1 si hay alguno. Una
tienda trabaja hasta que `--estricto` da 0.

Controles y umbrales (las constantes de arriba de `scripts/seo-auditar.ts`):

| Control | Sobre | Hallazgo cuando |
|---|---|---|
| sin descripción | categoría, producto | vacía |
| descripción corta / larga | categoría | < 120 o > 250 palabras |
| descripción corta | producto | < 50 palabras |
| sin título SEO | categoría | vacío |
| título SEO largo | categoría, producto | > 60 caracteres |
| sin descripción SEO | categoría, producto | vacía |
| descripción SEO fuera de rango | categoría, producto | < 110 o > 160 caracteres |
| sin fotos | producto | ninguna foto que no sea ilustrativa |
| título repetido | categoría, producto | dos páginas con el mismo título efectivo (SEO > nombre) |
| guía que no se puede leer | guía | el archivo no se parsea |
| guía con problemas | guía | lo que marca `problemasDeGuias` (docs/GUIAS.md) |
| guía que apunta a algo que no existe | guía publicada | nombra una categoría o producto que no está publicado |
| ninguna guía la nombra | categoría | ninguna guía publicada la nombra |

Revisa categorías activas y productos publicados. Los controles de guías
corren sólo si existe `src/lib/guias.ts` (O34); si no, la salida lo dice.

## 6. Salir en Google — lo que hace Anton

1. **Search Console**: propiedad de **dominio** (`tienda.com.py`), verificada
   con el registro TXT en el DNS (Cloudflare, nube gris).
2. **Sitemap**: en Search Console → Sitemaps, enviar
   `https://<dominio>/sitemap.xml`. Requiere `NEXT_PUBLIC_SITE_URL` puesto.
3. **GA4**: el id de medición (`G-…`) en `/admin/integraciones` → Medición.
4. Opcional, cuando la tienda cobre: Merchant Center con `/feed.xml` (en modo
   consulta sale vacío a propósito).
