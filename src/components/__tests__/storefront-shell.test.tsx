import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontShell } from "@/components/storefront-shell";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
afterEach(cleanup);

describe("admin workspace isolation", () => {
  it("omits shopping chrome on admin and login, and remounts it when returning to the store", () => {
    const element = () => (
      <StorefrontShell
        storefrontBefore={<header>Shopping header</header>}
        storefrontAfter={<footer>Shopping footer and cart</footer>}
      >
        <main>Page</main>
      </StorefrontShell>
    );
    state.pathname = "/admin/login";
    const { rerender } = render(element());
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBeVisible();
    state.pathname = "/admin/pedidos/1";
    rerender(element());
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    state.pathname = "/producto/item";
    rerender(element());
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });
});
