"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ORDER_STATUSES, PAYMENT_METHODS } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "./labels";

type Defaults = { estado: string; metodo: string; desde: string; hasta: string; q: string };

/**
 * Filtros del listado de pedidos.
 *
 * Navega cambiando la URL en vez de guardar estado propio: así el filtro se
 * puede compartir por WhatsApp, sobrevive al refresh y deja el "atrás" del
 * celular funcionando. El filtrado de verdad pasa en MySQL (ver
 * `domain/admin-orders.ts`).
 */
export function OrderFiltersForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(defaults).filter((value) => value !== "").length;

  const submit = (form: HTMLFormElement): void => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text !== "") params.set(key, text);
    }
    const qs = params.toString();
    router.push(qs === "" ? "/admin/pedidos" : `/admin/pedidos?${qs}`);
  };

  return (
    <form
      className="border-border grid gap-3 rounded-xl border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <div className="flex gap-2">
        <Input
          name="q"
          defaultValue={defaults.q}
          placeholder="Nº de pedido, WhatsApp o RUC"
          aria-label="Buscar pedido"
          inputMode="search"
        />
        <Button type="submit">Buscar</Button>
      </div>

      <button
        type="button"
        className="text-muted-foreground justify-self-start text-sm underline"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Ocultar filtros" : "Más filtros"}
        {!open && activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      {/* Colapsados por defecto: en un celular, cuatro selects arriba del
          listado empujan los pedidos abajo del pliegue. */}
      {open ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="estado">Estado</Label>
            <select
              id="estado"
              name="estado"
              defaultValue={defaults.estado}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Todos</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="metodo">Método de pago</Label>
            <select
              id="metodo"
              name="metodo"
              defaultValue={defaults.metodo}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Todos</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABEL[method]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" name="desde" type="date" defaultValue={defaults.desde} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" name="hasta" type="date" defaultValue={defaults.hasta} />
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" className="flex-1">
              Aplicar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/pedidos")}
            >
              Limpiar
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
