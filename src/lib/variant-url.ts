/** Stable SKUs identify shared selections; database IDs stay private to memory/cart. */
export function variantFromSku<T extends { sku: string; available: number }>(
  variants: readonly T[],
  sku: string | string[] | undefined | null,
  _purchasable: boolean
): T | undefined {
  void _purchasable;
  if (typeof sku !== "string" || !sku || sku.length > 191) return undefined;
  // An out-of-stock link still selects its real SKU; checkout remains disabled.
  return variants.find((variant) => variant.sku === sku);
}

export function variantUrl(url: string, sku: string): string {
  const parsed = new URL(url, "https://local.invalid");
  parsed.searchParams.set("variante", sku);
  return url.startsWith("/")
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : parsed.toString();
}
