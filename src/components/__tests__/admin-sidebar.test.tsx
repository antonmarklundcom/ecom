import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminWorkspace } from "@/components/admin/sidebar";
import { adminMenuFor } from "@/components/admin/menu";
import { t } from "@/i18n";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/pedidos/1" }));
vi.mock("@/components/admin/logout-button", () => ({
  LogoutButton: () => <button>Logout</button>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("account menu preferences", () => {
  it("saves changes only for the current browser account and can cancel draft changes", async () => {
    const items = adminMenuFor("owner");
    const { rerender } = render(
      <AdminWorkspace userId={101} items={items}>
        Content
      </AdminWorkspace>
    );
    fireEvent.click(screen.getByRole("button", { name: t("panel.menu.edit") }));
    fireEvent.click(
      screen.getByRole("button", {
        name: t("panel.menu.up", { nombre: "Pedidos" }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: t("panel.menu.save") }));
    let nav = screen.getByRole("navigation", { name: t("panel.menu.label") });
    await waitFor(() =>
      expect(nav.querySelector("a")).toHaveAttribute("href", "/admin/pedidos")
    );
    expect(localStorage.getItem("ecom:admin-menu:v1:101")).toBeTruthy();
    rerender(
      <AdminWorkspace userId={202} items={items}>
        Content
      </AdminWorkspace>
    );
    nav = screen.getByRole("navigation", { name: t("panel.menu.label") });
    expect(nav.querySelector("a")).toHaveAttribute("href", "/admin");
    expect(localStorage.getItem("ecom:admin-menu:v1:202")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t("panel.menu.edit") }));
    fireEvent.click(
      screen.getByRole("button", {
        name: t("panel.menu.up", { nombre: "Pedidos" }),
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: t("panel.menu.cancel") })
    );
    expect(nav.querySelector("a")).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Pedidos" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
  it("keeps the workspace usable if the browser refuses preference storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    render(
      <AdminWorkspace userId={101} items={adminMenuFor("owner")}>
        Content
      </AdminWorkspace>
    );
    fireEvent.click(screen.getByRole("button", { name: t("panel.menu.edit") }));
    fireEvent.click(screen.getByRole("button", { name: t("panel.menu.save") }));
    expect(screen.getByRole("status")).toHaveTextContent(
      t("panel.menu.saveError")
    );
    expect(
      screen.getByRole("button", { name: t("panel.menu.cancel") })
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: t("panel.menu.cancel") })
    );
    expect(screen.getByRole("link", { name: "Pedidos" })).toBeVisible();
  });
});
