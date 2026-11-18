"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n/client";
import { atributosConsulta } from "@/lib/consulta-click";
import { TESTIDS } from "@/lib/testids";

/**
 * Barra de compra fija abajo en el celular (`/admin/ajustes` → vidriera).
 *
 * En una ficha larga —fotos, descripción, reseñas— el botón de agregar queda
 * muy arriba, y quien bajó a leer tiene que volver a buscarlo. Esta barra
 * aparece **sólo** cuando ese bloque salió de la pantalla
 * (`IntersectionObserver`), y su botón no compra nada: lleva de vuelta al
 * bloque y le pone el foco. Elegir la variante y agregar al carrito siguen
 * pasando en un solo lugar (`add-to-cart.tsx`); duplicar esa lógica acá sería
 * tener dos carritos que se pueden desincronizar.
 *
 * Mientras está a la vista marca `<body data-barra-compra>`: `globals.css`
 * sube el botón flotante de WhatsApp para que la barra no lo tape.
 *
 * `md:hidden`: en pantallas grandes el bloque de compra está siempre cerca.
 *
 * **Modo consulta** (`consulta`, fable/plan-trafico.md §5.1): la ficha tiene
 * una sola acción, consultar por WhatsApp, y la barra es ese botón. El link
 * es el de la variante elegida (`?variante=<sku>`, lo escribe
 * `add-to-cart.tsx`), armado en el servidor por `product-inquiries.ts`; sin
 * variante en la URL, el de la que la ficha muestra por defecto.
 */
export function StickyBuyBar({
  targetId,
  name,
  price,
  consulta = null,
  productId,
}: {
  /** El `id` del bloque de agregar al carrito de la ficha. */
  targetId: string;
  name: string;
  /** Ya formateado (`₲ 185.000`) por el servidor. */
  price: string | null;
  /** Links de WhatsApp por SKU, y el de la variante por defecto. */
  consulta?: { porSku: Record<string, string>; porDefecto: string } | null;
  /** Para contar el clic de consulta (O33, `src/lib/consulta-click.ts`). */
  productId?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(!entry.isIntersecting);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  useEffect(() => {
    if (!visible) return;
    document.body.setAttribute("data-barra-compra", "");
    return () => document.body.removeAttribute("data-barra-compra");
  }, [visible]);

  if (!visible) return null;

  const irAlBloque = (): void => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const foco = target.querySelector<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])"
    );
    foco?.focus({ preventScroll: true });
  };

  if (consulta) {
    const linkElegido = (): string => {
      const sku = new URLSearchParams(window.location.search).get("variante");
      return (sku && consulta.porSku[sku]) || consulta.porDefecto;
    };
    return (
      <div
        role="region"
        aria-label={t("producto.barraCompra.consultaLabel")}
        className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur md:hidden"
      >
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
          <Button asChild>
            <a
              href={consulta.porDefecto}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={TESTIDS.stickyInquiryLink}
              {...atributosConsulta("producto", { productId })}
              onClick={(event) => {
                event.currentTarget.href = linkElegido();
              }}
            >
              {t("producto.consultarWhatsApp")}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={t("producto.barraCompra.label")}
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur md:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {price ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {price}
            </p>
          ) : null}
        </div>
        <Button type="button" onClick={irAlBloque}>
          {t("producto.barraCompra.boton")}
        </Button>
      </div>
    </div>
  );
}
