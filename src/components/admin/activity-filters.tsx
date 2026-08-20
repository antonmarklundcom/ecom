"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ActivityActorOption = { id: number; label: string; isActive: boolean };

type Defaults = { tipo: string; quien: string; desde: string; hasta: string };

/**
 * Filtros del feed de actividad.
 *
 * Navega cambiando la URL, igual que los filtros de pedidos y por los mismos
 * motivos: el filtro se puede compartir por WhatsApp, sobrevive al refresh y
 * el "atrás" del celular hace lo que se espera. El filtrado pasa en MySQL
 * (`domain/admin-activity.ts`) — acá sólo se arma el querystring.
 *
 * A diferencia del de pedidos, éste va siempre abierto: son cuatro campos y la
 * pantalla se abre justamente para filtrar. Colapsarlo agregaría un toque a la
 * única cosa que se viene a hacer.
 */
export function ActivityFiltersForm({
  defaults,
  actores,
}: {
  defaults: Defaults;
  actores: ActivityActorOption[];
}) {
  const router = useRouter();

  const submit = (form: HTMLFormElement): void => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text !== "") params.set(key, text);
    }
    const qs = params.toString();
    router.push(qs === "" ? "/admin/actividad" : `/admin/actividad?${qs}`);
  };

  return (
    <form
      className="border-border grid gap-3 rounded-xl border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-quien">Quién</Label>
          <select
            id="filtro-quien"
            name="quien"
            defaultValue={defaults.quien}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Cualquiera</option>
            {/*
              "El sistema" no es un usuario y no se puede omitir: son las filas
              sin `actor_user_id` —el cron que vence pedidos, el webhook de
              Pagopar, la compradora subiendo su comprobante— y es justo lo que
              se quiere mirar cuando algo cambió y nadie lo tocó.
            */}
            <option value="sistema">El sistema (cron, Pagopar, la compradora)</option>
            {actores.map((actor) => (
              <option key={actor.id} value={String(actor.id)}>
                {actor.label}
                {actor.isActive ? "" : " (desactivado)"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <select
            id="filtro-tipo"
            name="tipo"
            defaultValue={defaults.tipo}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Todo</option>
            <option value="pedido">Cambios de pedido</option>
            <option value="stock">Ajustes de stock</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-desde">Desde</Label>
          <Input id="filtro-desde" name="desde" type="date" defaultValue={defaults.desde} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filtro-hasta">Hasta</Label>
          <Input id="filtro-hasta" name="hasta" type="date" defaultValue={defaults.hasta} />
          <p className="text-muted-foreground text-xs">Incluye todo ese día.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => router.push("/admin/actividad")}
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
