import { describe, expect, it } from "vitest";
import {
  adminMenuFor,
  isActiveAdminSection,
  orderedAdminMenu,
} from "@/components/admin/menu";

describe("reusable admin navigation", () => {
  it("preserves the role matrix and pending review count", () => {
    expect(adminMenuFor("vendedor").map((item) => item.href)).toEqual([
      "/admin/pedidos",
    ]);
    const staff = adminMenuFor("staff", 3);
    expect(staff.some((item) => item.href === "/admin/productos")).toBe(true);
    expect(staff.some((item) => item.href === "/admin/usuarios")).toBe(false);
    expect(staff.some((item) => item.href === "/admin/banco")).toBe(false);
    expect(
      staff.find((item) => item.href === "/admin/resenas")?.label
    ).toContain("3");
    expect(adminMenuFor("owner")).toHaveLength(15);
    expect(
      adminMenuFor("owner").some((item) => item.href === "/admin/guia")
    ).toBe(true);
    expect(staff.some((item) => item.href === "/admin/guia")).toBe(false);
    expect(
      adminMenuFor("owner").some((item) => item.href === "/admin/seo")
    ).toBe(false);
    expect(
      adminMenuFor("owner", -3).find((item) => item.href === "/admin/resenas")
        ?.label
    ).not.toContain("-3");
  });
  it("highlights nested detail pages with a complete path boundary", () => {
    expect(
      isActiveAdminSection("/admin/pedidos/123/remito", "/admin/pedidos")
    ).toBe(true);
    expect(
      isActiveAdminSection("/admin/productos/nuevo", "/admin/productos")
    ).toBe(true);
    expect(
      isActiveAdminSection("/admin/productos-extra", "/admin/productos")
    ).toBe(false);
    expect(isActiveAdminSection("/admin/pedidos", "/admin")).toBe(false);
    expect(isActiveAdminSection("/admin", "/admin")).toBe(true);
    expect(isActiveAdminSection("/admin/bienvenida", "/admin")).toBe(true);
  });
  it("restores valid saved entries and appends new sections", () => {
    const items = adminMenuFor("owner");
    const result = orderedAdminMenu(
      items,
      JSON.stringify(["/admin/productos", "/admin/pedidos"])
    );
    expect(result.slice(0, 2).map((item) => item.href)).toEqual([
      "/admin/productos",
      "/admin/pedidos",
    ]);
    expect(result).toHaveLength(items.length);
  });
  it("cannot restore unauthorized, duplicate, malformed, or external links", () => {
    const items = adminMenuFor("vendedor");
    for (const stored of [
      null,
      "broken",
      "{}",
      JSON.stringify([
        "/admin/usuarios",
        "https://example.test",
        "/admin/pedidos",
        "/admin/pedidos",
        null,
      ]),
    ]) {
      expect(orderedAdminMenu(items, stored)).toEqual(items);
    }
  });
});
