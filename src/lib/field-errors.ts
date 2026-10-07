import { z } from "zod";

/**
 * Errores por campo de un formulario del panel (docs/TEMPLATE-IMPROVEMENT-PLAN.md
 * F1): `name` del campo → mensaje. Antes cada acción devolvía sólo el primer
 * error de zod —a veces en inglés— en una alerta arriba del formulario, sin
 * decir qué campo era ni llevar el foco ahí.
 */
export type FieldErrors = Record<string, string>;

/** Los mensajes por defecto de zod, en castellano; los del schema mandan. */
const ES = z.locales.es().localeError;

/** `safeParse` con los mensajes por defecto en castellano. */
export function parseEs<T extends z.ZodType>(
  schema: T,
  input: unknown
): z.ZodSafeParseResult<z.output<T>> {
  return schema.safeParse(input, { error: ES });
}

/** El primer mensaje de cada campo de primer nivel. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in fields) continue;
    fields[field] = issue.message;
  }
  return fields;
}
