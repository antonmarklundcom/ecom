import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeHero } from "@/components/home-hero";
import { TIENDA } from "@/config/tienda";
import { META_BASE_IMAGENES, resetBaseImagenesForTests } from "@/lib/images";

/**
 * La portada de la home (PLAN.md FASE 2, PR O).
 *
 * Lo que se cuida acá es el guardarraíl 1 del plan —"todo lo nuevo es opcional
 * con default seguro"— aplicado a la única pieza de **piel** de la FASE 2: una
 * tienda que se actualiza y no configura nada no puede ver ningún cambio, y
 * una que sí lo configura no puede terminar con un botón que lleva a ningún
 * lado ni con un `<img>` roto porque le falta R2.
 */
describe("hero de la home", () => {
  // `globals` está apagado en vitest.config.mts, así que el auto-cleanup de
  // testing-library no se registra solo: sin esto, cada render se apila sobre
  // el anterior y `getByRole` encuentra dos títulos.
  afterEach(cleanup);

  it("el template se instala sin portada configurada", () => {
    expect(TIENDA.hero).toBeNull();
  });

  it("dibuja título, texto y botón", () => {
    render(
      <HomeHero
        hero={{
          titulo: "Verano 2026",
          texto: "Hasta 40% en toda la línea",
          cta: { label: "Ver ofertas", href: "/categoria/ofertas" },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Verano 2026" })).toBeInTheDocument();
    expect(screen.getByText("Hasta 40% en toda la línea")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver ofertas" })).toHaveAttribute(
      "href",
      "/categoria/ofertas",
    );
  });

  it("sin CTA no hay botón, y eso es una portada válida", () => {
    render(<HomeHero hero={{ titulo: "Cerrado por vacaciones" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sin base pública de R2 no dibuja ninguna imagen", () => {
    // El estado de toda tienda recién clonada: hay una referencia en el config
    // pero el entorno todavía no tiene la base pública. Tiene que salir el
    // hero de texto, nunca un rectángulo roto.
    render(
      <HomeHero
        hero={{
          titulo: "Verano 2026",
          imagen: { imageRef: "r2:p1/portada-0123456789@1200x600", alt: "Modelo en la playa" },
        }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Verano 2026" })).toBeInTheDocument();
  });

  it("con base pública dibuja un <picture> con WebP por caja y el JPEG de respaldo", () => {
    resetBaseImagenesForTests();
    document.head.innerHTML = `<meta name="${META_BASE_IMAGENES}" content="https://img.tienda.test">`;
    try {
      const { container } = render(
        <HomeHero
          hero={{
            titulo: "Verano 2026",
            imagen: { imageRef: "r2:p1/portada-0123456789@1200x600", alt: "Modelo en la playa" },
          }}
        />,
      );
      const img = screen.getByRole("img", { name: "Modelo en la playa" });
      expect(img).toHaveAttribute("src", "https://img.tienda.test/p1/portada-0123456789.jpg");
      const source = container.querySelector('picture source[type="image/webp"]');
      expect(source?.getAttribute("srcset")).toBe(
        [240, 480, 800, 1200]
          .map((box) => `https://img.tienda.test/p1/portada-0123456789-${box}.webp ${box}w`)
          .join(", "),
      );
      expect(source).toHaveAttribute("sizes", "(max-width: 1152px) 100vw, 1152px");
    } finally {
      document.head.innerHTML = "";
      resetBaseImagenesForTests();
    }
  });

  it("una referencia vieja que no es de R2 cae al hero de texto", () => {
    resetBaseImagenesForTests();
    document.head.innerHTML = `<meta name="${META_BASE_IMAGENES}" content="https://img.tienda.test">`;
    try {
      render(
        <HomeHero hero={{ titulo: "Verano", imagen: { imageRef: "portadas/verano", alt: "x" } }} />,
      );
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    } finally {
      document.head.innerHTML = "";
      resetBaseImagenesForTests();
    }
  });
});
