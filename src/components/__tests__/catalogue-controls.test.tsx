import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewPasswordFields } from "@/components/ui/new-password-fields";
import { ProductGallery } from "@/components/product-gallery";
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // The next/image mock deliberately renders a plain image in jsdom.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));
afterEach(cleanup);
describe("accessible reusable controls", () => {
  it("validates both password inputs and toggles visibility independently", () => {
    render(
      <form>
        <NewPasswordFields id="test-password" label="Contraseña" />
      </form>
    );
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    const confirmation = screen.getByLabelText(
      "Repetí la contraseña"
    ) as HTMLInputElement;
    fireEvent.input(password, { target: { value: "Strong-password-123" } });
    fireEvent.input(confirmation, { target: { value: "Wrong-password-123" } });
    expect(confirmation.checkValidity()).toBe(false);
    fireEvent.input(confirmation, { target: { value: "Strong-password-123" } });
    expect(confirmation.checkValidity()).toBe(true);
    const toggles = screen.getAllByRole("button");
    fireEvent.click(toggles[0]!);
    expect(password.type).toBe("text");
    expect(confirmation.type).toBe("password");
    fireEvent.click(toggles[1]!);
    expect(confirmation.type).toBe("text");
  });
  it("selects thumbnails, navigates zoom by keyboard and closes with Escape", () => {
    render(
      <ProductGallery
        images={[
          { src: "/one.png", alt: "Vista frontal" },
          { src: "/two.png", alt: "Vista lateral", illustrative: true },
        ]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ver imagen 2: Vista lateral" })
    );
    expect(screen.getByText(/Imagen ilustrativa para preparar/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Ampliar imagen 2: Vista lateral" })
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("Imagen 1 de 2")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
