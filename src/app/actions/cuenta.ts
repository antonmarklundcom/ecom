"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cuentasClientesHabilitadas } from "@/config/tienda";
import {
  CustomerError,
  authenticateCustomer,
  claimGuestOrder,
  registerCustomer,
  updateCustomerProfile,
} from "@/domain/customers";
import {
  destroyCustomerSession,
  getCustomerSession,
  requireCustomerSession,
} from "@/lib/customer-session";
import {
  CUSTOMER_LOGIN_LIMIT,
  CUSTOMER_LOGIN_WINDOW_MS,
  CUSTOMER_REGISTER_LIMIT,
  CUSTOMER_REGISTER_WINDOW_MS,
  clientIp,
  rateLimit,
  resetRateLimitKey,
} from "@/lib/rate-limit";
import { MIN_PASSWORD_LENGTH, validatePasswordStrength } from "@/lib/password";

/**
 * Acciones de las cuentas de cliente (PLAN.md FASE 2, PR E).
 *
 * Cuatro reglas para todo el archivo:
 *
 * 1. **La primera línea es siempre el flag.** Con `TIENDA.cuentasClientes` en
 *    false estas acciones no existen para nadie. Las páginas devuelven 404,
 *    pero una server action es un endpoint HTTP con su propio id y se la puede
 *    invocar sin pasar por ninguna URL — exactamente el mismo razonamiento que
 *    los guards de `/admin`. Hay un test de CI que verifica que todas empiecen
 *    por acá.
 * 2. **Nada de esto toca el panel.** Cookie propia, secreto propio, tabla
 *    propia (guardarraíl 4 del plan).
 * 3. **El error de login no distingue.** "No existe", "contraseña incorrecta"
 *    y "cuenta desactivada" son el mismo mensaje.
 * 4. **El checkout de invitado no se toca.** Nada de acá es requisito para
 *    comprar.
 */

/** Lo que devuelve la feature apagada. Nunca dice que existe algo apagado. */
const APAGADO = { ok: false as const, error: "No encontramos esa página." };

/** Un único mensaje para los tres motivos de fallo del login. */
const GENERIC_LOGIN_ERROR = "WhatsApp/email o contraseña incorrectos.";

export type CuentaResult = { ok: true } | { ok: false; error: string };

const RegisterSchema = z.object({
  phone: z.string().trim().min(6, "Falta tu WhatsApp").max(30),
  name: z.string().trim().min(3, "Poné tu nombre completo").max(160),
  email: z.union([z.literal(""), z.email("Revisá el email").max(200)]).optional(),
  password: z.string().min(1, "Elegí una contraseña").max(200),
  marketingOptIn: z.boolean().optional(),
});

export async function registrarCliente(input: unknown): Promise<CuentaResult> {
  if (!cuentasClientesHabilitadas()) return APAGADO;

  const ip = clientIp(await headers());
  if (
    !rateLimit(`cuenta:registro:${ip}`, {
      limit: CUSTOMER_REGISTER_LIMIT,
      windowMs: CUSTOMER_REGISTER_WINDOW_MS,
    }).ok
  ) {
    return { ok: false, error: "Demasiados intentos seguidos. Probá más tarde." };
  }

  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const strength = validatePasswordStrength(parsed.data.password);
  if (!strength.ok) {
    return {
      ok: false,
      error: strength.reason ?? `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }

  try {
    const customer = await registerCustomer({
      phone: parsed.data.phone,
      password: parsed.data.password,
      name: parsed.data.name,
      email: parsed.data.email || null,
      marketingOptIn: parsed.data.marketingOptIn,
    });

    await abrirSesion(customer.id, customer.phone, customer.name);
    return { ok: true };
  } catch (error) {
    if (error instanceof CustomerError) return { ok: false, error: error.message };
    console.error("registrarCliente falló", error);
    return { ok: false, error: "No pudimos crear la cuenta. Probá de nuevo." };
  }
}

const LoginSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function entrarCliente(input: unknown): Promise<CuentaResult> {
  if (!cuentasClientesHabilitadas()) return APAGADO;

  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_LOGIN_ERROR };

  // Por IP **y** por identificador, como el login del panel: el atacante rota
  // una de las dos cosas por separado.
  const ip = clientIp(await headers());
  const identifier = parsed.data.identifier.toLowerCase();
  const options = { limit: CUSTOMER_LOGIN_LIMIT, windowMs: CUSTOMER_LOGIN_WINDOW_MS };
  const byIp = rateLimit(`cuenta:login:ip:${ip}`, options);
  const byId = rateLimit(`cuenta:login:id:${identifier}`, options);

  if (!byIp.ok || !byId.ok) {
    const minutes = Math.ceil(Math.max(byIp.retryAfterSeconds, byId.retryAfterSeconds) / 60);
    return {
      ok: false,
      error: `Demasiados intentos. Probá de nuevo en ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
    };
  }

  try {
    const customer = await authenticateCustomer(parsed.data.identifier, parsed.data.password);
    if (!customer) return { ok: false, error: GENERIC_LOGIN_ERROR };

    // Quien probó dos contraseñas y acertó no tiene por qué quedar a un
    // intento del bloqueo.
    resetRateLimitKey(`cuenta:login:ip:${ip}`);
    resetRateLimitKey(`cuenta:login:id:${identifier}`);

    await abrirSesion(customer.id, customer.phone, customer.name);
    return { ok: true };
  } catch (error) {
    console.error("entrarCliente falló", error);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
}

export async function salirCliente(): Promise<CuentaResult> {
  if (!cuentasClientesHabilitadas()) return APAGADO;

  await destroyCustomerSession();
  return { ok: true };
}

const PerfilSchema = z.object({
  name: z.string().trim().min(3, "Poné tu nombre completo").max(160),
  email: z.union([z.literal(""), z.email("Revisá el email").max(200)]).optional(),
  marketingOptIn: z.boolean(),
});

export async function guardarPerfil(input: unknown): Promise<CuentaResult> {
  if (!cuentasClientesHabilitadas()) return APAGADO;

  try {
    // El guard antes de mirar la entrada, igual que en `/admin`.
    const actor = await requireCustomerSession();

    const parsed = PerfilSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    await updateCustomerProfile(actor.customerId, {
      name: parsed.data.name,
      email: parsed.data.email || null,
      marketingOptIn: parsed.data.marketingOptIn,
    });

    // El nombre se muestra desde la sesión: si no se refresca acá, el header
    // sigue saludando con el anterior hasta el próximo login.
    const session = await getCustomerSession();
    session.name = parsed.data.name.trim();
    await session.save();

    revalidatePath("/cuenta");
    return { ok: true };
  } catch (error) {
    if (error instanceof CustomerError) return { ok: false, error: error.message };
    console.error("guardarPerfil falló", error);
    return { ok: false, error: "No pudimos guardar los cambios. Probá de nuevo." };
  }
}

const ReclamarSchema = z.object({ orderNumber: z.string().trim().min(3).max(16) });

/**
 * "¿Querés guardar tus datos?" — ata un pedido de invitado recién hecho a la
 * cuenta con la que se acaba de entrar o registrar.
 *
 * El dominio sólo ata pedidos sin dueño **y** cuyo teléfono es el de la
 * cuenta, así que conocer un número de pedido ajeno no alcanza para adoptarlo.
 */
export async function reclamarPedido(input: unknown): Promise<CuentaResult> {
  if (!cuentasClientesHabilitadas()) return APAGADO;

  try {
    const actor = await requireCustomerSession();

    const parsed = ReclamarSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "No entendí de qué pedido se trata." };

    const claimed = await claimGuestOrder(actor.customerId, parsed.data.orderNumber);
    if (!claimed) {
      return { ok: false, error: "Ese pedido no se puede agregar a esta cuenta." };
    }

    revalidatePath("/cuenta");
    return { ok: true };
  } catch (error) {
    console.error("reclamarPedido falló", error);
    return { ok: false, error: "No pudimos agregar el pedido. Probá de nuevo." };
  }
}

/** Abre la sesión de cliente. No exportada: no es un endpoint. */
async function abrirSesion(customerId: number, phone: string, name: string): Promise<void> {
  const session = await getCustomerSession();
  session.customerId = customerId;
  session.phone = phone;
  session.name = name;
  await session.save();
}
