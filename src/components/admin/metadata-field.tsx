"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Optional JSON editor preserves arbitrary store-defined keys across saves. */
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
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${name}${suffix}`}>{label}</Label>
      <textarea
        id={`${name}${suffix}`}
        name={name}
        className="bg-background min-h-28 rounded border p-2 font-mono text-xs"
        maxLength={12000}
        defaultValue={value ? JSON.stringify(value, null, 2) : ""}
      />
      <p className="text-muted-foreground text-xs">
        Opcional. JSON; vacío elimina este registro. verifiedAt requiere fecha
        ISO real, sin fechas futuras. No deduzcas hechos de las fotos.
      </p>
    </div>
  );
}
export function metadataFormValue(data: FormData, name: string): unknown {
  const raw = String(data.get(name) ?? "").trim();
  return raw ? JSON.parse(raw) : null;
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
