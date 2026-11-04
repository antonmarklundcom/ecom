/**
 * Margen bruto por unidad de una oferta de proveedor: precio de venta menos
 * costo. **No es ganancia** —no descuenta flete, comisiones, publicidad ni
 * devoluciones—, es la cuenta rápida para comparar dos proveedores de la
 * misma variante en el panel.
 *
 * Guaraníes enteros adentro y afuera (`spreadPyg`); los porcentajes son sólo
 * para mostrar y nunca vuelven a la base. Pura y sin dependencias: la usa el
 * editor de proveedores, que es un componente cliente.
 */
export function supplierMargin(pricePyg: number, unitCostPyg: number | null) {
  if (unitCostPyg === null) return null;
  const spreadPyg = pricePyg - unitCostPyg;
  return {
    spreadPyg,
    marginPercent: pricePyg > 0 ? (spreadPyg / pricePyg) * 100 : null,
    markupPercent: unitCostPyg > 0 ? (spreadPyg / unitCostPyg) * 100 : null,
  };
}
