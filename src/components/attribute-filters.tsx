"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogueFacet } from "@/domain/catalogue-facets";
import { t } from "@/i18n/client";

/**
 * Atributos y stock de una categoría. Las opciones salen de toda la categoría
 * y el número entre paréntesis es cuántos productos quedarían eligiéndola con
 * los demás filtros puestos (`getCatalogueFacets`, F4): una opción en 0 se ve
 * pero no se elige, y un atributo sin ningún valor verificado no se dibuja.
 */
export function AttributeFilters({ facets }: { facets: CatalogueFacet[] }) {
  const router = useRouter();
  const params = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`?${next.toString()}`, { scroll: false });
  }
  return (
    <fieldset className="mt-3 flex flex-wrap items-end gap-3">
      <legend className="sr-only">{t("filtros.atributos")}</legend>
      {facets
        .filter((facet) => facet.values.length > 0)
        .map((facet) => {
          const selected = params.get(`atributo.${facet.key}`) ?? "";
          return (
            <label key={facet.key} className="grid gap-1 text-sm">
              {facet.label}
              <select
                className="bg-background rounded border p-2"
                value={selected}
                onChange={(event) =>
                  update(`atributo.${facet.key}`, event.target.value)
                }
              >
                <option value="">{t("filtros.todas")}</option>
                {facet.values.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                    disabled={item.total === 0 && item.value !== selected}
                  >
                    {item.value} ({item.total})
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={params.get("stock") === "1"}
          onChange={(event) => update("stock", event.target.checked ? "1" : "")}
        />
        {t("filtros.stock")}
      </label>
    </fieldset>
  );
}
