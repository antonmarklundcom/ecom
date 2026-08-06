import { Badge } from "@/components/ui/badge";

/** A partir de acá mostramos "últimas unidades" para empujar la decisión. */
export const LOW_STOCK_THRESHOLD = 5;

export function StockBadge({ available }: { available: number }) {
  if (available <= 0) {
    return <Badge variant="destructive">Sin stock</Badge>;
  }
  if (available <= LOW_STOCK_THRESHOLD) {
    return (
      <Badge variant="secondary">
        {available === 1 ? "Última unidad" : `Quedan ${available}`}
      </Badge>
    );
  }
  return <Badge variant="outline">Disponible</Badge>;
}
