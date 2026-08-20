"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { adjustVariantStock, saveProductVariant } from "@/app/actions/admin-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEXTOS } from "@/i18n";
import { formatGs } from "@/lib/money";

export type VariantCard = {
  id: number;
  sku: string;
  label: string;
  pricePyg: number;
  compareAtPyg: number | null;
  isActive: boolean;
  onHand: number;
  heldQty: number;
  available: number;
};

export function VariantEditor({
  productId,
  variants,
}: {
  productId: number;
  variants: VariantCard[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="grid gap-3">
      {variants.map((variant) => (
        <VariantRow key={variant.id} productId={productId} variant={variant} />
      ))}

      {adding ? (
        <VariantFields productId={productId} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          {TEXTOS.panel.variantes.agregarVariante}
        </Button>
      )}

      {variants.length === 0 && !adding ? (
        <p className="text-muted-foreground text-sm">
          {TEXTOS.panel.variantes.sinVariantes}
        </p>
      ) : null}
    </div>
  );
}

function VariantRow({ productId, variant }: { productId: number; variant: VariantCard }) {
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  return (
    <div className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {variant.label}
          <span className="text-muted-foreground font-normal"> · {variant.sku}</span>
        </span>
        <span className="tabular-nums">{formatGs(variant.pricePyg)}</span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        {TEXTOS.panel.variantes.stockLinea(variant.onHand, variant.heldQty)}
        <strong className="text-foreground">{TEXTOS.panel.variantes.disponibles(variant.available)}</strong>
        {variant.isActive ? "" : TEXTOS.panel.variantes.inactiva}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
          {editing ? TEXTOS.panel.comunes.cancelar : TEXTOS.panel.comunes.editar}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdjusting((v) => !v)}>
          {adjusting ? TEXTOS.panel.comunes.cancelar : TEXTOS.panel.variantes.ajustarStock}
        </Button>
      </div>

      {editing ? (
        <div className="mt-3">
          <VariantFields
            productId={productId}
            variant={variant}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}

      {adjusting ? (
        <div className="mt-3">
          <StockAdjustForm
            productId={productId}
            variantId={variant.id}
            onDone={() => setAdjusting(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function VariantFields({
  productId,
  variant,
  onDone,
}: {
  productId: number;
  variant?: VariantCard;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="border-border grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        const compareAt = String(data.get("compareAtPyg") ?? "").trim();

        startTransition(async () => {
          const result = await saveProductVariant({
            productId,
            variantId: variant?.id,
            sku: String(data.get("sku") ?? ""),
            label: String(data.get("label") ?? ""),
            pricePyg: Number(data.get("pricePyg")),
            compareAtPyg: compareAt === "" ? null : Number(compareAt),
            isActive: data.get("isActive") === "on",
          });

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(TEXTOS.panel.variantes.guardada);
          onDone();
          router.refresh();
        });
      }}
    >
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`label-${variant?.id ?? "new"}`}>{TEXTOS.panel.variantes.etiqueta}</Label>
          <Input
            id={`label-${variant?.id ?? "new"}`}
            name="label"
            required
            defaultValue={variant?.label ?? ""}
            placeholder={TEXTOS.panel.variantes.etiquetaPlaceholder}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`sku-${variant?.id ?? "new"}`}>SKU</Label>
          <Input
            id={`sku-${variant?.id ?? "new"}`}
            name="sku"
            required
            defaultValue={variant?.sku ?? ""}
            placeholder={TEXTOS.panel.variantes.skuPlaceholder}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`price-${variant?.id ?? "new"}`}>{TEXTOS.panel.variantes.precio}</Label>
          <Input
            id={`price-${variant?.id ?? "new"}`}
            name="pricePyg"
            required
            type="number"
            min={0}
            // step=1: guaraníes enteros. Sin esto el navegador acepta 1500.5 y
            // el error recién aparece del lado del servidor.
            step={1}
            inputMode="numeric"
            defaultValue={variant?.pricePyg ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`compare-${variant?.id ?? "new"}`}>{TEXTOS.panel.variantes.precioTachado}</Label>
          <Input
            id={`compare-${variant?.id ?? "new"}`}
            name="compareAtPyg"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={variant?.compareAtPyg ?? ""}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={variant?.isActive ?? true} />
        {TEXTOS.panel.variantes.activa}
      </label>

      {variant === undefined ? (
        <p className="text-muted-foreground text-xs">
          {TEXTOS.panel.variantes.arrancaEnCero}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? TEXTOS.panel.comunes.guardando : TEXTOS.panel.variantes.guardarVariante}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={isPending}>
          {TEXTOS.panel.comunes.cancelar}
        </Button>
      </div>
    </form>
  );
}

/**
 * Ajuste de stock. Se manda un delta (+/−) y no un total nuevo: dos conteos
 * simultáneos con "poné 7" se pisan; dos "sumá 3" se suman. El motivo es
 * obligatorio y queda auditado en `stock_adjustments`.
 */
function StockAdjustForm({
  productId,
  variantId,
  onDone,
}: {
  productId: number;
  variantId: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sign, setSign] = useState<1 | -1>(1);

  return (
    <form
      className="border-border grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        const qty = Math.abs(Number(data.get("qty")));

        startTransition(async () => {
          const result = await adjustVariantStock({
            variantId,
            productId,
            delta: sign * qty,
            reason: String(data.get("reason") ?? ""),
          });

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(TEXTOS.panel.variantes.stockAjustado(result.newOnHand));
          onDone();
          router.refresh();
        });
      }}
    >
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={sign === 1 ? "default" : "outline"}
          onClick={() => setSign(1)}
        >
          {TEXTOS.panel.variantes.agregar}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sign === -1 ? "default" : "outline"}
          onClick={() => setSign(-1)}
        >
          {TEXTOS.panel.variantes.quitar}
        </Button>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`qty-${variantId}`}>{TEXTOS.panel.variantes.cantidad}</Label>
        <Input
          id={`qty-${variantId}`}
          name="qty"
          type="number"
          min={1}
          step={1}
          required
          inputMode="numeric"
          defaultValue={1}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`reason-${variantId}`}>{TEXTOS.panel.variantes.motivo}</Label>
        <Input
          id={`reason-${variantId}`}
          name="reason"
          required
          minLength={4}
          maxLength={300}
          placeholder={TEXTOS.panel.variantes.motivoPlaceholder}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? TEXTOS.panel.comunes.guardando : TEXTOS.panel.variantes.ajustarStock}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={isPending}>
          {TEXTOS.panel.comunes.cancelar}
        </Button>
      </div>
    </form>
  );
}
