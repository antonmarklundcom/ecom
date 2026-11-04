import { TIENDA } from "@/config/tienda";

/**
 * El único lugar que decide si el panel maneja datos de proveedores
 * (`supplier_offers` y `products.supplier_url`).
 *
 * Lo decide `proveedores` en `src/config/tienda.ts`, apagado de fábrica. Se lee
 * con un acceso tolerante y no con `TIENDA.proveedores` a secas: `tienda.ts` es
 * de la tienda y `template:sync` conserva el suyo, así que una tienda creada
 * antes de este flag no tiene el campo —ni en el objeto ni en su tipo `Tienda`—
 * y tiene que seguir compilando, con la feature apagada.
 *
 * Gobierna **sólo** lo que el panel dibuja y acepta guardar. No es una regla de
 * negocio: el dominio no lo lee, y la vidriera nunca ve estos datos, con el
 * flag como sea (`tests/unit/proveedores-privados.test.ts`).
 */
export function proveedoresHabilitados(): boolean {
  return (TIENDA as { proveedores?: unknown }).proveedores === true;
}
