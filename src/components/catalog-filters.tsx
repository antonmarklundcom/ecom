"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BrandFacet } from "@/db/queries";
import { PRICE_RANGES } from "@/lib/price-ranges";

const SORT_LABELS: Record<string, string> = {
  relevancia: "Más relevantes",
  "precio-asc": "Precio: menor a mayor",
  "precio-desc": "Precio: mayor a menor",
  nuevos: "Más nuevos",
};

const ALL = "__todas__";

/**
 * Los filtros viven en la URL: así el listado sigue siendo un Server
 * Component cacheable y el comprador puede compartir el link filtrado por
 * WhatsApp, que es como se comparte todo acá.
 */
export function CatalogFilters({ brands }: { brands: BrandFacet[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete("page"); // cambiar un filtro vuelve a la página 1
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const marca = params.get("marca");
  const precio = params.get("precio");

  /*
    Los chips no son un adorno: los `<Select>` de arriba muestran su valor,
    pero en el celular quedan fuera de pantalla apenas se hace scroll, y la
    pregunta "¿por qué veo tan pocos productos?" se contesta mirando arriba de
    la grilla, no volviendo a subir. Cada chip se saca de a uno — "Limpiar
    todo" obliga a rehacer los que sí servían.
  */
  // `orden` no entra: ordenar no achica el resultado, así que un chip con ✕
  // ahí prometería devolver productos que nunca se fueron.
  const activos: Array<{ key: "marca" | "precio"; label: string }> = [];
  if (marca) activos.push({ key: "marca", label: marca });
  if (precio) {
    const range = PRICE_RANGES.find((item) => item.id === precio);
    if (range) activos.push({ key: "precio", label: range.label });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {brands.length > 0 ? (
          <Select
            value={marca ?? ALL}
            onValueChange={(value) => update("marca", value)}
          >
            <SelectTrigger className="w-[200px]" aria-label="Filtrar por marca">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las marcas</SelectItem>
              {brands.map((facet) => (
                <SelectItem key={facet.brand} value={facet.brand}>
                  {/*
                    El conteo va acá y no sólo en el chip: es antes de elegir
                    cuando sirve saber que esa marca tiene un solo producto.
                  */}
                  {facet.brand} ({facet.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={precio ?? ALL} onValueChange={(value) => update("precio", value)}>
          <SelectTrigger className="w-[200px]" aria-label="Filtrar por precio">
            <SelectValue placeholder="Precio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Cualquier precio</SelectItem>
            {PRICE_RANGES.map((range) => (
              <SelectItem key={range.id} value={range.id}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.get("orden") ?? "relevancia"}
          onValueChange={(value) => update("orden", value === "relevancia" ? null : value)}
        >
          <SelectTrigger className="w-[200px]" aria-label="Ordenar">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activos.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2">
          {activos.map((filtro) => (
            <li key={filtro.key}>
              <button
                type="button"
                onClick={() => update(filtro.key, null)}
                className="border-border hover:bg-muted flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
              >
                {filtro.label}
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">Quitar el filtro {filtro.label}</span>
              </button>
            </li>
          ))}
          {activos.length > 1 ? (
            <li>
              <Button variant="ghost" size="sm" onClick={() => router.push("?", { scroll: false })}>
                Limpiar todo
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
