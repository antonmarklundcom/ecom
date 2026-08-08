"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { submitCheckout } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeIssue } from "@/lib/cart-issues";
import { cartSubtotal, useCart } from "@/lib/cart-store";
import { formatGs } from "@/lib/money";

/**
 * Formulario de checkout.
 *
 * Ojo con lo que NO manda: ningún monto. El total que se ve acá es
 * informativo; el que se cobra lo calcula `createOrder` desde la DB.
 */
export function CheckoutForm({
  cities,
  pagoparEnabled = false,
}: {
  cities: string[];
  pagoparEnabled?: boolean;
}) {
  const router = useRouter();
  const { lines, clear } = useCart();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<"NINGUNO" | "CI" | "RUC">("NINGUNO");
  const [paymentMethod, setPaymentMethod] = useState<"transferencia" | "contra_entrega" | "tarjeta">(
    "transferencia"
  );

  const subtotal = cartSubtotal(lines);

  if (lines.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">Tu carrito está vacío</p>
        <Button className="mt-4" onClick={() => router.push("/")}>
          Ver productos
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await submitCheckout({
            items: lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
            customerName: String(data.get("customerName") ?? ""),
            customerPhone: String(data.get("customerPhone") ?? ""),
            customerEmail: String(data.get("customerEmail") ?? ""),
            docType,
            docNumber: String(data.get("docNumber") ?? ""),
            isConsumidorFinal: docType === "NINGUNO",
            shipCity: String(data.get("shipCity") ?? ""),
            shipBarrio: String(data.get("shipBarrio") ?? ""),
            shipAddress: String(data.get("shipAddress") ?? ""),
            shipReference: String(data.get("shipReference") ?? ""),
            paymentMethod,
          });

          if (!result.ok) {
            setError(result.error);
            result.issues?.forEach((issue) => toast.error(describeIssue(issue)));
            return;
          }

          clear();
          // La pasarela de Pagopar vive en otro dominio: `router.push` es
          // para rutas internas, así que un link externo necesita navegación
          // real del navegador.
          if (/^https?:\/\//.test(result.redirectTo)) {
            window.location.href = result.redirectTo;
          } else {
            router.push(result.redirectTo);
          }
        });
      }}
    >
      {error ? (
        <p className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="customerName">Nombre y apellido</Label>
          <Input id="customerName" name="customerName" required minLength={3} autoComplete="name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="customerPhone">WhatsApp</Label>
          <Input
            id="customerPhone"
            name="customerPhone"
            required
            placeholder="0981 123 456"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="docType">Documento</Label>
          <select
            id="docType"
            name="docType"
            value={docType}
            onChange={(event) => setDocType(event.target.value as typeof docType)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="NINGUNO">Consumidor final</option>
            <option value="CI">Cédula</option>
            <option value="RUC">RUC</option>
          </select>
        </div>
        {docType !== "NINGUNO" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="docNumber">{docType === "RUC" ? "RUC (con DV)" : "Nro. de cédula"}</Label>
            <Input id="docNumber" name="docNumber" required inputMode="numeric" />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="shipCity">Ciudad</Label>
          <Input id="shipCity" name="shipCity" required list="ciudades" autoComplete="address-level2" />
          <datalist id="ciudades">
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="shipBarrio">Barrio</Label>
          <Input id="shipBarrio" name="shipBarrio" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="shipAddress">Dirección</Label>
        <Input id="shipAddress" name="shipAddress" required minLength={5} autoComplete="street-address" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="shipReference">Referencia (opcional)</Label>
        <Input id="shipReference" name="shipReference" placeholder="Casa de portón verde, entre X e Y" />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">¿Cómo querés pagar?</legend>
        {(
          [
            ["transferencia", "Transferencia / QR (SPI)", "Te pasamos los datos y subís el comprobante."],
            ["contra_entrega", "Contra entrega", "Pagás en efectivo cuando recibís el pedido."],
            ...(pagoparEnabled
              ? ([
                  [
                    "tarjeta",
                    "Tarjeta / Pagopar",
                    "Pagás online, ahora, con tarjeta u otros medios de Pagopar.",
                  ],
                ] as const)
              : []),
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="border-border flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
          >
            <input
              type="radio"
              name="paymentMethod"
              value={value}
              checked={paymentMethod === value}
              onChange={() => setPaymentMethod(value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground block text-xs">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="border-border flex items-center justify-between border-t pt-4 text-sm">
        <span className="text-muted-foreground">Subtotal (IVA incluido)</span>
        <span className="font-semibold tabular-nums">{formatGs(subtotal)}</span>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        El envío se calcula según tu ciudad y se confirma en la próxima pantalla.
      </p>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Creando tu pedido…" : "Confirmar pedido"}
      </Button>
    </form>
  );
}
