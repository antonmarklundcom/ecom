"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { lookupOrder } from "@/app/actions/order-lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrderLookupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await lookupOrder({
            orderNumber: String(data.get("orderNumber") ?? ""),
            phone: String(data.get("phone") ?? ""),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(result.redirectTo);
        });
      }}
    >
      {error ? (
        <p className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="orderNumber">Número de pedido</Label>
        <Input id="orderNumber" name="orderNumber" required placeholder="PY-000123" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="phone">WhatsApp usado en la compra</Label>
        <Input id="phone" name="phone" required placeholder="0981 123 456" inputMode="tel" />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Buscando…" : "Buscar mi pedido"}
      </Button>
    </form>
  );
}
