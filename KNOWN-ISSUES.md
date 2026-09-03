# KNOWN-ISSUES.md

Cosas menores o bloqueadas que aparecieron durante las fases de `fable/plan.md`
y que no valían un desvío. Cada entrada dice qué es, por qué no se arregló y
cuál sería el arreglo. Si una entrada se resuelve, se borra.

## Un `.xlsx` corrupto muestra un error genérico — fase O1

`spreadsheetToCsvText` sólo convierte en `UnsupportedSpreadsheetError` la
extensión desconocida y la planilla sin hojas. Un `.xlsx` con el ZIP dañado
tira el error crudo de la librería (`Corrupted zip: ...`), que
`readCatalogFile` re-lanza y el panel muestra como error genérico en vez de "el
archivo está dañado, exportalo de nuevo". No corrompe nada ni deja pasar datos
—hay un test que lo fija (`tests/unit/spreadsheet.test.ts`)—; es sólo el texto
que ve el staff. Arreglo, cuando alguien toque ese camino: envolver
`workbook.xlsx.load` en un `try/catch` que devuelva `UnsupportedSpreadsheetError`
con un mensaje en castellano.
