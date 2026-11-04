# 0001 — Dónde corre una tienda que cobra

- **Estado:** aceptada
- **Fecha:** 2026-11-04
- **Alcance:** el template `antonmarklundcom/ecom` y toda tienda creada desde él.

## Contexto

El template corre hoy en un solo runtime: Next.js 16 sobre **Node.js 22** en el
hosting de Node.js de **Hostinger**, con **MySQL** (Drizzle) en el mismo plan.
Todo lo que toca plata —estados del pedido, reservas de stock, el webhook de
Pagopar, los comprobantes— depende de transacciones con `SELECT … FOR UPDATE`
en MySQL (ARCH.md), y la suite de integración las prueba contra MySQL 8 de
verdad.

`antonmarklundcom/productos.new` (productos.com.py) agregó un segundo runtime:
Cloudflare Workers con D1 (`wrangler`, `vinext`, `workers/`, `vite.config.ts`,
`scripts/*workers*`). Sirve para una vidriera de catálogo sin checkout, pero
duplica la maquinaria: otro motor de base sin las mismas garantías de bloqueo,
otro camino de deploy, otro conjunto de tests y otra forma de fallar a medias.
Mantener dos runtimes en un template que se distribuye a varias tiendas
multiplica cada arreglo por dos.

Al mismo tiempo, Cloudflare sí resuelve bien cosas que no son el servidor de la
aplicación: DNS, almacenamiento de objetos barato y sin costo de salida (R2) y
el ruteo de correo.

## Decisión

1. **Una tienda que cobra corre en Hostinger Node.js + MySQL.** Es el único
   runtime del template. No se agregan `wrangler`, D1, Workers, `vinext`,
   `workers/` ni `vite.config.ts` a `ecom`, y `template:sync` no los trae.
2. **Cloudflare provee, y sólo provee:**
   - **DNS en modo "DNS only" (nube gris)**, nunca proxied. Ver DEPLOY.md
     § Cloudflare: el proxy se mete entre Pagopar y el webhook, cambia la IP de
     origen que usa el rate limit, cachea respuestas que no deben cachearse y
     agrega un segundo TLS que Hostinger no ve. `pnpm preflight` avisa si
     detecta el proxy.
   - **R2** para las fotos del catálogo (públicas, claves inmutables) y para los
     backups del cron y los comprobantes (prefijos privados del mismo bucket).
     Es el único backend de imágenes del template; se configura en
     `/admin/integraciones`.
   - **Email Routing** para las casillas del dominio.
3. **El runtime Workers/D1 de productos.new no es parte del template.** Lo que
   sí se trae de ese repo es lo que no depende de él: el modelo de proveedores
   (`supplier_offers`, modo de venta, visibilidad de precio, orden de
   destacados) y el pipeline de fotos a R2 (`r2:p1/…@WxH`, `fotos:preparar`,
   `fotos:subir`, `fotos:reparar`).
4. **productos.com.py se reconstruye desde este template** cuando necesite
   checkout. Hasta entonces puede seguir como vidriera en Workers, pero ningún
   arreglo de ese runtime vuelve a `ecom`.

## Consecuencias

- Hay un solo camino de deploy (DEPLOY.md) y una sola suite que prueba la
  plata. Una tienda nueva es marca, tema y catálogo.
- Hostinger limita los procesos por cuenta (productos.new registró un techo
  compartido de ~200 y 429s cuando un redeploy dejó procesos huérfanos). El
  arranque del template se protege contra eso (guardia de instancia única y
  cierre ordenado del pool de MySQL, DEPLOY.md).
- Sin el proxy de Cloudflare no hay CDN delante del HTML: el rendimiento sale
  de páginas de catálogo cacheables (ISR con revalidación desde el panel) y de
  fotos servidas desde R2 con tamaños correctos.
- Si algún día una tienda necesita otro runtime, es una decisión nueva que
  reemplaza a ésta, no una excepción por tienda.
