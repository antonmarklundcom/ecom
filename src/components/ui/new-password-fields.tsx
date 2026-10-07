"use client";

import type { FormEvent, ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { t } from "@/i18n/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

/** Confirmation is a typing safeguard; setup also validates the confirmation on the server. */
export function passwordsMatch(data: FormData): boolean {
  return data.get("password") === data.get("passwordConfirmation");
}

export function NewPasswordFields({
  id,
  label,
  required = true,
  help,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: ReactNode;
}) {
  const confirmId = `${id}-confirmation`;
  const validateConfirmation = (event: FormEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form;
    const confirmation = form?.elements.namedItem("passwordConfirmation");
    if (form && confirmation instanceof HTMLInputElement) {
      confirmation.setCustomValidity(
        passwordsMatch(new FormData(form)) ? "" : t("password.noCoinciden")
      );
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <PasswordInput
          id={id}
          name="password"
          required={required}
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={200}
          autoComplete="new-password"
          aria-describedby={help ? `${id}-help` : undefined}
          onInput={validateConfirmation}
        />
        {help ? (
          <p id={`${id}-help`} className="text-muted-foreground text-xs">
            {help}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={confirmId}>{t("password.confirmar")}</Label>
        <PasswordInput
          id={confirmId}
          name="passwordConfirmation"
          required={required}
          maxLength={200}
          autoComplete="new-password"
          onInput={validateConfirmation}
        />
      </div>
    </div>
  );
}
