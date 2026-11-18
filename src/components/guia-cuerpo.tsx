import { renderGuia } from "@/lib/markdown-guia";
import { cn } from "@/lib/utils";

/**
 * El cuerpo de una guía, desde markdown seguro (`src/lib/markdown-guia.ts`).
 *
 * `dangerouslySetInnerHTML` con la salida de `renderGuia` **y sólo con eso**:
 * es seguro por la misma regla que `ProductDescription` — el renderer escapa
 * todo el texto del archivo antes de agregar sus propias etiquetas, así que
 * ningún carácter de la guía llega a la salida sin pasar por `escapar()`.
 *
 * Piel: la tienda estila `.guia-cuerpo` (globals.css o `custom.css`).
 */
export function GuiaCuerpo({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const html = renderGuia(markdown);
  if (!html) return null;
  return (
    <div
      className={cn("prose guia-cuerpo", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
