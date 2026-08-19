"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { entrarCliente } from "@/app/actions/cuenta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Login de cliente. Un solo campo para el identificador: en Paraguay se
 * compra con WhatsApp y mucha gente no tiene email a mano, pero quien puso
 * uno al registrarse espera poder usarlo. El servidor decide cuál es cuál.
 */
export function CustomerLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await entrarCliente({
            identifier: String(data.get("identifier") ?? ""),
            password: String(data.get("password") ?? ""),
          });

          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/cuenta");
          router.refresh();
        });
      }}
    >
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="identifier">WhatsApp o email</Label>
        <Input
          id="identifier"
          name="identifier"
          required
          autoComplete="username"
          placeholder="0981 123 456"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
