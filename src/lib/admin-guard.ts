import {
  ForbiddenError,
  UnauthorizedError,
  actorLabel,
  getSession,
  requireAdmin,
  requireOwner,
  type AdminActor,
} from "@/lib/session";

/**
 * El guard que abre **toda** server action de `/admin` (ARCH.md §1, regla 2).
 *
 * El middleware que protege `/admin/*` mira la cookie y nada más: es un
 * atajo de UX para redirigir al login, no una defensa. Las server actions son
 * endpoints HTTP con su propio id — cualquiera con ese id las puede invocar
 * con un `fetch` sin pasar jamás por una ruta `/admin`, así que el middleware
 * ni se entera. Por eso la sesión se relee y el rol se re-chequea acá adentro,
 * en cada acción, contra la cookie firmada.
 *
 * Lanza `UnauthorizedError` / `ForbiddenError`; quien llama las traduce a un
 * resultado para el formulario (ver `adminActionError`).
 */
export async function requireAdminSession(): Promise<AdminActor> {
  return requireAdmin(await getSession());
}

/** Igual, para lo que sólo puede hacer el dueño (altas de usuario, borrados). */
export async function requireOwnerSession(): Promise<AdminActor> {
  return requireOwner(await getSession());
}

/** `admin:due@tienda.py` — lo que queda escrito en `order_events.actor`. */
export { actorLabel };

/**
 * Lo que devuelve una acción de admin al formulario. `T` son los datos extra
 * del caso exitoso (`unknown` por defecto: intersectarlo no agrega nada).
 */
export type AdminActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Traduce el error de una acción de admin a algo que el formulario pueda
 * mostrar.
 *
 * Los errores de dominio (`InvalidTransitionError`, `ReceiptError`) tienen
 * mensajes escritos para el dueño y se muestran tal cual. Cualquier otra cosa
 * —un error de MySQL, un timeout de Cloudinary— sale como un mensaje genérico
 * y el detalle queda en el log del servidor: un stack trace en pantalla es una
 * filtración de la estructura interna, y al dueño no le sirve de nada.
 */
export function adminActionError(context: string, error: unknown): { ok: false; error: string } {
  if (error instanceof UnauthorizedError) {
    return { ok: false, error: "Se cerró tu sesión. Volvé a entrar." };
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error && KNOWN_DOMAIN_ERRORS.includes(error.name)) {
    return { ok: false, error: error.message };
  }
  console.error(`${context} falló`, error);
  return { ok: false, error: "No pudimos completar la acción. Probá de nuevo." };
}

const KNOWN_DOMAIN_ERRORS = [
  "InvalidTransitionError",
  "OrderNotFoundError",
  "ReceiptError",
  "InsufficientStockError",
  "StockUnavailableError",
  "PaymentRecoveryError",
  "MoneyError",
  "AdminInputError",
];
