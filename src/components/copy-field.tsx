"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Fila "dato + botón copiar", para la página de pago SPI/QR.
 *
 * `value` es lo que va al portapapeles (por ejemplo el monto sin separadores
 * de miles); `displayValue` es lo que se ve en pantalla si difiere de `value`.
 */
export function CopyField({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: string;
  displayValue?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No pude copiar. Copiá el dato a mano.");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-sm font-medium tabular-nums">{displayValue ?? value}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
