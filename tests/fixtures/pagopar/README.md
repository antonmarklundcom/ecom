# Avisos de pago de Pagopar para los tests

Cada `.json` de esta carpeta es **un aviso de pago** (lo que Pagopar le postea a
`POST /api/webhooks/pagopar`) más lo que esperamos que pase con él. Los recorren
dos tests:

- `tests/unit/pagopar-webhook-fixtures.test.ts` — el parseo
  (`readWebhookBody` + `parseWebhookEvent`) y la ruta con el dominio simulado,
- `tests/integration/pagopar-webhook-fixtures.test.ts` — la ruta real contra
  MySQL: código HTTP, estado del pedido y filas de `payment_events`.

Agregar un caso es agregar un archivo: los dos tests lo levantan solos.

## De dónde sale cada forma

**Ninguna de estas formas está verificada contra la documentación oficial de
Pagopar.** La revisión del 2026-11-04 (ARCH.md §4.2) intentó leer
`https://soporte.pagopar.com/portal/es/kb/api` y
`https://cdn.pagopar.com/assets/documentos/Documentacion_Pagopar.pdf`, y los
dos hosts no resolvían desde la sesión de trabajo. Por eso `origen` dice de
dónde viene cada una, sin disfrazar ninguna de "documentada":

| `origen` | Qué quiere decir |
|---|---|
| `repo` | La forma que el template usa desde el PR #5: el pedido envuelto en `{respuesta, resultado: [...]}` con `hash_pedido`, `pagado`, `monto` (ARCH.md §4, `src/domain/pagopar/mock.ts`). Es la más probable, pero tampoco está confirmada. |
| `hipotesis` | Una variante plausible que **no** pudimos confirmar y que el código acepta por las dudas (hoy: el token adentro del cuerpo, campo `token`). |
| `sintetico` | Una variante inventada a propósito para probar robustez (sobre distinto, números como strings, BOM, form-encoded, basura). No pretende parecerse a nada que mande Pagopar. |

Cuando llegue el **primer aviso real** (sandbox o producción), guardarlo acá
como `real-sandbox-pagado.json` (con `origen: "real"`, la fecha y de dónde
salió en `descripcion`), **cambiando el `hash_pedido` por el de los otros
archivos y el token por `{{TOKEN}}`**, y sacando cualquier dato del comprador.
Ver TASKS.md §21.

## Sin claves ni tokens reales

- `hash_pedido` es siempre el mismo valor de prueba
  (`b92a3c6e…cee3`), que el test de integración siembra en `payments`.
- Ningún archivo trae un token: donde va el token en el cuerpo dice
  `{{TOKEN}}`, y el test lo reemplaza por `sha1(clave + hash_pedido)` calculado
  con una clave privada **de mentira** definida en el propio test.

## Formato

```jsonc
{
  "descripcion": "qué es y por qué está",
  "origen": "repo | hipotesis | sintetico | real",
  "contentType": "application/json",          // header que se manda
  "token": "query | cuerpo | ambos | ninguno", // dónde va el token
  "firma": "valida | clave_equivocada | alterada | otro_hash",
  "estadoInicial": "pendiente_pago",           // estado del pedido sembrado
  "sembrar": true,                             // false = no hay fila en payments
  "entregas": 1,                               // cuántas veces se postea
  "cuerpo": { },                               // se manda como JSON.stringify…
  "cuerpoCrudo": "…",                          // …o este texto tal cual
  "esperado": {
    "parseo": { "hashPedido": "…", "pagado": true, "montoPyg": 150000 } | "error",
    "ruta": {
      "status": 200,              // de TODAS las entregas
      "pedido": "pagado",         // estado al final (null = no hay pedido)
      "eventos": 1,               // filas en payment_events al final
      "logError": true            // opcional: la ruta tiene que dejar un log.error
    }
  }
}
```
