"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { rutaSinVisita } from "@/lib/visit-id";

const ENDPOINT = "/api/analytics/visita";

/**
 * Avisa al servidor que se dibujó una página. Vive en el layout raíz.
 *
 * Es la única pieza de la analítica que corre en el navegador, y es a
 * propósito la más chica posible: sin librería, sin estado, sin nada que
 * mirar más que la ruta. No hay ningún script de terceros en este template y
 * esto no abre la puerta para uno.
 *
 * ### Por qué hace falta un componente cliente
 *
 * Porque un pageview de una navegación del App Router no llega al servidor:
 * Next cambia de página del lado del cliente y el servidor sólo ve, a lo
 * sumo, un fetch de datos que no distingue una navegación de un prefetch. Un
 * `usePathname()` sí sabe exactamente cuándo cambió la ruta.
 *
 * La consecuencia es la limitación conocida: esto se puede bloquear y se puede
 * falsificar. Es la limitación de toda la analítica web y está aceptada por
 * escrito en `src/domain/analytics.ts` — por eso las compras y los inicios de
 * checkout **no** se miden así.
 *
 * ### `sendBeacon` primero
 *
 * `navigator.sendBeacon` encola el envío en el navegador y sobrevive a que la
 * pestaña se cierre en el mismo instante — que es justo cuando se pierde el
 * pageview que más interesa, el de la última página antes de irse. Si no
 * existe (o el navegador lo rechaza por cuota), cae en un `fetch` con
 * `keepalive`, que hace lo mismo con más pasos.
 *
 * El CSP no lo estorba: la ruta es del mismo origen y `connect-src 'self'` ya
 * la cubre (ver `src/proxy.ts`). Ningún dominio nuevo, que es la mitad del
 * punto de tener analítica propia.
 *
 * ### Lo que no manda
 *
 * Sólo la ruta, y ni siquiera con el querystring: se corta acá y **también**
 * en el servidor (`normalizarPath`), porque el que decide qué se guarda tiene
 * que ser el servidor. Nada de referrer, user-agent, resolución ni tiempos: el
 * navegador no le manda a este servidor un solo dato que el servidor no tenga
 * ya.
 */
export function VisitTracker() {
  const pathname = usePathname();
  // La última ruta reportada. En un ref y no en un estado: cambia sin que haya
  // nada nuevo que dibujar, y un `useState` acá sería un render por página.
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Mismo criterio que el proxy: el panel y el simulador no son la vidriera.
    // Está en las dos puntas porque son dos decisiones distintas —a quién se le
    // da cookie y qué se cuenta— y algún día una puede cambiar sin la otra.
    if (rutaSinVisita(pathname)) return;
    // React 18+ monta dos veces en desarrollo con StrictMode, y una navegación
    // que vuelve a la misma ruta dispara el efecto de nuevo. Sin esto, los
    // números de desarrollo salen al doble y nadie entiende por qué.
    if (ultima.current === pathname) return;
    ultima.current = pathname;

    const cuerpo = JSON.stringify({ path: pathname });

    // `text/plain` a propósito: es uno de los tipos que `sendBeacon` manda sin
    // disparar un preflight de CORS. La ruta parsea el texto a mano justamente
    // para poder aceptarlo (ver `leerPath`).
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const enviado = navigator.sendBeacon(
        ENDPOINT,
        new Blob([cuerpo], { type: "text/plain;charset=UTF-8" }),
      );
      if (enviado) return;
    }

    // El fallback. `catch` vacío y no un log: un pageview que no se pudo
    // reportar es la limitación conocida de este dato, no un error que alguien
    // tenga que ver en la consola de una compradora.
    void fetch(ENDPOINT, {
      method: "POST",
      body: cuerpo,
      keepalive: true,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    }).catch(() => {});
  }, [pathname]);

  return null;
}
