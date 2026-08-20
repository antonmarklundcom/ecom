"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEXTOS } from "@/i18n";

type Defaults = { usuario: string; tipo: string; desde: string; hasta: string };

export type ActivityActor = { id: number; email: string; name: string | null };

/**
 * Filtros del feed de actividad.
 *
 * Navega cambiando la URL, igual que los filtros de pedidos: así "lo que hizo
 * la encargada el martes" es un link que se puede mandar por WhatsApp, y el
 * "atrás" del celular funciona.
 */
export function ActivityFilters({
  defaults,
  actors,
}: {
  defaults: Defaults;
  actors: ActivityActor[];
}) {
  const router = useRouter();

  return (
    <form
      className="border-border grid gap-3 rounded-xl border p-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const [key, value] of data.entries()) {
          const text = String(value).trim();
          if (text !== "") params.set(key, text);
        }
        const qs = params.toString();
        router.push(qs === "" ? "/admin/actividad" : `/admin/actividad?${qs}`);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="usuario">{TEXTOS.panel.actividad.usuario}</Label>
        <select
          id="usuario"
          name="usuario"
          defaultValue={defaults.usuario}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">{TEXTOS.panel.actividad.todos}</option>
          {actors.map((actor) => (
            <option key={actor.id} value={String(actor.id)}>
              {actor.name ?? actor.email}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="tipo">{TEXTOS.panel.actividad.tipo}</Label>
        <select
          id="tipo"
          name="tipo"
          defaultValue={defaults.tipo}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">{TEXTOS.panel.actividad.todo}</option>
          <option value="pedido">{TEXTOS.panel.actividad.pedidos}</option>
          <option value="stock">{TEXTOS.panel.actividad.stock}</option>
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="desde">{TEXTOS.panel.actividad.desde}</Label>
        <Input id="desde" name="desde" type="date" defaultValue={defaults.desde} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="hasta">{TEXTOS.panel.actividad.hasta}</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={defaults.hasta} />
      </div>

      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" size="sm">
          {TEXTOS.panel.actividad.filtrar}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => router.push("/admin/actividad")}
        >
          {TEXTOS.panel.actividad.limpiar}
        </Button>
      </div>
    </form>
  );
}
