"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
export function ComparisonPicker({
  products,
  selected,
  limit,
}: {
  products: { slug: string; name: string }[];
  selected: string[];
  limit: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(selected);
  return (
    <form
      className="my-6 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`/comparar?p=${encodeURIComponent(chosen.join(","))}`);
      }}
    >
      <fieldset className="grid gap-2">
        <legend>Elegí hasta {limit} productos</legend>
        {products.map((product) => (
          <label key={product.slug}>
            <input
              type="checkbox"
              checked={chosen.includes(product.slug)}
              disabled={
                !chosen.includes(product.slug) && chosen.length >= limit
              }
              onChange={(event) =>
                setChosen(
                  event.target.checked
                    ? [...chosen, product.slug]
                    : chosen.filter((slug) => slug !== product.slug)
                )
              }
            />{" "}
            {product.name}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="w-fit rounded border px-4 py-3">
        Actualizar comparación
      </button>
    </form>
  );
}
