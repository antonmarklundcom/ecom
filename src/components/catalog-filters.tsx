"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
export function CatalogFilters({ brands }: { brands: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete("page"); // cambiar un filtro vuelve a la página 1
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const hasFilters = ["marca", "precio"].some((key) => params.get(key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {brands.length > 0 ? (
        <Select value={params.get("marca") ?? ALL} onValueChange={(value) => update("marca", value)}>
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por marca">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las marcas</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={params.get("precio") ?? ALL} onValueChange={(value) => update("precio", value)}>
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

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push("?", { scroll: false })}>
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  );
}
