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
import type { CatalogueFacet } from "@/domain/catalogue-facets";
import { t } from "@/i18n/client";
import { PRICE_RANGES } from "@/lib/price-ranges";

const SORT_LABELS: Record<string, () => string> = {
  relevancia: () => t("filtros.orden.relevancia"),
  "precio-asc": () => t("filtros.orden.precioAsc"),
  "precio-desc": () => t("filtros.orden.precioDesc"),
  nuevos: () => t("filtros.orden.nuevos"),
};

const ALL = "__todas__";

/**
 * Los filtros viven en la URL: así el listado sigue siendo un Server
 * Component cacheable y el comprador puede compartir el link filtrado por
 * WhatsApp, que es como se comparte todo acá.
 */
export function CatalogFilters({
  brands,
  showPrice = true,
  facets = [],
}: {
  brands: BrandFacet[];
  /**
   * Si algún producto de la categoría muestra precio (`categoryHasPrices`).
   * Sin ninguno, un rango de precio devuelve siempre cero: no se ofrece (F4).
   */
  showPrice?: boolean;
  /** Para nombrar en los chips los atributos puestos (`atributo.*`). */
  facets?: CatalogueFacet[];
}) {
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
  // ahí prometería devolver productos que nunca se fueron. Los atributos y el
  // stock sí (F4): antes no tenían chip y "Limpiar todo" los borraba sin
  // haberlos mostrado.
  const activos: Array<{ key: string; label: string }> = [];
  if (marca) activos.push({ key: "marca", label: marca });
  if (precio) {
    const range = PRICE_RANGES.find((item) => item.id === precio);
    if (range) activos.push({ key: "precio", label: range.label });
  }
  for (const [key, value] of params.entries()) {
    if (!key.startsWith("atributo.") || !value) continue;
    const facet = facets.find((item) => `atributo.${item.key}` === key);
    activos.push({
      key,
      label: t("filtros.chipAtributo", {
        atributo: facet?.label ?? key.slice("atributo.".length),
        valor: value,
      }),
    });
  }
  if (params.get("stock") === "1")
    activos.push({ key: "stock", label: t("filtros.stock") });

  // Saca todos los filtros y deja el orden (y cualquier otro parámetro que no
  // filtra): antes volvía a "?" y perdía el orden elegido.
  const limpiarTodo = () => {
    const next = new URLSearchParams(params.toString());
    for (const filtro of activos) next.delete(filtro.key);
    next.delete("page");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {brands.length > 0 ? (
          <Select
            value={marca ?? ALL}
            onValueChange={(value) => update("marca", value)}
          >
            <SelectTrigger
              className="w-[200px]"
              aria-label={t("filtros.marca.label")}
            >
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filtros.marca.todas")}</SelectItem>
              {brands.map((facet) => (
                <SelectItem
                  key={facet.brand}
                  value={facet.brand}
                  // Con los otros filtros puestos, esta marca no tendría
                  // ningún producto: se ve, pero no se elige (F4).
                  disabled={facet.total === 0 && facet.brand !== marca}
                >
                  {/*
                    El conteo va acá y no sólo en el chip: es antes de elegir
                    cuando sirve saber que esa marca tiene un solo producto.
                  */}
                  {t("filtros.marca.conCuenta", {
                    marca: facet.brand,
                    n: facet.total,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showPrice ? (
          <Select
            value={precio ?? ALL}
            onValueChange={(value) => update("precio", value)}
          >
            <SelectTrigger
              className="w-[200px]"
              aria-label={t("filtros.precio.label")}
            >
              <SelectValue placeholder="Precio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t("filtros.precio.cualquiera")}
              </SelectItem>
              {PRICE_RANGES.map((range) => (
                <SelectItem key={range.id} value={range.id}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={params.get("orden") ?? "relevancia"}
          onValueChange={(value) =>
            update("orden", value === "relevancia" ? null : value)
          }
        >
          <SelectTrigger
            className="w-[200px]"
            aria-label={t("filtros.orden.label")}
          >
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label()}
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
                <span className="sr-only">
                  {t("filtros.quitar", { filtro: filtro.label })}
                </span>
              </button>
            </li>
          ))}
          {activos.length > 1 ? (
            <li>
              <Button variant="ghost" size="sm" onClick={limpiarTodo}>
                {t("filtros.limpiarTodo")}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
