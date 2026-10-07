import { t, type MessageKey } from "@/i18n";
import { can, type Capability } from "@/lib/permissions";
import type { UserRole } from "@/lib/roles";
import { TESTIDS } from "@/lib/testids";
import { EDITORIAL_TOOLS } from "@/config/editorial-tools";

const sections = [
  ["/admin", "dashboard", "panel.nav.resumen", "dashboard"],
  ["/admin/pedidos", "pedidos.ver", "panel.nav.pedidos", "orders"],
  ["/admin/productos", "productos", "panel.nav.productos", "products"],
  ["/admin/resenas", "resenas", "panel.nav.resenas", "reviews"],
  ["/admin/devoluciones", "devoluciones", "panel.nav.devoluciones", "returns"],
  ["/admin/clientes", "clientes", "panel.nav.clientes", "customers"],
  ["/admin/cupones", "cupones", "panel.nav.cupones", "coupons"],
  ["/admin/actividad", "actividad", "panel.nav.actividad", "activity"],
  ["/admin/categorias", "categorias", "panel.nav.categorias", "categories"],
  ["/admin/envios", "envios", "panel.nav.envios", "shipping"],
  ["/admin/banco", "banco", "panel.nav.banco", "bank"],
  ["/admin/ajustes", "ajustes", "panel.nav.ajustes", "settings"],
  [
    "/admin/integraciones",
    "integraciones",
    "panel.nav.integraciones",
    "integrations",
  ],
  ["/admin/usuarios", "usuarios", "panel.nav.usuarios", "users"],
  ["/admin/guia", "usuarios", "panel.nav.guia", "guide"],
  ["/admin/seo", "usuarios", "panel.nav.seo", "guide"],
] as const satisfies readonly (readonly [
  string,
  Capability,
  MessageKey,
  string,
])[];

export type AdminMenuItem = {
  href: string;
  label: string;
  icon: (typeof sections)[number][3];
  testId?: string;
};

/** Filter on the server before serializing the menu; page/action guards remain authoritative. */
export function adminMenuFor(
  role: UserRole,
  pendingReviews = 0
): AdminMenuItem[] {
  return sections
    .filter(
      ([href, capability]) =>
        can(role, capability) &&
        (href !== "/admin/seo" || EDITORIAL_TOOLS.enabled)
    )
    .map(([href, , label, icon]) => ({
      href,
      label:
        href === "/admin/resenas" &&
        Number.isSafeInteger(pendingReviews) &&
        pendingReviews > 0
          ? t("panel.nav.resenasPendientes", { n: pendingReviews })
          : t(label),
      icon,
      ...(href === "/admin/pedidos" ? { testId: TESTIDS.adminNavOrders } : {}),
    }));
}

export function isActiveAdminSection(
  pathname: string | null,
  href: string
): boolean {
  return (
    pathname === href ||
    (href === "/admin" && pathname === "/admin/bienvenida") ||
    (href !== "/admin" && Boolean(pathname?.startsWith(`${href}/`)))
  );
}

/** Ignore stale/unknown/duplicate entries; new and newly permitted sections stay discoverable. */
export function orderedAdminMenu(
  items: AdminMenuItem[],
  stored: string | null
): AdminMenuItem[] {
  let order: unknown;
  try {
    order = stored ? JSON.parse(stored) : [];
  } catch {
    order = [];
  }
  if (!Array.isArray(order)) return items;
  const remaining = new Map(items.map((item) => [item.href, item]));
  const result: AdminMenuItem[] = [];
  for (const href of order) {
    if (typeof href !== "string") continue;
    const item = remaining.get(href);
    if (!item) continue;
    result.push(item);
    remaining.delete(href);
  }
  return [...result, ...remaining.values()];
}
