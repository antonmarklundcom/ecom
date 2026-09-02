# KNOWN-ISSUES.md

Cosas menores o bloqueadas que aparecieron durante las fases de `fable/plan.md`
y que no valían un desvío. Cada entrada dice qué es, por qué no se arregló y
cuál sería el arreglo. Si una entrada se resuelve, se borra.

## Bloqueado: `xlsx` sigue en 0.18.5 (F1) — fase O1

El plan (§5.1 A) pide reemplazar la fuente del paquete por el tarball oficial de
SheetJS. **No se pudo hacer en la sesión de O1**: el proxy de egreso del entorno
de Claude Code niega `cdn.sheetjs.com` con un 403 de política
(`connect_rejected`), así que ni `pnpm install` puede bajar el tarball ni se lo
puede vendorizar en `vendor/` — no hay forma de traer los bytes. El registry de
npm sí está permitido, pero npm no tiene ninguna versión parcheada: 0.18.5 es la
última que SheetJS publicó ahí.

Estado: `package.json` sigue con `"xlsx": "^0.18.5"` y `pnpm audit` sigue
listando GHSA-4r6h-8v6p-xvw6 (prototype pollution) y GHSA-5pgg-2g8v-p4x9
(ReDoS). El resto de O1 (bordes de Zod, test de `proxy()`, test de
`spreadsheetToCsvText`) sí está hecho.

Cómo se destraba, en orden de preferencia:

1. Habilitar `cdn.sheetjs.com` en la política de red del entorno de Claude Code
   (o correr el cambio desde una máquina sin ese proxy) y hacer el swap:
   `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (verificar en
   https://cdn.sheetjs.com si hay una 0.20.x más nueva), `pnpm install`, lockfile
   commiteado, `pnpm audit` sin `xlsx`, y la nota en NEW-STORE.md
   §"Arreglos que aparecen después" avisando que Dependabot **no** mueve este
   paquete: se sube a mano mirando el CDN.
2. Vendorizar el tarball en `vendor/` desde una máquina con acceso y apuntar
   `package.json` ahí (`"xlsx": "file:vendor/xlsx-0.20.3.tgz"`). Suma el binario
   al repo, pero deja el build de Hostinger sin depender del CDN.

Lo que **no** se hizo, a propósito: cambiar de librería (`exceljs` no lee `.xls`)
ni sacar el soporte de Excel. Está decidido en `fable/plan.md` §1.3 y en
`fable/REVIEW.md` P1.

Mitigación mientras tanto: el archivo lo sube una cuenta `staff` autenticada
(`src/app/actions/admin-products.ts`, `requireStaffSession()`), con un límite de
tamaño, así que no es una superficie anónima. `tests/unit/spreadsheet.test.ts`
ahora ejercita la función con bytes reales, así que el día del swap el cambio de
versión queda cubierto.

## Un `.xlsx` corrupto muestra un error genérico — fase O1

`spreadsheetToCsvText` sólo convierte en `UnsupportedSpreadsheetError` la
extensión desconocida y la planilla sin hojas. Un `.xlsx` con el ZIP dañado
tira el error crudo de la librería (`Unsupported ZIP file`), que
`readCatalogFile` re-lanza y el panel muestra como error genérico en vez de "el
archivo está dañado, exportalo de nuevo". No corrompe nada ni deja pasar datos
—hay un test que lo fija (`tests/unit/spreadsheet.test.ts`)—; es sólo el texto
que ve el staff. Arreglo, cuando alguien toque ese camino: envolver `XLSX.read`
en un `try/catch` que devuelva `UnsupportedSpreadsheetError` con un mensaje en
castellano.
