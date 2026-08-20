/**
 * Las filas de un `execute()` crudo, en una forma que se pueda recorrer.
 *
 * `mysql2` devuelve `[rows, fields]` y drizzle lo pasa tal cual, así que cada
 * consulta cruda tenía que acordarse de sacar el `[0]`. Estaba copiado en
 * `reconciliation.ts`, `manual-payments.ts` y `payment-recovery.ts`: tres
 * copias de cuatro líneas que hacían lo mismo.
 */
export function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Array.isArray(candidate) ? (candidate as Array<Record<string, unknown>>) : [];
}
