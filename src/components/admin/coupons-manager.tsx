"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cambiarEstadoCupon,
  crearCupon,
  editarCupon,
} from "@/app/actions/admin-coupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUPON_TYPES, type CouponType } from "@/db/schema";
import { formatGs } from "@/lib/money";

export type AdminCouponCard = {
  id: number;
  code: string;
  type: CouponType;
  value: number;
  minOrderPyg: number | null;
  desde: string;
  hasta: string;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  timesUsed: number;
  soloClientes: boolean;
  isActive: boolean;
  orderCount: number;
  discountedPyg: number;
};

const TYPE_LABEL: Record<CouponType, string> = {
  porcentaje: "Porcentaje",
  monto_fijo: "Monto fijo",
};

/** `10%` o `₲ 50.000`, según el tipo. */
function describeValue(coupon: Pick<AdminCouponCard, "type" | "value">): string {
  return coupon.type === "porcentaje" ? `${coupon.value}%` : formatGs(coupon.value);
}

export function CouponsManager({ coupons }: { coupons: AdminCouponCard[] }) {
  const [editing, setEditing] = useState<number | "nuevo" | null>(null);

  return (
    <div className="grid gap-6">
      {editing === "nuevo" ? (
        <CouponForm onDone={() => setEditing(null)} />
      ) : (
        <div>
          <Button type="button" onClick={() => setEditing("nuevo")}>
            Crear cupón
          </Button>
        </div>
      )}

      {coupons.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          Todavía no hay cupones. Mientras no haya ninguno, el checkout no
          muestra el campo de descuento.
        </p>
      ) : (
        <ul className="grid gap-3">
          {coupons.map((coupon) =>
            editing === coupon.id ? (
              <li key={coupon.id}>
                <CouponForm coupon={coupon} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                onEdit={() => setEditing(coupon.id)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function CouponRow({ coupon, onEdit }: { coupon: AdminCouponCard; onEdit: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const agotado = coupon.maxUses !== null && coupon.timesUsed >= coupon.maxUses;

  return (
    <li className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium tabular-nums">{coupon.code}</span>
        <span className="text-sm">
          {describeValue(coupon)} de descuento
          {coupon.isActive ? null : <span className="text-muted-foreground"> · desactivado</span>}
          {agotado ? <span className="text-muted-foreground"> · agotado</span> : null}
        </span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {TYPE_LABEL[coupon.type]}
        {coupon.minOrderPyg ? ` · mínimo ${formatGs(coupon.minOrderPyg)}` : ""}
        {coupon.desde ? ` · desde ${coupon.desde}` : ""}
        {coupon.hasta ? ` · hasta ${coupon.hasta}` : ""}
        {coupon.soloClientes ? " · sólo con cuenta" : ""}
      </p>

      {/*
        Usos consumidos, que es lo que el plan pide ver. Se muestran los dos
        números: el contador que decide si el cupón sigue disponible y los
        pedidos que lo tienen de verdad. Si se separan, `pnpm reconcile` lo
        reporta — verlo acá es notarlo antes.
      */}
      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        {coupon.timesUsed} uso{coupon.timesUsed === 1 ? "" : "s"}
        {coupon.maxUses !== null ? ` de ${coupon.maxUses}` : ""}
        {coupon.orderCount !== coupon.timesUsed
          ? ` · ⚠ ${coupon.orderCount} pedidos lo usan`
          : ""}
        {coupon.discountedPyg > 0 ? ` · ${formatGs(coupon.discountedPyg)} descontados` : ""}
        {coupon.maxUsesPerCustomer !== null
          ? ` · máx. ${coupon.maxUsesPerCustomer} por cliente`
          : ""}
      </p>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-2 rounded-lg border p-2 text-xs"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={isPending}>
          Editar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={coupon.isActive ? "outline" : "default"}
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await cambiarEstadoCupon({
                id: coupon.id,
                isActive: !coupon.isActive,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(coupon.isActive ? "Cupón desactivado." : "Cupón activado.");
              router.refresh();
            });
          }}
        >
          {coupon.isActive ? "Desactivar" : "Activar"}
        </Button>
      </div>
    </li>
  );
}

function CouponForm({ coupon, onDone }: { coupon?: AdminCouponCard; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<CouponType>(coupon?.type ?? "porcentaje");
  const [soloClientes, setSoloClientes] = useState(coupon?.soloClientes ?? false);

  /** Vacío = sin límite. `null` y `0` no son lo mismo acá. */
  const optionalNumber = (value: FormDataEntryValue | null): number | null => {
    const text = String(value ?? "").trim();
    if (text === "") return null;
    const parsed = Number(text);
    return Number.isInteger(parsed) ? parsed : null;
  };

  return (
    <form
      className="border-border grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        const payload = {
          code: String(data.get("code") ?? ""),
          type,
          value: Number(String(data.get("value") ?? "0")),
          minOrderPyg: optionalNumber(data.get("minOrderPyg")),
          desde: String(data.get("desde") ?? ""),
          hasta: String(data.get("hasta") ?? ""),
          maxUses: optionalNumber(data.get("maxUses")),
          maxUsesPerCustomer: optionalNumber(data.get("maxUsesPerCustomer")),
          soloClientes,
          isActive: coupon?.isActive ?? true,
        };

        startTransition(async () => {
          const result = coupon
            ? await editarCupon({ ...payload, id: coupon.id })
            : await crearCupon(payload);

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(coupon ? "Cupón actualizado." : "Cupón creado.");
          onDone();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">{coupon ? `Editar ${coupon.code}` : "Nuevo cupón"}</h2>

      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            name="code"
            required
            minLength={3}
            maxLength={40}
            defaultValue={coupon?.code ?? ""}
            className="uppercase"
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">
            Se guarda en mayúsculas. Es lo que va a tipear la compradora.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="value">
            {type === "porcentaje" ? "Porcentaje (1 a 100)" : "Monto en guaraníes"}
          </Label>
          <Input
            id="value"
            name="value"
            type="number"
            required
            min={1}
            max={type === "porcentaje" ? 100 : undefined}
            step={1}
            defaultValue={coupon?.value ?? ""}
            inputMode="numeric"
          />
          <p className="text-muted-foreground text-xs">
            Enteros. El guaraní no tiene céntimos.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Tipo</legend>
        {COUPON_TYPES.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              checked={type === option}
              onChange={() => setType(option)}
            />
            <span>{TYPE_LABEL[option]}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="minOrderPyg">
            Mínimo de compra{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="minOrderPyg"
            name="minOrderPyg"
            type="number"
            min={0}
            step={1}
            defaultValue={coupon?.minOrderPyg ?? ""}
            inputMode="numeric"
          />
          <p className="text-muted-foreground text-xs">Sobre el subtotal, sin el envío.</p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="maxUses">
            Tope de usos <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="maxUses"
            name="maxUses"
            type="number"
            min={1}
            step={1}
            defaultValue={coupon?.maxUses ?? ""}
            inputMode="numeric"
          />
          <p className="text-muted-foreground text-xs">Vacío = sin tope.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="desde">
            Desde <span className="text-muted-foreground font-normal">(dd/mm/aaaa)</span>
          </Label>
          <Input id="desde" name="desde" defaultValue={coupon?.desde ?? ""} placeholder="01/09/2026" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hasta">
            Hasta <span className="text-muted-foreground font-normal">(dd/mm/aaaa)</span>
          </Label>
          <Input id="hasta" name="hasta" defaultValue={coupon?.hasta ?? ""} placeholder="30/09/2026" />
          <p className="text-muted-foreground text-xs">Incluye todo ese día.</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="maxUsesPerCustomer">
          Máximo por cliente{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="maxUsesPerCustomer"
          name="maxUsesPerCustomer"
          type="number"
          min={1}
          step={1}
          defaultValue={coupon?.maxUsesPerCustomer ?? ""}
          inputMode="numeric"
        />
        <p className="text-muted-foreground text-xs">
          Se cuenta por cuenta de cliente, o por WhatsApp si compró de invitada.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={soloClientes}
          onChange={(event) => setSoloClientes(event.target.checked)}
        />
        <span>
          Sólo para quienes tengan cuenta
          <span className="text-muted-foreground block text-xs">
            Si esta tienda no tiene las cuentas de cliente prendidas, un cupón
            así no lo va a poder usar nadie.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : coupon ? "Guardar cambios" : "Crear cupón"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
