import { describe, expect, it } from "vitest";
import {
  adminMenuStorageKey,
  getAdminNavigationItems,
  isAdminSectionActive,
  moveAdminItem,
  normalizeAdminOrder,
  parseAdminOrder,
} from "@/lib/admin-navigation";

describe("admin menu authorization and stored ordering", () => {
  it("supplies only permitted destinations for each role", () => {
    expect(
      getAdminNavigationItems("vendedor").map((item) => item.href)
    ).toEqual(["/admin/pedidos"]);
    const staff = getAdminNavigationItems("staff").map((item) => item.id);
    expect(staff).toContain("productos");
    expect(staff).not.toContain("usuarios");
    expect(staff).not.toContain("guia");
    expect(getAdminNavigationItems("owner").map((item) => item.id)).toContain(
      "guia"
    );
  });
  it("stored data cannot add unauthorized destinations or duplicate entries", () => {
    expect(
      normalizeAdminOrder(
        ["usuarios", "pedidos", "pedidos", {}, "productos"],
        ["productos", "pedidos", "resenas"]
      )
    ).toEqual(["pedidos", "productos", "resenas"]);
    expect(parseAdminOrder('{"href":"/admin/usuarios"}', ["pedidos"])).toEqual([
      "pedidos",
    ]);
    expect(parseAdminOrder("broken JSON", ["pedidos"])).toEqual(["pedidos"]);
    expect(parseAdminOrder(null, ["pedidos"])).toEqual(["pedidos"]);
  });
  it("isolates account preferences and appends newly permitted items", () => {
    expect(adminMenuStorageKey(1)).not.toBe(adminMenuStorageKey(2));
    expect(
      parseAdminOrder('["pedidos"]', ["resumen", "pedidos", "guia"])
    ).toEqual(["pedidos", "resumen", "guia"]);
  });
  it("highlights descendants without matching similarly named sections", () => {
    expect(isAdminSectionActive("/admin/productos/4", "/admin/productos")).toBe(
      true
    );
    expect(
      isAdminSectionActive("/admin/productos-extra", "/admin/productos")
    ).toBe(false);
    expect(isAdminSectionActive("/admin/productos", "/admin")).toBe(false);
    expect(isAdminSectionActive("/admin/bienvenida", "/admin")).toBe(true);
  });
  it("preserves the original order on invalid moves", () => {
    const order = ["a", "b", "c"];
    expect(moveAdminItem(order, "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveAdminItem(order, "b", -1)).toEqual(order);
    expect(moveAdminItem(order, "unknown", 1)).toEqual(order);
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("shows a pending review count only for a valid positive integer", () => {
    expect(
      getAdminNavigationItems("owner", 3).find((item) => item.id === "resenas")
        ?.count
    ).toBe(3);
    expect(
      getAdminNavigationItems("owner", -3).find((item) => item.id === "resenas")
        ?.count
    ).toBeUndefined();
    expect(
      getAdminNavigationItems("vendedor", 3).some((item) => item.count)
    ).toBe(false);
  });
});
