"use client";

import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { t } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Los filtros de una categoría, plegados en el celular
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md F4). En pantallas chicas eran hasta once
 * controles abiertos antes del primer producto; ahora un botón con
 * `aria-expanded` dice cuántos hay puestos y los abre. Desde `md` se ven
 * siempre y el botón no está.
 */
export function FilterDisclosure({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="border-border hover:bg-muted flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {activeCount > 0
          ? t("filtros.mostrarConCuenta", { n: activeCount })
          : t("filtros.mostrar")}
      </button>
      <div id={panelId} className={cn(open ? "mt-3" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
