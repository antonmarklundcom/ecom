import type { UserRole } from "@/db/schema";
import { EDITORIAL_TOOLS } from "@/config/editorial-tools";
import { t } from "@/i18n";
import { can, type Capability } from "@/lib/permissions";

export const ADMIN_MENU = [
  ["resumen", "/admin", "dashboard", "LayoutDashboard"],
  ["pedidos", "/admin/pedidos", "pedidos.ver", "ShoppingBag"],
  ["productos", "/admin/productos", "productos", "Package"],
  ["resenas", "/admin/resenas", "resenas", "Star"],
  ["devoluciones", "/admin/devoluciones", "devoluciones", "RotateCcw"],
  ["clientes", "/admin/clientes", "clientes", "Contact"],
  ["cupones", "/admin/cupones", "cupones", "Ticket"],
  ["actividad", "/admin/actividad", "actividad", "Activity"],
  ["categorias", "/admin/categorias", "categorias", "Tags"],
  ["envios", "/admin/envios", "envios", "Truck"],
  ["banco", "/admin/banco", "banco", "Landmark"],
  ["ajustes", "/admin/ajustes", "ajustes", "Settings"],
  ["integraciones", "/admin/integraciones", "integraciones", "Plug"],
  ["usuarios", "/admin/usuarios", "usuarios", "Users"],
  ["guia", "/admin/guia", "usuarios", "BookOpen"],
  ["seo", "/admin/seo", "usuarios", "BookOpen"],
] as const satisfies readonly (readonly [string, string, Capability, string])[];

export type AdminNavigationItem = {
  id: (typeof ADMIN_MENU)[number][0];
  href: string;
  label: string;
  icon: (typeof ADMIN_MENU)[number][3];
  count?: number;
};

/** Called on the server: unauthorized destinations never enter client props. */
export function getAdminNavigationItems(
  role: UserRole,
  pendingReviews = 0
): AdminNavigationItem[] {
  const labels = {
    resumen: t("panel.nav.resumen"),
    pedidos: t("panel.nav.pedidos"),
    productos: t("panel.nav.productos"),
    resenas: t("panel.nav.resenas"),
    devoluciones: t("panel.nav.devoluciones"),
    clientes: t("panel.nav.clientes"),
    cupones: t("panel.nav.cupones"),
    actividad: t("panel.nav.actividad"),
    categorias: t("panel.nav.categorias"),
    envios: t("panel.nav.envios"),
    banco: t("panel.nav.banco"),
    ajustes: t("panel.nav.ajustes"),
    integraciones: t("panel.nav.integraciones"),
    usuarios: t("panel.nav.usuarios"),
    guia: t("panel.nav.guia"),
    seo: "Plan editorial y SEO",
  };
  return ADMIN_MENU.filter(
    ([id, , capability]) =>
      can(role, capability) && (id !== "seo" || EDITORIAL_TOOLS.enabled)
  ).map(([id, href, , icon]) => ({
    id,
    href,
    icon,
    label: labels[id],
    ...(id === "resenas" &&
    Number.isSafeInteger(pendingReviews) &&
    pendingReviews > 0
      ? { count: pendingReviews }
      : {}),
  }));
}

export function adminMenuStorageKey(userId: number): string {
  return `admin-menu:v1:${userId}`;
}

/** Only supplied IDs survive; duplicates are removed and new items append. */
export function normalizeAdminOrder(
  value: unknown,
  allowedIds: readonly string[]
): string[] {
  const allowed = new Set(allowedIds);
  const saved = Array.isArray(value)
    ? value.filter(
        (id): id is string => typeof id === "string" && allowed.has(id)
      )
    : [];
  return [...new Set([...saved, ...allowedIds])];
}

export function parseAdminOrder(
  raw: string | null,
  allowedIds: readonly string[]
): string[] {
  try {
    return normalizeAdminOrder(raw ? JSON.parse(raw) : null, allowedIds);
  } catch {
    return [...allowedIds];
  }
}

export function isAdminSectionActive(pathname: string, href: string): boolean {
  if (href === "/admin")
    return (
      pathname === "/admin" ||
      pathname === "/admin/" ||
      pathname === "/admin/bienvenida"
    );
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function moveAdminItem(
  order: readonly string[],
  id: string,
  target: number
): string[] {
  const index = order.indexOf(id);
  if (index < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}
