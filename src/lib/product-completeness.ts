import { CATALOGUE, type AttributeDefinition } from "@/config/catalogue";
import {
  publicSpecifications,
  publicVariantAttributes,
} from "./public-product-facts";
import { decoded, SupplierDetailsSchema } from "./product-attributes";

type Input = {
  name: string;
  description?: string | null;
  specifications?: unknown;
  supplierDetails?: unknown;
  saleMode?: string;
  showPrice?: boolean;
  images: readonly { cloudinaryId: string; alt?: string | null }[];
  variants: readonly {
    pricePyg: number;
    available: number;
    attributes?: unknown;
    isActive?: boolean;
  }[];
};
/** Advisory only. Never called by publication, order or payment authorization. */
export function productCompleteness(
  input: Input,
  definitions: readonly AttributeDefinition[] = CATALOGUE.attributes
) {
  const facts = publicSpecifications(input.specifications);
  const sourcing = SupplierDetailsSchema.safeParse(
    decoded(input.supplierDetails)
  );
  const active = input.variants.filter((variant) => variant.isActive !== false);
  const checks = [
    {
      id: "facts",
      label: "Hechos confirmados",
      complete: Boolean(
        facts && (facts.unit || Object.keys(facts.values ?? {}).length)
      ),
    },
    {
      id: "description",
      label: "Nombre y descripción propios",
      complete: Boolean(input.name.trim() && input.description?.trim()),
    },
    {
      id: "unit",
      label: "Unidad de venta confirmada",
      complete: Boolean(facts?.unit),
    },
    { id: "variants", label: "Variantes activas", complete: active.length > 0 },
    {
      id: "images",
      label: "Fotografías propias o autorizadas",
      complete:
        input.images.length > 0 &&
        sourcing.success &&
        Boolean(sourcing.data.verifiedAt) &&
        ["owned-photo", "supplier-authorized"].includes(
          sourcing.data.imageProvenance ?? ""
        ),
    },
    {
      id: "alt",
      label: "Texto alternativo descriptivo",
      complete:
        input.images.length > 0 &&
        input.images.every((image) => Boolean(image.alt?.trim())),
    },
    {
      id: "price",
      label: "Precios enteros positivos (venta con stock)",
      complete:
        (input.saleMode !== "stock" && input.saleMode !== undefined) ||
        (active.length > 0 &&
          active.every(
            (variant) =>
              Number.isSafeInteger(variant.pricePyg) && variant.pricePyg > 0
          )),
    },
    {
      id: "availability",
      label: "Disponibilidad registrada (cero significa agotado)",
      complete:
        active.length > 0 &&
        active.every(
          (variant) =>
            Number.isSafeInteger(variant.available) && variant.available >= 0
        ),
    },
    ...definitions
      .filter((definition) => definition.requiredForCompleteness)
      .map((definition) => ({
        id: `attribute.${definition.key}`,
        label: definition.label,
        complete:
          definition.scope === "product"
            ? facts?.values?.[definition.key] !== undefined
            : active.length > 0 &&
              active.every(
                (variant) =>
                  publicVariantAttributes(variant.attributes)?.values?.[
                    definition.key
                  ] !== undefined
              ),
      })),
  ];
  return {
    checks,
    warning:
      "Revisión orientativa: no autoriza publicación ni compras, no verifica pagos, proveedores o entrega. Las fichas de consulta y muestra no requieren inventar precios ni stock.",
  };
}
