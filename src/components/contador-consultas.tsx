"use client";

import { useEffect } from "react";

import { CONSULTA_ENDPOINT, cuerpoDesdeLink } from "@/lib/consulta-click";
import { sendLeadEvent } from "@/lib/funnel";

/**
 * El único escuchador de los clics en "Consultar por WhatsApp" (O33,
 * `src/lib/consulta-click.ts`). Va una vez en el layout de la vidriera.
 *
 * Escucha en `document` y en fase de captura, así que ve los links de
 * cualquier componente —server o cliente, cacheado o no— que lleve
 * `data-consulta`. No toca el clic: no hay `preventDefault`, el link abre
 * `wa.me` como siempre. Si `sendBeacon` no existe, falla o lo bloquea un
 * adblocker, no pasa nada.
 */
export function ContadorConsultas() {
  useEffect(() => {
    const alClic = (event: MouseEvent) => {
      // Clic izquierdo o del medio (abrir en otra pestaña); no el derecho.
      if (event.type === "auxclick" && event.button !== 1) return;
      const objetivo = event.target;
      if (!(objetivo instanceof Element)) return;
      const link = objetivo.closest("a[data-consulta]");
      if (!link) return;
      const cuerpo = cuerpoDesdeLink(link);
      if (!cuerpo) return;
      try {
        navigator.sendBeacon?.(
          CONSULTA_ENDPOINT,
          new Blob([JSON.stringify(cuerpo)], { type: "text/plain;charset=UTF-8" })
        );
      } catch {
        // Contar nunca puede frenar la consulta.
      }
      try {
        sendLeadEvent(cuerpo.o, link.getAttribute("data-consulta-sku"));
      } catch {
        // Idem: un medidor roto no frena nada.
      }
    };
    document.addEventListener("click", alClic, true);
    document.addEventListener("auxclick", alClic, true);
    return () => {
      document.removeEventListener("click", alClic, true);
      document.removeEventListener("auxclick", alClic, true);
    };
  }, []);
  return null;
}
