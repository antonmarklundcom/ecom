"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";

import { sugerirProductos, type Suggestion } from "@/app/actions/buscar";
import { Input } from "@/components/ui/input";
import { TEXTOS } from "@/i18n";

/** Lo que se espera desde la última tecla antes de preguntarle al servidor. */
const DEBOUNCE_MS = 250;

/**
 * Buscador del header, con sugerencias mientras se escribe.
 *
 * **Sin JavaScript sigue funcionando**: es un `<form>` de verdad, con
 * `action="/buscar"` y `method="get"`, así que el Enter navega a la página de
 * resultados igual que antes. Las sugerencias son un agregado encima; si el
 * JS no cargó, o el servidor tarda, o el rate limit cortó, no aparecen y no
 * pasa nada más. Esto importa más de lo que parece en una red móvil
 * paraguaya, donde el JS de una pestaña abierta en el colectivo puede no
 * llegar nunca.
 *
 * La búsqueda de verdad la hace `searchProducts()`, el mismo FULLTEXT que usa
 * `/buscar`: lo que se ve en la lista es lo que se va a encontrar al entrar.
 */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  // La respuesta guarda **para qué término** es. Así no hace falta limpiar la
  // lista cuando cambia el input: si el término guardado no es el que se está
  // escribiendo, no se muestra nada. De paso, la respuesta de "reme" que llega
  // tarde no puede pisar a la de "remera".
  const [answer, setAnswer] = useState<{ term: string; items: Suggestion[] }>({
    term: "",
    items: [],
  });
  const [open, setOpen] = useState(false);
  const listId = useId();

  const trimmed = term.trim();
  const suggestions = answer.term === trimmed ? answer.items : [];

  useEffect(() => {
    const buscado = term.trim();
    if (buscado.length < 2) return;

    const timer = setTimeout(async () => {
      const items = await sugerirProductos(buscado).catch(() => []);
      setAnswer({ term: buscado, items });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  const irABuscar = (): void => {
    if (trimmed.length < 2) return;
    setOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      role="search"
      className={className}
      action="/buscar"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        irABuscar();
      }}
    >
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          name="q"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // `blur` con delay: el clic en una sugerencia dispara primero el
          // blur del input, y sin la espera la lista se cierra antes de que
          // el clic llegue a destino.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={TEXTOS.header.buscarPlaceholder}
          aria-label={TEXTOS.header.buscarLabel}
          aria-controls={listId}
          aria-expanded={open && suggestions.length > 0}
          autoComplete="off"
          className="pl-9"
        />

        {open && suggestions.length > 0 ? (
          <ul
            id={listId}
            className="border-border bg-background absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-xl border shadow-lg"
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion.slug}>
                <button
                  type="button"
                  className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                  onMouseDown={(event) => {
                    // `mousedown` y no `click`: el blur del input llega
                    // primero y el click nunca se dispara.
                    event.preventDefault();
                    setOpen(false);
                    router.push(`/producto/${suggestion.slug}`);
                  }}
                >
                  <span className="line-clamp-1">{suggestion.name}</span>
                  {suggestion.brand ? (
                    <span className="text-muted-foreground text-xs">{suggestion.brand}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
