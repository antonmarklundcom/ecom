/**
 * Quién verificó un dato y cuándo, sellado por el servidor
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md E1).
 *
 * Una ficha técnica, unos atributos o un GTIN se publican sólo si alguien los
 * verificó. Esa fecha antes se tipeaba en el JSON del formulario: se podía
 * poner cualquiera, no quedaba quién, y cambiar los valores sin tocarla
 * publicaba hechos nuevos con un sello viejo. Acá las reglas:
 *
 * - `verifiedAt` y `verifiedBy` que manda el navegador (o una planilla) se
 *   descartan siempre.
 * - Confirmar ("verifiqué estos datos") sella con la hora del servidor y la
 *   persona de la sesión. Sin sesión (importación, CLI) no se confirma nada.
 * - Guardar sin cambios conserva el sello que había, tal cual: un sello
 *   histórico sin autor no recibe un autor inventado.
 * - Cambiar el contenido sin confirmar lo deja sin verificar (no se publica).
 *
 * Puro: sin base ni Next, para usarlo en el panel, la importación y los tests.
 */

export type VerificationActor = { userId: number | null; label: string };

type Stamped = { verifiedAt?: string; verifiedBy?: VerificationActor };

/** El contenido que alguien verificó, sin los sellos. */
export function withoutStamps<T extends object>(
  value: T
): Omit<T, "verifiedAt" | "verifiedBy"> {
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.verifiedAt;
  delete copy.verifiedBy;
  return copy as Omit<T, "verifiedAt" | "verifiedBy">;
}

/**
 * Para validar lo que llega del navegador o de una planilla: un objeto pierde
 * sus sellos antes del esquema (una fecha forjada o futura no es un error del
 * usuario, simplemente no cuenta); cualquier otra cosa pasa igual.
 */
export function stripStamps(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return withoutStamps(value);
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** El mismo contenido verificable, sin mirar sellos ni el orden de las claves. */
export function sameContent(a: unknown, b: unknown): boolean {
  return canonical(stripStamps(a)) === canonical(stripStamps(b));
}

export function stampVerification<T extends Record<string, unknown>>(input: {
  /** Lo guardado hoy (con sus sellos, si los tiene). */
  previous: Record<string, unknown> | null | undefined;
  /** Lo que mandó el formulario o la planilla; sus sellos se ignoran. */
  submitted: T | null | undefined;
  confirm: boolean;
  actor: VerificationActor | null;
  now: Date;
}): T | null | undefined {
  if (input.submitted === undefined || input.submitted === null) {
    return input.submitted;
  }
  const content = withoutStamps(input.submitted);

  if (input.confirm && input.actor) {
    return {
      ...content,
      verifiedAt: input.now.toISOString(),
      verifiedBy: input.actor,
    } as unknown as T;
  }

  const previous = input.previous as Stamped | null | undefined;
  if (previous?.verifiedAt && sameContent(previous, content)) {
    return {
      ...content,
      verifiedAt: previous.verifiedAt,
      ...(previous.verifiedBy ? { verifiedBy: previous.verifiedBy } : {}),
    } as unknown as T;
  }
  return content as unknown as T;
}
