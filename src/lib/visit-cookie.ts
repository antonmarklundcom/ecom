import { cookies } from "next/headers";

import { VISIT_COOKIE, esVisitId } from "./visit-id";

/**
 * El `visitId` de quien está pidiendo esto, o `null`.
 *
 * Vive separado de `visit-id.ts` porque aquel módulo no importa nada —lo lee
 * `src/proxy.ts`, que corre en el edge— y esto necesita `next/headers`, que
 * sólo existe del lado del servidor de la app.
 *
 * **Devuelve `null` con toda naturalidad** y quien llama tiene que estar listo
 * para eso: un bot sin cookies, alguien que las bloquea, o el primer request
 * de una sesión que llegó por un camino que el proxy no toca. Sin id no hay
 * nada que correlacionar, así que el evento simplemente no se registra — nunca
 * se inventa un id acá para "no perder el dato". Un id acuñado en el momento
 * no se le llega a mandar al navegador desde una server action, así que sería
 * un visitante nuevo por cada evento: la tabla llena de basura y el embudo
 * mintiendo hacia arriba.
 *
 * Recordatorio, porque es el error que hay que hacer imposible: esto **no
 * autoriza nada**. No va en un `WHERE` que decida qué datos ve alguien, no
 * sustituye a `currentCustomer()` y no se guarda al lado de un `customerId`.
 * El razonamiento completo está en `visit-id.ts`.
 */
export async function visitIdActual(): Promise<string | null> {
  try {
    const value = (await cookies()).get(VISIT_COOKIE)?.value;
    return esVisitId(value) ? value : null;
  } catch {
    // `cookies()` tira si se la llama en un contexto que Next considera
    // estático. La analítica no puede ser el motivo de que una página deje de
    // renderizar: sin cookie, sin evento.
    return null;
  }
}
