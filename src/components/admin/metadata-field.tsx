"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTimePY } from "@/lib/py";
import { withoutStamps } from "@/lib/verification-stamps";

type Stamps = {
  verifiedAt?: string;
  verifiedBy?: { label?: string };
};

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Editor JSON opcional; conserva las claves que defina cada tienda.
 *
 * La verificación no se tipea (docs/TEMPLATE-IMPROVEMENT-PLAN.md E1): el JSON
 * se muestra sin `verifiedAt`/`verifiedBy`, y la casilla "Verifiqué estos
 * datos" hace que el servidor selle con su hora y tu usuario. Guardar sin
 * cambios conserva el sello; cambiar sin confirmar deja los datos sin
 * verificar.
 */
export function MetadataField({
  name,
  label,
  value,
  suffix = "",
}: {
  name: string;
  label: string;
  value?: unknown;
  suffix?: string;
}) {
  const stored = plainObject(value);
  const stamps = (stored ?? {}) as Stamps;
  const content = stored ? withoutStamps(stored) : null;
  const verifiedAt = stamps.verifiedAt ? new Date(stamps.verifiedAt) : null;
  const id = `${name}${suffix}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        className="bg-background min-h-28 rounded border p-2 font-mono text-xs"
        maxLength={12000}
        aria-describedby={`${id}-estado ${id}-ayuda`}
        defaultValue={
          content && Object.keys(content).length > 0
            ? JSON.stringify(content, null, 2)
            : ""
        }
      />
      <p id={`${id}-estado`} className="text-xs">
        {verifiedAt && !Number.isNaN(verifiedAt.getTime())
          ? stamps.verifiedBy?.label
            ? `Verificado el ${formatDateTimePY(verifiedAt)} por ${stamps.verifiedBy.label}.`
            : `Verificado el ${formatDateTimePY(verifiedAt)} (sin registro de quién).`
          : "Sin verificar: no se publica."}
      </p>
      <label
        className="flex items-start gap-2 text-sm"
        htmlFor={`${id}-verificado`}
      >
        <input
          id={`${id}-verificado`}
          type="checkbox"
          name={`${name}Verificado`}
          className="mt-1"
        />
        <span>
          Verifiqué estos datos contra la fuente. Se sella con la fecha de hoy y
          tu usuario.
        </span>
      </label>
      <p id={`${id}-ayuda`} className="text-muted-foreground text-xs">
        Opcional. JSON; vacío elimina este registro. La fecha y quién verificó
        los pone el sistema: si cambiás los datos sin marcar la casilla, quedan
        sin verificar. No deduzcas hechos de las fotos.
      </p>
    </div>
  );
}
export function metadataFormValue(data: FormData, name: string): unknown {
  const raw = String(data.get(name) ?? "").trim();
  return raw ? JSON.parse(raw) : null;
}
/** La casilla "Verifiqué estos datos" de un `MetadataField`. */
export function metadataConfirmed(data: FormData, name: string): boolean {
  return data.get(`${name}Verificado`) === "on";
}
export function ProductSeoFields({
  title,
  description,
}: {
  title?: string | null;
  description?: string | null;
}) {
  return (
    <fieldset className="grid gap-3 rounded border p-3">
      <legend>SEO opcional</legend>
      <Label htmlFor="seoTitle">Título para buscadores</Label>
      <Input
        id="seoTitle"
        name="seoTitle"
        maxLength={200}
        defaultValue={title ?? ""}
      />
      <Label htmlFor="seoDescription">Descripción para buscadores</Label>
      <textarea
        id="seoDescription"
        name="seoDescription"
        maxLength={500}
        className="rounded border p-2"
        defaultValue={description ?? ""}
      />
      <p className="text-muted-foreground text-xs">
        Vacío conserva el nombre y la descripción como fallback. El H1 sigue
        siendo el nombre del producto.
      </p>
    </fieldset>
  );
}
