import { Badge } from "@/components/ui/badge";
import { TEXTOS } from "@/i18n";

/** A partir de acá mostramos "últimas unidades" para empujar la decisión. */
export const LOW_STOCK_THRESHOLD = 5;

export function StockBadge({ available }: { available: number }) {
  if (available <= 0) {
    return <Badge variant="destructive">{TEXTOS.stock.sinStock}</Badge>;
  }
  if (available <= LOW_STOCK_THRESHOLD) {
    return (
      <Badge variant="secondary">
        {available === 1 ? TEXTOS.stock.ultimaUnidad : TEXTOS.stock.quedan(available)}
      </Badge>
    );
  }
  return <Badge variant="outline">{TEXTOS.stock.disponible}</Badge>;
}
