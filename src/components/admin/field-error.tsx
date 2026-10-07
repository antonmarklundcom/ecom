"use client";

import { useEffect, type RefObject } from "react";

import type { FieldErrors } from "@/lib/field-errors";

/**
 * Lo que un campo del panel necesita para anunciar su error
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md F1): `aria-invalid` y el mensaje en
 * `aria-describedby`, sumado a la ayuda que ya tuviera.
 */
export function fieldA11y(
  errors: FieldErrors,
  name: string,
  id: string,
  describedBy?: string
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  const ids = [describedBy, errors[name] ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");
  return {
    ...(errors[name] ? { "aria-invalid": true as const } : {}),
    ...(ids ? { "aria-describedby": ids } : {}),
  };
}

/** El mensaje, al lado del campo, con el id que espera `fieldA11y`. */
export function FieldError({
  errors,
  name,
  id,
}: {
  errors: FieldErrors;
  name: string;
  id: string;
}) {
  return errors[name] ? (
    <p id={`${id}-error`} className="text-destructive text-xs">
      {errors[name]}
    </p>
  ) : null;
}

/**
 * Cuando llegan errores, el foco va al primer campo inválido (en el orden de
 * la página) y se abre el `<details>` que lo esconda.
 */
export function useFocusFirstInvalid(
  form: RefObject<HTMLFormElement | null>,
  errors: FieldErrors
): void {
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    const first = form.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]'
    );
    if (!first) return;
    let parent = first.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    first.focus();
  }, [form, errors]);
}
