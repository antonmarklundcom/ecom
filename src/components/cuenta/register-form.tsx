"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { registrarCliente } from "@/app/actions/cuenta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export function CustomerRegisterForm({ defaultPhone = "" }: { defaultPhone?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await registrarCliente({
            phone: String(data.get("phone") ?? ""),
            name: String(data.get("name") ?? ""),
            email: String(data.get("email") ?? ""),
            password: String(data.get("password") ?? ""),
            marketingOptIn,
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
        <Label htmlFor="name">Nombre y apellido</Label>
        <Input id="name" name="name" required minLength={3} autoComplete="name" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="phone">WhatsApp</Label>
        <Input
          id="phone"
          name="phone"
          required
          defaultValue={defaultPhone}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0981 123 456"
        />
        <p className="text-muted-foreground text-xs">
          Es con lo que entrás, y por donde te avisamos de tu pedido.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">
          Email <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
        <p className="text-muted-foreground text-xs">
          Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={marketingOptIn}
          onChange={(event) => setMarketingOptIn(event.target.checked)}
        />
        <span>Quiero recibir novedades y promociones por WhatsApp.</span>
      </label>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
