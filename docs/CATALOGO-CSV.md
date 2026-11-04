# La planilla del catálogo (CSV / Excel)

**Un solo formato** para las tres puntas:

- el export del panel (`/admin/productos` → "Descargar CSV", sólo el dueño),
- la importación del panel (`/admin/productos` → "Cargar planilla"),
- la CLI, `pnpm importar:productos <archivo.csv|.xlsx>`.

Un archivo que baja una tienda entra en otra sin tocarlo, y exportar e
importar el mismo archivo no cambia nada. La definición de columnas vive en
un solo lugar, `src/domain/catalog-csv.ts` (los nombres salen de
`csv.producto.*` en `src/i18n/es-PY.ts`), y la usan el export
(`src/domain/catalog-export.ts`) y el importador (`src/domain/catalog-import.ts`).

Datos de ejemplo para probar: `scripts/fixtures/catalogo-demo.csv` (20
productos genéricos, con variantes, precio antes, uno en consulta, uno con
precio oculto y algunos con proveedor):

```sh
pnpm importar:productos scripts/fixtures/catalogo-demo.csv            # ensayo
pnpm importar:productos scripts/fixtures/catalogo-demo.csv --aplicar  # escribe
```

## El archivo

- **Una fila por variante.** Las filas de un mismo producto comparten
  Producto, Categoría y Slug (o el slug que sale del nombre). Los datos de
  producto (Descripción, Marca, IVA, Fotos, Modo de venta, Mostrar precio, URL
  proveedor) alcanza con ponerlos en la primera fila; si otra fila los repite,
  tienen que decir lo mismo.
- **Separador `;` o `,`**, como venga (Excel en español usa `;`; Google Sheets
  baja con `,` según la cuenta). UTF-8, con o sin BOM. El export sale con `;`,
  BOM y CRLF para que Excel lo abra bien.
- **Excel (`.xlsx`)**: las mismas columnas, en la **primera hoja**; las demás
  hojas se ignoran. Las fórmulas valen por su resultado.
- **Encabezados**: sin distinguir mayúsculas ni acentos, y el `(₲)` es
  decorativo: `Categoría`, `categoria` y `CATEGORIA` son la misma columna.
- **Plata**: guaraníes enteros. `285000`, `285.000` y `₲ 285.000` valen;
  `28.50` o `285,000` son un error (no se adivina un precio).
- **Límites**: el panel acepta archivos de hasta **10 MB** y **5000 filas**
  (el mismo techo del export, así todo lo que baja vuelve a entrar). Más que
  eso es un error claro: partí el archivo. La CLI no tiene techo de filas.

## Las columnas, en el orden del export

| # | Columna | Obligatoria | Qué es | Vacía en una columna presente |
|---|---|---|---|---|
| 1 | `SKU` | sí | La clave de la variante. Única en toda la tienda, sin distinguir mayúsculas ni acentos (como la base). | — (error) |
| 2 | `Producto` | sí | Nombre del producto. | — (error) |
| 3 | `Categoría` | sí | Por nombre; si no existe, se crea al final del menú. | — (error) |
| 4 | `Variante` | | Etiqueta ("Negro", "XL"). | no se toca; "Único" en un alta |
| 5 | `Precio (₲)` | sí | Precio de venta. Mayor a 0 para vender con stock. | — (error), salvo consulta/vidriera: ₲0 |
| 6 | `Stock` | | `on_hand`. En una variante existente **sólo se escribe con "pisar stock"**. | no se toca; 0 en un alta |
| 7 | `Descripción` | | Texto del producto. | **se borra** |
| 8 | `Marca` | | | **se borra** |
| 9 | `IVA` | | `10`, `5` o `0`. | no se toca; 10 en un alta |
| 10 | `Precio antes (₲)` | | El precio tachado. `0` es un valor guardado y vuelve igual. | **se borra** |
| 11 | `Slug` | | La URL del producto. Es **cómo se encuentra el producto**: sin Slug sale del nombre. | sale del nombre |
| 12 | `Fotos` | | URLs `https://` separadas por `\|`, espacio o salto de línea; hasta 10 por producto. | nada que subir |
| 13 | `Proveedor` | | Nombre del proveedor de la variante (oferta). Sólo con proveedores. | no hay oferta en la fila |
| 14 | `URL proveedor` | | Enlace privado de compra del producto (`https://`, sin usuario ni contraseña). Sólo con proveedores. | **se borra** |
| 15 | `Costo proveedor` | | Costo unitario en ₲ de esa oferta. Sólo con proveedores. | se borra (y deja de ser preferida) |
| 16 | `Stock proveedor` | | Lo que el proveedor dijo tener. Informativo: **no es stock vendible**. Sólo con proveedores. | se borra |
| 17 | `Modo de venta` | | `stock`, `enquiry` (consulta por WhatsApp) o `showcase` (vidriera). Vale para todas las tiendas. | no se toca; `stock` en un alta |
| 18 | `Mostrar precio` | | `sí`/`no` (también `true`/`false`, `1`/`0`). `stock` exige precio visible. | no se toca; sí en un alta |

**Ausente no es vacío.** Una columna que el archivo no trae **no toca** lo
guardado: la planilla del proveedor con SKU, Producto, Categoría y Precio
cambia sólo precios. Una celda vacía en una columna presente hace lo que dice
la última columna de la tabla.

Las columnas 13–16 van entre Fotos y Modo de venta **sólo cuando la tienda
maneja proveedores**; si no, el export no las escribe y el resto conserva su
orden.

### Encabezados que también se aceptan (alias)

Archivos de tiendas anteriores y planillas armadas a mano:

| Canónica | También |
|---|---|
| `Producto` | `Nombre` |
| `Fotos` | `Imagenes`, `Imagen`, `Foto` |
| `Modo de venta` | `Modo venta`, `sale_mode` |
| `Mostrar precio` | `show_price` |
| `URL proveedor` | `Enlace proveedor`, `Enlace de compra` |
| `Costo proveedor` | `Costo` |

Además, la importación entiende columnas avanzadas que el export no escribe
(su ausencia es "no lo cambies"): `Ficha técnica JSON`, `Proveedor JSON` (la
fuente de un dato verificado, no la oferta), `Atributos variante JSON`,
`Identificadores JSON`, `Título SEO`, `Descripción SEO`. Ver
docs/TEMPLATE-INHERITANCE.md.

Una columna que no es ninguna de éstas **se avisa y se ignora** (no frena):
suele ser un encabezado mal escrito.

### Lo que escribe el export

- Todas las variantes que se ven con los filtros puestos, ordenadas por
  producto (nombre, slug) y por el orden de las variantes.
- `Precio`, `Stock`, `Costo` como enteros pelados (la planilla los suma).
- `Mostrar precio` como `true`/`false`.
- `Fotos`: las URLs públicas de las fotos del producto, en la primera fila de
  cada producto. Otra tienda que importa el archivo las sube a su propio
  almacenamiento; la misma tienda no las vuelve a subir.
- Proveedor, Costo y Stock proveedor de la oferta **preferida** de cada
  variante; URL proveedor de `products.supplier_url`.

## Proveedores: qué se escribe y cuándo

Sólo con `proveedores: true` en `src/config/tienda.ts`
(`proveedoresHabilitados()`) y, en el panel, con la capacidad `precios` (un
costo es plata). Sin eso:

- el export **no escribe** las cuatro columnas,
- la vista previa no muestra nada de proveedores,
- y si un archivo las trae (exportado por una tienda que sí los usa) **se
  ignoran con un aviso** — no es un error, el resto del archivo entra igual.

Con proveedores:

- **URL proveedor → `products.supplier_url`** (dato del producto).
- **Proveedor + Costo + Stock proveedor → una oferta de la variante**
  (`supplier_offers`). La identidad es **(variante, nombre del proveedor)**,
  sin mayúsculas ni acentos: la fila actualiza la oferta de esa variante con
  ese nombre, o crea una si no hay. Reimportar el mismo archivo no duplica
  nada, y las otras ofertas de la variante (alternativas cargadas en el
  panel) quedan como están.
- Una oferta **con costo** queda como **la preferida** de la variante —activa
  y confirmada: la planilla del dueño dice "a éste se lo compro y a tanto"— y
  la que lo era deja de serlo (sigue ahí). Sin costo no puede ser preferida.
- Costo o Stock proveedor sin nombre en Proveedor es un error de la fila.
- Una oferta nueva entra con tipo "Otro"; el tipo, los enlaces de la oferta y
  las notas se editan en el panel y la planilla no los toca.

## Cómo se importa

1. **Revisar** (panel) o correr sin `--aplicar` (CLI): no escribe nada.
   Muestra los errores **todos juntos, con número de línea**, los avisos
   (columnas ignoradas), cuántos productos y variantes son nuevos o se
   actualizan, categorías a crear, fotos a subir, ofertas de proveedor, y
   en cuántos lotes se va a escribir.
2. **Posibles repetidos**: productos con el mismo nombre y otro slug, nombres
   casi iguales en la misma categoría, un slug que ya existe sin ningún SKU en
   común (sus variantes se sumarían a ese producto), una foto o una URL de
   proveedor compartida. Son avisos, no errores: el panel no deja confirmar
   hasta marcarlos como revisados, y la CLI pide `--revisado`. Si es el mismo
   producto, poné en Slug el del que ya existe.
3. **Confirmar** (panel) o `--aplicar` (CLI): se escribe **por lotes de 25
   productos** (`CATALOG_IMPORT_LOTE`), en el orden del archivo. **Cada lote
   entra entero o no entra** (categorías nuevas, productos, variantes y
   ofertas en una transacción); un lote que falla no deshace los anteriores.
   Cada lote se vuelve a planificar contra la base de ese momento.
4. **Fotos**, después del commit de cada lote: sólo a productos que todavía no
   tienen ninguna (así reimportar no duplica). Sin almacenamiento de fotos
   configurado se avisa y se sigue sin ellas.

Reglas que protegen lo cargado (docs/TEMPLATE-IMPROVEMENT-PLAN.md C1–C7):

- **Idempotente por SKU y slug**: reimportar el mismo archivo no cambia nada.
- **Un SKU es de un solo producto**: un SKU que ya es de otro producto (con
  otra mayúscula o acento incluido) es un error en la vista previa y, si
  aparece después, frena su lote.
- **El stock existente no se pisa** salvo "pisar stock" / `--pisar-stock`.
- **Lo nuevo entra como borrador**; lo existente no cambia de activo, de
  publicado ni de orden.
- **Precios y stock en masa son del dueño** (`precios.masivo`): el personal
  puede importar productos y textos; un archivo que cambia precios o pisa
  stock lo aplica el dueño.
- Cada precio y stock que cambia queda auditado con quién lo hizo.

### Si se corta la conexión

El panel pide los lotes de a uno y muestra cuáles quedaron guardados. Si la
conexión se corta **mientras se guarda un lote**, el navegador no puede saber
si ese lote entró o no: lo dice así, con los productos de los lotes
confirmados. **Mirá el catálogo y volvé a Revisar el archivo antes de
reintentar**: como la importación es idempotente, reimportar el archivo
entero termina el trabajo sin duplicar. Lo mismo si un lote falla por un
error: corregí y volvé a importar el archivo completo.

### Una limitación

Sin la columna `Modo de venta`, el precio se valida como si el producto fuera
de venta con stock: una fila con ₲0 de un producto en consulta o vidriera es
un error. Para esos productos, dejá la columna (el export la trae siempre).
