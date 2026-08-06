"use client";

import { useState } from "react";
import { toast } from "sonner";

import { QuantityStepper } from "@/components/quantity-stepper";
import { StockBadge } from "@/components/stock-badge";
import { PriceTag } from "@/components/price-tag";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-store";
import { cn } from "@/lib/utils";
import type { CatalogProductDetail } from "@/db/queries";

/**
 * Selector de variante + agregar al carrito.
 *
 * La disponibilidad que llega acá viene del server render; el chequeo que
 * manda es el del servidor (revalidación del carrito y, después, la reserva
 * en el checkout). Acá sólo evitamos que el comprador pida algo que ya
 * sabemos que no está.
 */
export function AddToCart({ product }: { product: CatalogProductDetail }) {
  const add = useCart((state) => state.add);
  const firstAvailable = product.variants.find((variant) => variant.available > 0);
  const [variantId, setVariantId] = useState<number | undefined>(
    firstAvailable?.id ?? product.variants[0]?.id
  );
  const [qty, setQty] = useState(1);

  const selected = product.variants.find((variant) => variant.id === variantId);
  const max = Math.max(1, Math.min(99, selected?.available ?? 0));
  const canAdd = Boolean(selected && selected.available > 0);

  return (
    <div className="space-y-4">
      {product.variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Elegí una opción</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((variant) => {
              const disabled = variant.available <= 0;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setVariantId(variant.id);
                    setQty(1);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    variant.id === variantId
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/40",
                    disabled && "text-muted-foreground cursor-not-allowed line-through opacity-60"
                  )}
                >
                  {variant.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {selected ? (
        <div className="flex flex-wrap items-center gap-3">
          <PriceTag
            pricePyg={selected.pricePyg}
            compareAtPyg={selected.compareAtPyg}
            size="lg"
            showIvaNote
          />
          <StockBadge available={selected.available} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={qty} onChange={setQty} max={max} />
        <Button
          size="lg"
          disabled={!canAdd}
          onClick={() => {
            if (!selected) return;
            add(
              {
                variantId: selected.id,
                productSlug: product.slug,
                name: product.name,
                variantLabel: selected.label,
                unitPricePyg: selected.pricePyg,
              },
              qty
            );
            toast.success("Agregado al carrito", {
              description: `${product.name} — ${selected.label}`,
            });
          }}
        >
          {canAdd ? "Agregar al carrito" : "Sin stock"}
        </Button>
      </div>
    </div>
  );
}
