"use client";

import Link from "next/link";
import { Loader2, ShoppingBag, Trash2 } from "lucide-react";

import { QuantityStepper } from "@/components/quantity-stepper";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { describeIssue } from "@/lib/cart-issues";
import { cartSubtotal, useCart } from "@/lib/cart-store";
import { formatGs } from "@/lib/money";

/**
 * Carrito slide-over.
 *
 * La revalidación la dispara `open()` en el store, no un efecto de este
 * componente: el carrito puede haber pasado días en localStorage y lo que se
 * muestra al abrirlo tiene que ser lo que dice la DB.
 */
export function CartSheet() {
  const { lines, isOpen, issues, isSyncing, close, setQty, remove } = useCart();
  const subtotal = cartSubtotal(lines);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tu carrito</SheetTitle>
          <SheetDescription>
            Los precios se confirman con el servidor. Todo incluye IVA.
          </SheetDescription>
        </SheetHeader>

        {issues.length > 0 ? (
          <ul className="border-border bg-muted/40 mx-4 space-y-1 rounded-lg border p-3 text-sm">
            {issues.map((issue) => (
              <li key={`${issue.type}-${issue.variantId}`}>{describeIssue(issue)}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-center">
              <ShoppingBag className="size-8" />
              <p className="text-sm">Tu carrito está vacío.</p>
              <Button variant="outline" onClick={close}>
                Seguí comprando
              </Button>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {lines.map((line) => (
                <li key={line.variantId} className="flex gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/producto/${line.productSlug}`}
                      onClick={close}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {line.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">{line.variantLabel}</p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      {formatGs(line.unitPricePyg * line.qty)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <QuantityStepper
                      value={line.qty}
                      max={99}
                      onChange={(qty) => setQty(line.variantId, qty)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-8 px-2"
                      onClick={() => remove(line.variantId)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      Quitar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 ? (
          <SheetFooter className="gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Subtotal
                {isSyncing ? <Loader2 className="ml-1 inline size-3 animate-spin" /> : null}
              </span>
              <span className="text-base font-semibold tabular-nums">{formatGs(subtotal)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              El envío se calcula en el checkout según tu ciudad.
            </p>
            <Button asChild size="lg">
              <Link href="/checkout" onClick={close}>
                Ir al checkout
              </Link>
            </Button>
            <Button variant="outline" onClick={close}>
              Seguí comprando
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
