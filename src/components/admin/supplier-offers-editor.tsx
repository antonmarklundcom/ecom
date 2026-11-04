"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteVariantSupplierOffer,
  saveVariantSupplierOffer,
} from "@/app/actions/admin-products";
import {
  FieldError,
  fieldA11y,
  useFocusFirstInvalid,
} from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplierSourceType } from "@/db/enums";
import type { FieldErrors } from "@/lib/field-errors";
import { formatGs } from "@/lib/money";
import { supplierMargin } from "@/lib/supplier-margin";
import { TESTIDS } from "@/lib/testids";
import { t } from "@/i18n";

/**
 * El editor de ofertas de proveedores por variante (panel, `proveedores`
 * prendido). Datos privados de compras: la página sólo lo dibuja con el flag
 * y la capacidad `precios`, y la acción lo vuelve a verificar.
 *
 * Una oferta es "a este proveedor, a este costo, con este stock declarado".
 * La preferida es la que se usa para el margen; el stock del proveedor es
 * informativo y no toca el stock vendible de la variante.
 */

/** Una oferta como la manda la página: fechas ya en texto, nada de `Date`. */
export type SupplierOfferView = {
  id: number;
  source: string | null;
  sourceType: SupplierSourceType;
  unitCostPyg: number | null;
  productUrl: string | null;
  supplierUrl: string | null;
  supplierStock: number | null;
  notes: string | null;
  isConfirmed: boolean;
  isActive: boolean;
  isPreferred: boolean;
  /** `"2026-11-04"` en hora paraguaya, o null. */
  checkedOn: string | null;
};

export type SupplierVariantView = {
  id: number;
  sku: string;
  label: string;
  pricePyg: number;
  offers: SupplierOfferView[];
};

const SOURCE_LABEL: Record<SupplierSourceType, string> = {
  dropi: t("panel.proveedores.tipo.dropi"),
  local: t("panel.proveedores.tipo.local"),
  import: t("panel.proveedores.tipo.import"),
  other: t("panel.proveedores.tipo.other"),
};

const SOURCE_TYPES = Object.keys(SOURCE_LABEL) as SupplierSourceType[];

const select =
  "border-input bg-background h-9 rounded-md border px-3 text-sm";

export function SupplierOffersEditor({
  productId,
  variants,
}: {
  productId: number;
  variants: SupplierVariantView[];
}) {
  return (
    <div className="grid gap-4" data-testid={TESTIDS.adminSupplierOffers}>
      <p className="text-muted-foreground text-sm">
        {t("panel.proveedores.ayuda")}
      </p>
      {variants.map((variant) => (
        <VariantOffers key={variant.id} productId={productId} variant={variant} />
      ))}
    </div>
  );
}

function VariantOffers({
  productId,
  variant,
}: {
  productId: number;
  variant: SupplierVariantView;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {variant.label}
          <span className="text-muted-foreground">
            {" "}
            · {variant.sku} · {formatGs(variant.pricePyg)}
          </span>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding((open) => !open)}
        >
          {t("panel.proveedores.agregar")}
        </Button>
      </div>
      {variant.offers.length === 0 && !adding ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {t("panel.proveedores.sinOfertas")}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {variant.offers.map((offer) => (
          <OfferCard
            key={offer.id}
            productId={productId}
            variant={variant}
            offer={offer}
          />
        ))}
      </div>
      {adding ? (
        <OfferForm
          productId={productId}
          variant={variant}
          onDone={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

function OfferCard({
  productId,
  variant,
  offer,
}: {
  productId: number;
  variant: SupplierVariantView;
  offer: SupplierOfferView;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const margin = supplierMargin(variant.pricePyg, offer.unitCostPyg);
  const pct = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${value.toFixed(1)} %`;

  return (
    <article
      className={`min-w-0 rounded-md border p-3 text-sm ${offer.isPreferred ? "border-primary" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-medium break-words">
          {offer.source}
          <span className="text-muted-foreground font-normal">
            {" "}
            · {SOURCE_LABEL[offer.sourceType]}
          </span>
        </h4>
        <span className="text-muted-foreground text-xs">
          {offer.isPreferred
            ? t("panel.proveedores.preferido")
            : offer.isConfirmed
              ? t("panel.proveedores.confirmado")
              : t("panel.proveedores.pendiente")}
          {offer.isActive ? "" : ` · ${t("panel.proveedores.inactivo")}`}
        </span>
      </div>
      <p className="mt-2 text-base font-semibold tabular-nums">
        {offer.unitCostPyg === null ? "—" : formatGs(offer.unitCostPyg)}
      </p>
      <p className="text-muted-foreground">
        {t("panel.proveedores.margen", {
          margen: pct(margin?.marginPercent),
          recargo: pct(margin?.markupPercent),
        })}
      </p>
      <p className="mt-1">
        {t("panel.proveedores.stockDeclarado", {
          stock:
            offer.supplierStock === null ? "—" : String(offer.supplierStock),
          fecha: offer.checkedOn ?? "—",
        })}
      </p>
      <div className="mt-1 flex flex-wrap gap-3">
        {offer.productUrl ? (
          <a
            className="underline"
            href={offer.productUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("panel.proveedores.enlaceProducto")}
          </a>
        ) : null}
        {offer.supplierUrl ? (
          <a
            className="underline"
            href={offer.supplierUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("panel.proveedores.enlaceProveedor")}
          </a>
        ) : null}
      </div>
      {offer.notes ? (
        <p className="text-muted-foreground mt-1 break-words">{offer.notes}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing((open) => !open)}
        >
          {t("panel.proveedores.editar")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(t("panel.proveedores.borrarConfirmar"))) return;
            startTransition(async () => {
              const result = await deleteVariantSupplierOffer({
                productId,
                variantId: variant.id,
                offerId: offer.id,
              });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(t("panel.proveedores.borrada"));
              router.refresh();
            });
          }}
        >
          {t("panel.proveedores.borrar")}
        </Button>
      </div>
      {editing ? (
        <OfferForm
          productId={productId}
          variant={variant}
          offer={offer}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}

function OfferForm({
  productId,
  variant,
  offer,
  onDone,
}: {
  productId: number;
  variant: SupplierVariantView;
  offer?: SupplierOfferView;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, fields);
  // Ids únicos por variante y oferta: hay varios formularios en la página.
  const id = (name: string) => `oferta-${variant.id}-${offer?.id ?? "nueva"}-${name}`;
  const entero = (value: FormDataEntryValue | null) => {
    const text = String(value ?? "").trim();
    return text === "" ? null : Number(text);
  };

  return (
    <form
      ref={formRef}
      className="mt-3 grid gap-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFields({});
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveVariantSupplierOffer({
            productId,
            variantId: variant.id,
            offerId: offer?.id,
            source: String(data.get("source") ?? ""),
            sourceType: String(data.get("sourceType") ?? "other"),
            unitCostPyg: entero(data.get("unitCostPyg")),
            supplierStock: entero(data.get("supplierStock")),
            productUrl: String(data.get("productUrl") ?? ""),
            supplierUrl: String(data.get("supplierUrl") ?? ""),
            checkedOn: String(data.get("checkedOn") ?? "") || null,
            notes: String(data.get("notes") ?? ""),
            isConfirmed: data.get("isConfirmed") === "on",
            isActive: data.get("isActive") === "on",
            isPreferred: data.get("isPreferred") === "on",
          });
          if (!result.ok) {
            setError(result.error);
            setFields(result.fields ?? {});
            return;
          }
          toast.success(t("panel.proveedores.guardada"));
          onDone();
          router.refresh();
        });
      }}
    >
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("source")}>{t("panel.proveedores.origen")}</Label>
          <Input
            id={id("source")}
            name="source"
            required
            maxLength={200}
            defaultValue={offer?.source ?? ""}
            {...fieldA11y(fields, "source", id("source"))}
          />
          <FieldError errors={fields} name="source" id={id("source")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("sourceType")}>{t("panel.proveedores.tipo")}</Label>
          <select
            id={id("sourceType")}
            name="sourceType"
            defaultValue={offer?.sourceType ?? "other"}
            className={select}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SOURCE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("unitCostPyg")}>
            {t("panel.proveedores.costo")}
          </Label>
          <Input
            id={id("unitCostPyg")}
            name="unitCostPyg"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={offer?.unitCostPyg ?? ""}
            {...fieldA11y(fields, "unitCostPyg", id("unitCostPyg"))}
          />
          <FieldError errors={fields} name="unitCostPyg" id={id("unitCostPyg")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("supplierStock")}>
            {t("panel.proveedores.stock")}
          </Label>
          <Input
            id={id("supplierStock")}
            name="supplierStock"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={offer?.supplierStock ?? ""}
            {...fieldA11y(fields, "supplierStock", id("supplierStock"))}
          />
          <FieldError
            errors={fields}
            name="supplierStock"
            id={id("supplierStock")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("productUrl")}>
            {t("panel.proveedores.enlaceProducto")}
          </Label>
          <Input
            id={id("productUrl")}
            name="productUrl"
            type="url"
            maxLength={2048}
            placeholder="https://"
            defaultValue={offer?.productUrl ?? ""}
            {...fieldA11y(fields, "productUrl", id("productUrl"))}
          />
          <FieldError errors={fields} name="productUrl" id={id("productUrl")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("supplierUrl")}>
            {t("panel.proveedores.enlaceProveedor")}
          </Label>
          <Input
            id={id("supplierUrl")}
            name="supplierUrl"
            type="url"
            maxLength={2048}
            placeholder="https://"
            defaultValue={offer?.supplierUrl ?? ""}
            {...fieldA11y(fields, "supplierUrl", id("supplierUrl"))}
          />
          <FieldError errors={fields} name="supplierUrl" id={id("supplierUrl")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("checkedOn")}>{t("panel.proveedores.fecha")}</Label>
          <Input
            id={id("checkedOn")}
            name="checkedOn"
            type="date"
            defaultValue={offer?.checkedOn ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("notes")}>{t("panel.proveedores.notas")}</Label>
          <textarea
            id={id("notes")}
            name="notes"
            maxLength={1000}
            rows={2}
            defaultValue={offer?.notes ?? ""}
            className="border-input bg-background rounded-md border p-2 text-sm"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isConfirmed"
          defaultChecked={offer?.isConfirmed ?? false}
        />
        {t("panel.proveedores.confirmar")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={offer?.isActive ?? true}
        />
        {t("panel.proveedores.activa")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPreferred"
          defaultChecked={offer?.isPreferred ?? false}
        />
        {t("panel.proveedores.elegir")}
      </label>
      <FieldError errors={fields} name="isPreferred" id={id("isPreferred")} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? t("panel.acciones.guardando")
            : t("panel.proveedores.guardar")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("panel.proveedores.cancelar")}
        </Button>
      </div>
    </form>
  );
}
