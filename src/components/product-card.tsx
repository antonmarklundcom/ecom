import Link from "next/link";

import { PriceTag } from "@/components/price-tag";
import { ProductImage } from "@/components/product-image";
import { StockBadge } from "@/components/stock-badge";
import type { CatalogProduct } from "@/db/queries";
import { t } from "@/i18n";

export function ProductCard({
  product,
  priority = false,
}: {
  product: CatalogProduct;
  priority?: boolean;
}) {
  // El precio "desde" es el de la variante más barata disponible; si no hay
  // ninguna con stock, igual mostramos el más barato para no dejar el card mudo.
  const inStock = product.variants.filter((variant) => variant.available > 0);
  const shown = (inStock.length > 0 ? inStock : product.variants).reduce<
    CatalogProduct["variants"][number] | undefined
  >((cheapest, variant) => (!cheapest || variant.pricePyg < cheapest.pricePyg ? variant : cheapest), undefined);

  const totalAvailable = product.variants.reduce((total, variant) => total + variant.available, 0);
  const hasVariantRange = product.variants.length > 1;

  return (
    <Link
      href={`/producto/${product.slug}`}
      className="group border-border hover:border-foreground/20 focus-visible:ring-ring flex flex-col rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <ProductImage
        image={product.image}
        alt={product.name}
        categorySlug={product.categorySlug}
        priority={priority}
      />

      <div className="mt-3 flex flex-1 flex-col gap-1">
        <p className="text-muted-foreground text-xs">{product.brand ?? product.categoryName}</p>
        <h3 className="group-hover:text-foreground line-clamp-2 text-sm font-medium">
          {product.name}
        </h3>

        <div className="mt-auto pt-2">
          {shown ? (
            <PriceTag
              pricePyg={shown.pricePyg}
              compareAtPyg={shown.compareAtPyg}
              size="sm"
            />
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <StockBadge available={totalAvailable} />
            {hasVariantRange ? (
              <span className="text-muted-foreground text-xs">
                {t("catalogo.opciones", { n: product.variants.length })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="border-border rounded-xl border p-3">
      <div className="bg-muted aspect-square animate-pulse rounded-lg" />
      <div className="mt-3 space-y-2">
        <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-4/5 animate-pulse rounded" />
        <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
      </div>
    </div>
  );
}
