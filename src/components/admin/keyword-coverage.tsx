"use client";
import { useState } from "react";
export function KeywordCoverage({
  keywords,
}: {
  keywords: readonly { term: string; plannedPath: string; covered: boolean }[];
}) {
  const [query, setQuery] = useState("");
  const filtered = keywords
    .filter((row) => row.term.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 500);
  return (
    <div className="grid gap-4">
      <label>
        Buscar término{" "}
        <input
          className="rounded border p-2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p>
        Cobertura editorial planificada. Estas marcas no son posiciones, tráfico
        ni resultados de buscadores.
      </p>
      <div className="overflow-x-auto">
        <table>
          <caption className="sr-only">Plan de cobertura editorial</caption>
          <thead>
            <tr>
              <th scope="col" className="p-3">
                Término
              </th>
              <th scope="col" className="p-3">
                Página planificada
              </th>
              <th scope="col" className="p-3">
                Cobertura
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.term}:${row.plannedPath}`}>
                <td className="p-3">{row.term}</td>
                <td className="p-3">{row.plannedPath}</td>
                <td className="p-3">
                  {row.covered ? "Preparada" : "Pendiente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
