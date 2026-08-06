"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = term.trim();
        if (trimmed.length < 2) return;
        router.push(`/buscar?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          name="q"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar productos…"
          aria-label="Buscar productos"
          className="pl-9"
        />
      </div>
    </form>
  );
}
