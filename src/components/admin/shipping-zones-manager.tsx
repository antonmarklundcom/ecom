"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cambiarEstadoZonaEnvio,
  crearZonaEnvio,
  editarZonaEnvio,
} from "@/app/actions/admin-shipping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEXTOS } from "@/i18n";
import { formatGs } from "@/lib/money";

export type AdminShippingZoneCard = {
  id: number;
  slug: string;
  name: string;
  cities: string[];
  pricePyg: number;
  freeThresholdPyg: number | null;
  isActive: boolean;
};

export function ShippingZonesManager({ zones }: { zones: AdminShippingZoneCard[] }) {
  const [editing, setEditing] = useState<number | "nueva" | null>(null);
  const activas = zones.filter((zone) => zone.isActive);

  return (
    <div className="grid gap-6">
      {activas.length === 0 ? (
        <p
          role="status"
          className="border-border border-l-primary rounded-lg border border-l-2 p-4 text-sm"
        >
          {TEXTOS.panel.envios.sinZonasActivas1} <strong>{TEXTOS.panel.envios.sinZonasActivas2}</strong>
          {TEXTOS.panel.envios.sinZonasActivas3}
        </p>
      ) : null}

      {editing === "nueva" ? (
        <ZoneForm onDone={() => setEditing(null)} />
      ) : (
        <div>
          <Button type="button" onClick={() => setEditing("nueva")}>
            {TEXTOS.panel.envios.crear}
          </Button>
        </div>
      )}

      {zones.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          {TEXTOS.panel.envios.sinZonas}
        </p>
      ) : (
        <ul className="grid gap-3">
          {zones.map((zone) =>
            editing === zone.id ? (
              <li key={zone.id}>
                <ZoneForm zone={zone} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <ZoneRow
                key={zone.id}
                zone={zone}
                ultimaActiva={zone.isActive && activas.length === 1}
                masCara={zone.id === zonaMasCara(activas)?.id}
                onEdit={() => setEditing(zone.id)}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * La zona que paga la ciudad que no está en ninguna lista.
 *
 * `quoteShipping()` cotiza la tarifa más alta cuando no encuentra la ciudad
 * (cobrar de menos sale del bolsillo del comercio). Vale marcarla acá: es la
 * que decide cuánto paga un pueblo que el dueño nunca escribió.
 */
function zonaMasCara(activas: AdminShippingZoneCard[]): AdminShippingZoneCard | undefined {
  return activas.reduce<AdminShippingZoneCard | undefined>(
    (worst, zone) => (worst === undefined || zone.pricePyg > worst.pricePyg ? zone : worst),
    undefined
  );
}

function ZoneRow({
  zone,
  ultimaActiva,
  masCara,
  onEdit,
}: {
  zone: AdminShippingZoneCard;
  ultimaActiva: boolean;
  masCara: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium">
          {zone.name}
          {zone.isActive ? null : (
            <span className="text-muted-foreground font-normal">{TEXTOS.panel.envios.desactivadaSufijo}</span>
          )}
        </span>
        <span className="text-sm tabular-nums">
          {zone.pricePyg === 0 ? TEXTOS.panel.envios.gratis : formatGs(zone.pricePyg)}
        </span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {zone.cities.length > 0 ? zone.cities.join(" · ") : TEXTOS.panel.envios.sinCiudades}
      </p>

      <p className="text-muted-foreground mt-1 text-xs">
        {zone.freeThresholdPyg !== null
          ? TEXTOS.panel.envios.gratisDesde(formatGs(zone.freeThresholdPyg))
          : TEXTOS.panel.envios.sinEnvioGratis}
        {masCara ? TEXTOS.panel.envios.esLaMasCara : ""}
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
          {TEXTOS.panel.comunes.editar}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={zone.isActive ? "outline" : "default"}
          disabled={isPending}
          onClick={() => {
            if (
              zone.isActive &&
              ultimaActiva &&
              !confirm(TEXTOS.panel.envios.confirmarUltima(zone.name))
            ) {
              return;
            }

            setError(null);
            startTransition(async () => {
              const result = await cambiarEstadoZonaEnvio({
                id: zone.id,
                isActive: !zone.isActive,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(zone.isActive ? TEXTOS.panel.envios.desactivadaToast : TEXTOS.panel.envios.activadaToast);
              router.refresh();
            });
          }}
        >
          {zone.isActive ? TEXTOS.panel.comunes.desactivar : TEXTOS.panel.comunes.activar}
        </Button>
      </div>
    </li>
  );
}

function ZoneForm({ zone, onDone }: { zone?: AdminShippingZoneCard; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gratis, setGratis] = useState(zone?.freeThresholdPyg !== null && zone !== undefined);

  return (
    <form
      className="border-border grid gap-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);

        const umbral = String(data.get("freeThresholdPyg") ?? "").trim();
        const payload = {
          name: String(data.get("name") ?? ""),
          slug: String(data.get("slug") ?? "").trim() || undefined,
          // Una ciudad por línea: pegar una lista de un WhatsApp es el caso
          // real, y un campo con comas convierte "Santa Rita, Alto Paraná" en
          // dos ciudades que no existen.
          cities: String(data.get("cities") ?? "")
            .split("\n")
            .map((city) => city.trim())
            .filter(Boolean),
          pricePyg: Number(String(data.get("pricePyg") ?? "0")),
          freeThresholdPyg: gratis && umbral !== "" ? Number(umbral) : null,
        };

        startTransition(async () => {
          const result = zone
            ? await editarZonaEnvio({ ...payload, id: zone.id })
            : await crearZonaEnvio(payload);

          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(zone ? TEXTOS.panel.envios.actualizada : TEXTOS.panel.envios.creada);
          onDone();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">{zone ? TEXTOS.panel.envios.editar(zone.name) : TEXTOS.panel.envios.nueva}</h2>

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
          <Label htmlFor="name">{TEXTOS.panel.comunes.nombre}</Label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={zone?.name ?? ""}
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">
            {TEXTOS.panel.envios.nombreAyuda}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pricePyg">{TEXTOS.panel.envios.precio}</Label>
          <Input
            id="pricePyg"
            name="pricePyg"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={zone?.pricePyg ?? 0}
          />
          <p className="text-muted-foreground text-xs">
            {TEXTOS.panel.envios.precioAyuda}
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cities">{TEXTOS.panel.envios.ciudades}</Label>
        <textarea
          id="cities"
          name="cities"
          rows={5}
          defaultValue={zone?.cities.join("\n") ?? ""}
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-xs">
          {TEXTOS.panel.envios.ciudadesAyuda}
        </p>
      </div>

      <div className="grid gap-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={gratis}
            onChange={(event) => setGratis(event.target.checked)}
            className="size-4"
          />
          {TEXTOS.panel.envios.envioGratisDesde}
        </label>
        {gratis ? (
          <>
            <Label htmlFor="freeThresholdPyg" className="sr-only">
              {TEXTOS.panel.envios.umbral}
            </Label>
            <Input
              id="freeThresholdPyg"
              name="freeThresholdPyg"
              type="number"
              min={1}
              step={1}
              defaultValue={zone?.freeThresholdPyg ?? ""}
              placeholder="500000"
            />
            <p className="text-muted-foreground text-xs">
              {TEXTOS.panel.envios.umbralAyuda}
            </p>
          </>
        ) : null}
      </div>

      <input type="hidden" name="slug" defaultValue={zone?.slug ?? ""} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? TEXTOS.panel.comunes.guardando : TEXTOS.panel.comunes.guardar}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          {TEXTOS.panel.comunes.cancelar}
        </Button>
      </div>
    </form>
  );
}
