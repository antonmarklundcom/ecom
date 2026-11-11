import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeHero } from "@/components/home-hero";
import type { Hero } from "@/config/tienda";
import { DEFAULT_STORE_SETTINGS, heroEfectivo } from "@/domain/store-settings-schema";
import { META_BASE_IMAGENES, resetBaseImagenesForTests } from "@/lib/images";

import { pielDelTemplate } from "../../../tests/helpers/piel";

/**
 * `src/config/tienda.ts` es de cada tienda: `template:sync` nunca lo pisa. Una
 * tienda que cargó la foto del hero con el nombre de antes del cambio a R2
 * (`imagen.cloudinaryId`) tiene que seguir compilando y dibujando: con un id
 * viejo, el hero sin foto; con una referencia de R2 bajo el nombre viejo, la
 * foto.
 *
 * Los dos casos que dibujan `HomeHero` son de **piel del template**
 * (`TESTS_DE_PIEL`): una tienda que rediseñó su portada los ve "skipped".
 * `heroEfectivo` es maquinaria y corre siempre.
 */
const HERO_DEL_TEMPLATE = pielDelTemplate("src/components/home-hero.tsx");

/** El `Hero` tal como lo tiene el `tienda.ts` viejo de una tienda. */
type HeroDeTiendaVieja = Omit<Hero, "imagen"> & {
  imagen?: { cloudinaryId: string; alt: string } | null;
};

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  resetBaseImagenesForTests();
});

function conBase(): void {
  resetBaseImagenesForTests();
  document.head.innerHTML = `<meta name="${META_BASE_IMAGENES}" content="https://img.tienda.test">`;
}

describe("hero con el nombre viejo de la foto", () => {
  it.runIf(HERO_DEL_TEMPLATE)("compila con el tipo viejo y un id que no es de R2 dibuja el hero sin foto", () => {
    conBase();
    const viejo: HeroDeTiendaVieja = {
      titulo: "Verano",
      imagen: { cloudinaryId: "portadas/verano", alt: "Playa" },
    };
    // El tipo viejo entra donde la maquinaria espera un `Hero`.
    const hero: Hero = viejo;
    render(<HomeHero hero={hero} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Verano" })).toBeInTheDocument();
  });

  it.runIf(HERO_DEL_TEMPLATE)("una referencia de R2 bajo `cloudinaryId` se dibuja", () => {
    conBase();
    render(
      <HomeHero
        hero={{
          titulo: "Verano",
          imagen: { cloudinaryId: "r2:p1/portada-0123456789@1200x600", alt: "Playa" },
        }}
      />,
    );
    expect(screen.getByRole("img", { name: "Playa" })).toHaveAttribute(
      "src",
      "https://img.tienda.test/p1/portada-0123456789.jpg",
    );
  });

  it("heroEfectivo lee el nombre viejo y devuelve los dos", () => {
    const viejo: HeroDeTiendaVieja = {
      titulo: "Verano",
      imagen: { cloudinaryId: "r2:p1/portada-0123456789@1200x600", alt: "Playa" },
    };
    const efectivo = heroEfectivo({ ...DEFAULT_STORE_SETTINGS.marca, heroActivo: true }, viejo);
    expect(efectivo?.imagen).toEqual({
      imageRef: "r2:p1/portada-0123456789@1200x600",
      cloudinaryId: "r2:p1/portada-0123456789@1200x600",
      alt: "Playa",
    });
  });
});
