"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cambiarEstadoZonaEnvio,
  crearZonaEnvio,
  editarZonaEnvio,
  moverZonaEnvio,
} from "@/app/actions/admin-shipping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCityList } from "@/lib/city-list";
import { formatGs } from "@/lib/money";
import { slugify } from "@/lib/slug";

export type AdminShippingZoneCard = {
  id: number;
  slug: string;
  name: string;
  cities: string[];
  pricePyg: number;
  freeThresholdPyg: number | null;
  isActive: boolean;
  esPrimera: boolean;
  esUltima: boolean;
};

export function ShippingZonesManager({ zones }: { zones: AdminShippingZoneCard[] }) {
  const [editing, setEditing] = useState<number | "nueva" | null>(null);

  const activas = zones.filter((zone) => zone.isActive);
  /**
   * La zona que se cobra cuando la ciudad no está en ninguna lista. No es una
   * elección de nadie: `quoteShipping` se queda con la más cara de las activas.
   * Verla nombrada acá es lo que evita la sorpresa de un pueblo del interior
   * cobrado a tarifa de Asunción.
   */
  const fallback = activas.reduce<AdminShippingZoneCard | null>(
    (worst, zone) => (worst === null || zone.pricePyg > worst.pricePyg ? zone : worst),
    null,
  );

  return (
    <div className="grid gap-6">
      {editing === "nueva" ? (
        <ZoneForm onDone={() => setEditing(null)} />
      ) : (
        <div>
          <Button type="button" onClick={() => setEditing("nueva")}>
            Crear zona
          </Button>
        </div>
      )}

      {zones.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          Todavía no hay zonas de envío. Mientras no haya ninguna activa, el
          checkout cobra ₲0 de flete y lo dice en pantalla — está bien para una
          demo y no para cobrar de verdad.
        </p>
      ) : (
        <>
          {fallback ? (
            <p className="border-border rounded-xl border p-3 text-xs">
              Una ciudad que no esté en ninguna lista se cotiza como{" "}
              <strong>{fallback.name}</strong> ({formatGs(fallback.pricePyg)}), que es
              la zona activa más cara. El checkout se lo avisa a la compradora.
            </p>
          ) : null}

          <ul className="grid gap-3">
            {zones.map((zone) =>
              editing === zone.id ? (
                <li key={zone.id}>
                  <ZoneForm zone={zone} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <ZoneRow key={zone.id} zone={zone} onEdit={() => setEditing(zone.id)} />
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function ZoneRow({ zone, onEdit }: { zone: AdminShippingZoneCard; onEdit: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string): void => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No pudimos hacer eso.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  };

  return (
    <li className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium">
          {zone.name}
          {zone.isActive ? null : (
            <span className="text-muted-foreground font-normal"> · desactivada</span>
          )}
        </span>
        <span className="text-sm tabular-nums">
          {zone.pricePyg === 0 ? "Envío gratis" : formatGs(zone.pricePyg)}
        </span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {zone.cities.length === 0 ? (
          <>Sin ciudades: sólo se usa como comodín cuando es la activa más cara.</>
        ) : (
          <>
            {zone.cities.length} ciudad{zone.cities.length === 1 ? "" : "es"}:{" "}
            {zone.cities.slice(0, 6).join(", ")}
            {zone.cities.length > 6 ? `, +${zone.cities.length - 6} más` : ""}
          </>
        )}
      </p>

      {zone.freeThresholdPyg !== null ? (
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          Gratis a partir de {formatGs(zone.freeThresholdPyg)} de subtotal.
        </p>
      ) : null}

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
          variant={zone.isActive ? "outline" : "default"}
          disabled={isPending}
          onClick={() =>
            run(
              () => cambiarEstadoZonaEnvio({ zoneId: zone.id, isActive: !zone.isActive }),
              zone.isActive ? "Zona desactivada." : "Zona activada.",
            )
          }
        >
          {zone.isActive ? "Desactivar" : "Activar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Subir ${zone.name}`}
          disabled={isPending || zone.esPrimera}
          onClick={() =>
            run(() => moverZonaEnvio({ zoneId: zone.id, direction: "up" }), "Orden actualizado.")
          }
        >
          ↑
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Bajar ${zone.name}`}
          disabled={isPending || zone.esUltima}
          onClick={() =>
            run(() => moverZonaEnvio({ zoneId: zone.id, direction: "down" }), "Orden actualizado.")
          }
        >
          ↓
        </Button>
      </div>
    </li>
  );
}

function ZoneForm({ zone, onDone }: { zone?: AdminShippingZoneCard; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(zone?.name ?? "");
  const [slug, setSlug] = useState(zone?.slug ?? "");
  const [slugTocado, setSlugTocado] = useState(Boolean(zone));
  const [cities, setCities] = useState((zone?.cities ?? []).join("\n"));

  const parsed = parseCityList(cities);

  return (
    <form
      className="border-border grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        // Vacío no es cero: "sin umbral" y "gratis desde ₲0" son cosas
        // distintas, y el dominio rechaza la segunda por escrito.
        const umbralTexto = String(data.get("freeThresholdPyg") ?? "").trim();
        const payload = {
          name,
          slug,
          cities: parsed,
          pricePyg: Number(String(data.get("pricePyg") ?? "0")),
          freeThresholdPyg: umbralTexto === "" ? null : Number(umbralTexto),
        };

        startTransition(async () => {
          const result = zone
            ? await editarZonaEnvio({ zoneId: zone.id, data: payload })
            : await crearZonaEnvio(payload);

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(zone ? "Zona actualizada." : "Zona creada.");
          onDone();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">{zone ? `Editar ${zone.name}` : "Nueva zona"}</h2>

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
          <Label htmlFor="zona-name">Nombre</Label>
          <Input
            id="zona-name"
            value={name}
            required
            minLength={2}
            maxLength={160}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTocado) setSlug(slugify(event.target.value));
            }}
          />
          <p className="text-muted-foreground text-xs">
            Lo lee la compradora en el checkout: “Envío — Gran Asunción”.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="zona-price">Precio del envío</Label>
          <Input
            id="zona-price"
            name="pricePyg"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={zone?.pricePyg ?? ""}
            inputMode="numeric"
          />
          <p className="text-muted-foreground text-xs">
            Guaraníes enteros, IVA 10% incluido como el resto de los precios.
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="zona-cities">Ciudades</Label>
        <textarea
          id="zona-cities"
          value={cities}
          rows={5}
          className="border-input bg-background min-h-24 rounded-md border px-3 py-2 text-sm"
          placeholder={"Asunción\nLambaré\nFernando de la Mora"}
          onChange={(event) => setCities(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Una por línea o separadas por coma — pegá la lista como la tengas.{" "}
          {parsed.length === 0 ? (
            <>
              Sin ninguna, esta zona nunca coincide con una ciudad: sólo se cobra
              si es la activa más cara, o sea como comodín del interior.
            </>
          ) : (
            <>
              Van {parsed.length}. Los acentos y las mayúsculas no importan al
              comparar; se guarda como lo escribiste.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="zona-free">
            Envío gratis desde{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="zona-free"
            name="freeThresholdPyg"
            type="number"
            min={1}
            step={1}
            defaultValue={zone?.freeThresholdPyg ?? ""}
            inputMode="numeric"
          />
          <p className="text-muted-foreground text-xs">
            Sobre el subtotal, sin el envío. Vacío = esta zona no lo ofrece.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="zona-slug">Identificador</Label>
          <Input
            id="zona-slug"
            value={slug}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => {
              setSlugTocado(true);
              setSlug(event.target.value);
            }}
          />
          <p className="text-muted-foreground text-xs">
            Interno: no sale en ninguna URL. Sirve para distinguir dos zonas que
            se llamen parecido.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : zone ? "Guardar cambios" : "Crear zona"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
