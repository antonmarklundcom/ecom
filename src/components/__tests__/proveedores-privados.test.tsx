import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";
import type { CatalogProductDetail } from "@/db/queries";
import { buildProductFeed } from "@/lib/product-feed";
import { waLink } from "@/lib/py";
import { productJsonLd } from "@/lib/seo";

/**
 * Lo que dibuja la vidriera no deja pasar datos de proveedores aunque se le
 * cuelen en las props (ARCH.md § "Proveedores").
 *
 * Las consultas públicas ya no los traen (`tests/integration/supplier-offers.test.ts`);
 * esto es la segunda línea: si mañana alguien hace `{...product}` con una fila
 * entera, la tarjeta, el botón de compra, el JSON-LD y el feed siguen eligiendo
 * campo por campo. Cada marca de abajo es única para poder buscarla en la salida.
 */
const URL_PROVEEDOR = "https://proveedor-secreto.test/compra/123";
const URL_OFERTA = "https://mayorista-secreto.test/ficha/abc";
const COSTO = 987_654_321;
const NOMBRE_PROVEEDOR = "Mayorista Secreto SRL";

const MARCAS = [
  URL_PROVEEDOR,
  URL_OFERTA,
  String(COSTO),
  "987.654.321",
  NOMBRE_PROVEEDOR,
  "proveedor-secreto",
  "mayorista-secreto",
];

const privado = {
  supplierUrl: URL_PROVEEDOR,
  supplierOffers: [
    {
      id: 1,
      source: NOMBRE_PROVEEDOR,
      unitCostPyg: COSTO,
      productUrl: URL_OFERTA,
      supplierUrl: URL_OFERTA,
      supplierStock: 4242,
    },
  ],
};

/** Una ficha pública con los datos privados colgados, como si una consulta los trajera. */
function conDatosPrivados(saleMode: "stock" | "enquiry") {
  return {
    ...privado,
    id: 1,
    slug: "termo",
    name: "Termo",
    saleMode,
    showPrice: true,
    brand: null,
    ivaRate: 10,
    categorySlug: "hogar",
    categoryName: "Hogar",
    image: null,
    images: [],
    description: "Un termo.",
    variants: [
      {
        ...privado,
        unitCostPyg: COSTO,
        id: 1,
        sku: "TER-1",
        label: "Único",
        pricePyg: 150_000,
        compareAtPyg: null,
        available: 3,
      },
    ],
  } as unknown as CatalogProductDetail;
}

function sinMarcas(salida: string) {
  for (const marca of MARCAS) expect(salida).not.toContain(marca);
}

describe("la vidriera no dibuja datos de proveedores", () => {
  afterEach(cleanup);

  it("ni la tarjeta del catálogo ni el botón de compra", () => {
    const tarjeta = render(<ProductCard product={conDatosPrivados("stock")} />);
    sinMarcas(tarjeta.container.innerHTML);
    cleanup();

    const compra = render(<AddToCart product={conDatosPrivados("stock")} />);
    sinMarcas(compra.container.innerHTML);
    cleanup();

    const consulta = render(
      <AddToCart
        product={conDatosPrivados("enquiry")}
        inquiryLinks={{ 1: waLink("+595981000000", "TER-1") }}
      />
    );
    sinMarcas(consulta.container.innerHTML);
  });

  it("ni el JSON-LD de la ficha ni el feed de Merchant Center", () => {
    const producto = conDatosPrivados("stock");
    const ld = productJsonLd({
      ...producto,
      origin: new URL("https://tienda.com.py"),
      images: [],
    });
    sinMarcas(JSON.stringify(ld));

    const feed = buildProductFeed({
      origin: new URL("https://tienda.com.py"),
      tienda: { nombre: "Tienda", descripcion: "Tienda de prueba" },
      products: [
        {
          ...producto,
          description: producto.description ?? "",
          images: ["https://res.cloudinary.com/x/termo.jpg"],
        },
      ],
    });
    expect(feed).toContain("<g:id>TER-1</g:id>");
    sinMarcas(feed);
  });
});
