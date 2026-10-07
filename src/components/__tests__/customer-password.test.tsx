import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerPasswordForm } from "@/components/cuenta/password-form";
import { CustomerRegisterForm } from "@/components/cuenta/register-form";

/**
 * docs/TEMPLATE-IMPROVEMENT-PLAN.md F2: una contraseña nueva de la clienta se
 * escribe dos veces y se puede mostrar — como en el setup del dueño. Un error
 * de tipeo antes quedaba guardado sin aviso.
 */
const registrarCliente = vi.fn();
const guardarContrasena = vi.fn();
vi.mock("@/app/actions/cuenta", () => ({
  registrarCliente: (input: unknown) => registrarCliente(input),
  guardarContrasena: (input: unknown) => guardarContrasena(input),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each([
  ["registro", () => <CustomerRegisterForm />],
  ["cambio de contraseña", () => <CustomerPasswordForm required={false} />],
])("%s", (_nombre, dibujar) => {
  it("pide repetirla, avisa si no coincide y deja mostrarla", () => {
    render(dibujar());
    const confirmacion = screen.getByLabelText(
      "Repetí la contraseña"
    ) as HTMLInputElement;
    const password = confirmacion.form!.elements.namedItem(
      "password"
    ) as HTMLInputElement;

    fireEvent.input(password, { target: { value: "Clave-segura-123" } });
    fireEvent.input(confirmacion, { target: { value: "Clave-segura-124" } });
    expect(confirmacion.checkValidity()).toBe(false);
    fireEvent.input(confirmacion, { target: { value: "Clave-segura-123" } });
    expect(confirmacion.checkValidity()).toBe(true);

    expect(
      screen.getAllByRole("button", { name: /Mostrar contraseña/i }).length
    ).toBeGreaterThanOrEqual(2);
  });
});
