"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { submitCheckout } from "@/app/actions/checkout";
import { quoteCartShipping, type CartQuote } from "@/app/actions/shipping-quote";
import { TIENDA } from "@/config/tienda";
import { FreeShippingBar } from "@/components/free-shipping-bar";
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
  const { lines, clear, freeShipping } = useCart();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<"NINGUNO" | "CI" | "RUC">("NINGUNO");
  const [paymentMethod, setPaymentMethod] = useState<"transferencia" | "contra_entrega" | "tarjeta">(
    "transferencia"
  );
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [city, setCity] = useState("");
  const [quote, setQuote] = useState<(CartQuote & { itemsKey: string }) | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteTicket = useRef(0);

  const subtotal = cartSubtotal(lines);

  /**
   * Cotización del envío, disparada por lo que hace la compradora al tipear la
   * ciudad y no por un efecto — mismo criterio que la revalidación del
   * carrito. Es sólo lectura y no crea nada (ver `quoteCartShipping`), así que
   * se puede volver a pedir en cada corrección.
   */
  const itemsKey = lines.map((line) => `${line.variantId}x${line.qty}`).join(",");

  const requestQuote = (nextCity: string) => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);

    const target = nextCity.trim();
    const items = useCart
      .getState()
      .lines.map((line) => ({ variantId: line.variantId, qty: line.qty }));

    if (target.length < 2 || items.length === 0) {
      setQuote(null);
      setIsQuoting(false);
      return;
    }

    // Cada pedido lleva su número: la respuesta de una ciudad ya corregida
    // llega tarde y no tiene que pisar a la actual.
    const ticket = ++quoteTicket.current;
    setIsQuoting(true);
    quoteTimer.current = setTimeout(() => {
      void quoteCartShipping({ items, city: target })
        .then((result) => {
          if (ticket !== quoteTicket.current) return;
          setQuote(result.shipping ? { ...result, itemsKey } : null);
          setIsQuoting(false);
        })
        .catch(() => {
          if (ticket !== quoteTicket.current) return;
          setQuote(null);
          setIsQuoting(false);
        });
    }, 400);
  };

  // Si el carrito cambió desde el slide-over, la cotización de recién ya no
  // corresponde: se muestra el subtotal del navegador hasta que se vuelva a
  // cotizar, en vez de un total de otro carrito.
  const currentQuote = quote?.itemsKey === itemsKey ? quote : null;

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
            marketingOptIn,
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
          <Input
            id="shipCity"
            name="shipCity"
            required
            list="ciudades"
            autoComplete="address-level2"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              requestQuote(event.target.value);
            }}
          />
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

      {/* Sin tildar de entrada y con el texto completo al lado: un permiso
          pre-aceptado no es un permiso. Lo que se guarda es la respuesta, no
          la ausencia de respuesta (ver `orders.marketing_opt_in`). */}
      <label className="border-border flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          name="marketingOptIn"
          checked={marketingOptIn}
          onChange={(event) => setMarketingOptIn(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Quiero recibir novedades y promociones</span>
          <span className="text-muted-foreground block text-xs">
            {TIENDA.nombre} te escribe al WhatsApp que pusiste arriba, sólo por ofertas y
            productos nuevos. Nunca por este pedido —eso te llega igual— y nunca le pasamos tu
            número a nadie. Pedinos que te saquemos cuando quieras.
          </span>
        </span>
      </label>

      <div className="border-border grid gap-1 border-t pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal (IVA incluido)</span>
          <span className="tabular-nums">{formatGs(currentQuote?.subtotalPyg ?? subtotal)}</span>
        </div>

        {currentQuote?.shipping ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Envío{currentQuote.shipping.matched ? ` — ${currentQuote.shipping.zoneName}` : ""}
                {isQuoting ? "…" : ""}
              </span>
              <span className="tabular-nums">
                {currentQuote.shipping.isFree ? "Gratis" : formatGs(currentQuote.shipping.shippingPyg)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-medium">Total</span>
              <span className="text-base font-semibold tabular-nums">
                {formatGs(currentQuote.totalPyg ?? 0)}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {/* La cotización es para mostrar. El total que se cobra lo recalcula
          `createOrder` desde la DB cuando se confirma, así que decirlo acá no
          es una nota al pie: es lo que pasa. */}
      <p className="text-muted-foreground -mt-3 text-xs">
        {currentQuote?.shipping
          ? currentQuote.shipping.matched
            ? "El total se confirma al crear el pedido."
            : `No encontramos tu ciudad en nuestras zonas: te cotizamos la tarifa más alta (${currentQuote.shipping.zoneName}). Escribinos por WhatsApp y lo revisamos.`
          : "Poné tu ciudad y te calculamos el envío antes de confirmar."}
      </p>

      {/* Con la ciudad puesta el número es el de su zona; sin ella, el que
          dejó la revalidación del carrito, que se dibuja aclarado. */}
      <FreeShippingBar
        progress={currentQuote?.freeShipping ?? freeShipping}
        subtotalPyg={currentQuote?.subtotalPyg ?? subtotal}
      />

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Creando tu pedido…" : "Confirmar pedido"}
      </Button>
    </form>
  );
}
