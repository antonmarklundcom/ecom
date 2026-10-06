import { randomBytes } from "node:crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetupForm } from "@/components/setup-form";
import { t } from "@/i18n";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fillOwner() {
  const password = randomBytes(24).toString("base64url");
  fireEvent.change(screen.getByLabelText(t("setup.secreto")), {
    target: { value: randomBytes(24).toString("hex") },
  });
  fireEvent.change(screen.getByLabelText(t("setup.email")), {
    target: { value: "owner@example.test" },
  });
  fireEvent.change(screen.getByLabelText(t("setup.password")), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(t("setup.repeatPassword")), {
    target: { value: password },
  });
}

describe("initial setup feedback", () => {
  it("blocks mismatched passwords before making a request and keeps the entered fields", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SetupForm />);
    fillOwner();
    fireEvent.change(screen.getByLabelText(t("setup.repeatPassword")), {
      target: { value: randomBytes(24).toString("hex") },
    });
    fireEvent.click(screen.getByRole("button", { name: t("setup.correr") }));
    expect(fetch).not.toHaveBeenCalled();
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(t("setup.error.passwords"));
    expect(error).toHaveFocus();
    expect(screen.getByLabelText(t("setup.email"))).toHaveValue(
      "owner@example.test"
    );
  });

  it("independently reveals and hides both password entries without submitting", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<SetupForm />);
    for (const key of ["setup.password", "setup.repeatPassword"] as const) {
      const label = t(key);
      const input = screen.getByLabelText(label);
      const reveal = screen.getByRole("button", {
        name: t("setup.showPassword", { campo: label }),
      });
      expect(input).toHaveAttribute("type", "password");
      fireEvent.click(reveal);
      expect(input).toHaveAttribute("type", "text");
      expect(reveal).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(reveal);
      expect(input).toHaveAttribute("type", "password");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("puts focused success above the cleared form and offers admin login", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pasos: { migraciones: "ok" } }),
    });
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<SetupForm />);
    fillOwner();
    fireEvent.click(screen.getByRole("button", { name: t("setup.correr") }));
    const result = await screen.findByRole("status");
    expect(result).toHaveTextContent(t("setup.listo"));
    await waitFor(() => expect(result).toHaveFocus());
    expect(
      result.compareDocumentPosition(container.querySelector("form")!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: t("setup.adminLogin") })
    ).toHaveAttribute("href", "/admin/login");
    expect(screen.getByLabelText(t("setup.secreto"))).toHaveValue("");
    expect(screen.getByLabelText(t("setup.password"))).toHaveValue("");
    expect(screen.getByLabelText(t("setup.repeatPassword"))).toHaveValue("");
    expect(screen.getByLabelText(t("setup.email"))).toHaveValue("");
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/setup/init");
    const body = JSON.parse(request.body);
    expect(body.owner.email).toBe("owner@example.test");
    expect(body).not.toHaveProperty("repeatPassword");
    expect(body.seed).toBe(false);
    expect(body.force).toBe(false);
  });

  it("keeps owner fields optional for migration-only setup and explains risky options", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    render(<SetupForm />);
    expect(screen.getByLabelText(t("setup.password"))).not.toBeRequired();
    expect(screen.getByText(t("setup.seedAyuda"))).toBeVisible();
    expect(screen.getByText(t("setup.forceAyuda"))).toBeVisible();
    fireEvent.change(screen.getByLabelText(t("setup.secreto")), {
      target: { value: randomBytes(24).toString("hex") },
    });
    fireEvent.click(screen.getByRole("button", { name: t("setup.correr") }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).not.toHaveProperty(
      "owner"
    );
    await screen.findByRole("status");
  });

  it("requires both passwords for an owner and preserves inputs on server failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "unauthorized" }),
      })
    );
    render(<SetupForm />);
    fillOwner();
    expect(screen.getByLabelText(t("setup.password"))).toBeRequired();
    expect(screen.getByLabelText(t("setup.repeatPassword"))).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: t("setup.correr") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("setup.error.secreto")
    );
    expect(screen.getByLabelText(t("setup.email"))).toHaveValue(
      "owner@example.test"
    );
    expect(
      Boolean(
        (screen.getByLabelText(t("setup.password")) as HTMLInputElement).value
      )
    ).toBe(true);
    expect(
      screen.queryByRole("link", { name: t("setup.adminLogin") })
    ).not.toBeInTheDocument();
  });
});
