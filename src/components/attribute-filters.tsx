"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { CatalogueFacet } from "@/domain/catalogue-facets";

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
      <legend className="sr-only">Características y disponibilidad</legend>
      {facets.map((facet) => (
        <label key={facet.key} className="grid gap-1 text-sm">
          {facet.label}
          <select
            className="bg-background rounded border p-2"
            value={params.get(`atributo.${facet.key}`) ?? ""}
            onChange={(event) =>
              update(`atributo.${facet.key}`, event.target.value)
            }
          >
            <option value="">Todas</option>
            {facet.values.map((item) => (
              <option key={item.value} value={item.value}>
                {item.value} ({item.total})
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={params.get("stock") === "1"}
          onChange={(event) => update("stock", event.target.checked ? "1" : "")}
        />
        Con stock disponible
      </label>
    </fieldset>
  );
}
