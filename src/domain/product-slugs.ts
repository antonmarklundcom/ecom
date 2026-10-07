import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, products, productSlugRedirects } from "@/db/schema";
import { DomainError } from "./errors";
import type { Executor } from "./executor";

function conflict(slug: string): never {
  const error = new DomainError("adminError.producto.slugHistorico", { slug });
  error.name = "AdminInputError";
  throw error;
}
/** Every current and historical slug shares one unique namespace. */
export async function claimProductSlug(
  tx: Executor,
  slug: string,
  productId: number
) {
  // Upsert takes the unique-key lock even for a racing claim. Never changes ownership.
  await tx
    .insert(productSlugRedirects)
    .values({ slug, productId })
    .onDuplicateKeyUpdate({ set: { slug } });
  const [record] = await tx
    .select()
    .from(productSlugRedirects)
    .where(eq(productSlugRedirects.slug, slug))
    .limit(1)
    .for("update");
  if (record?.productId !== productId) conflict(slug);
}
export async function assertProductSlugAvailable(
  tx: Executor,
  slug: string,
  productId: number | null
) {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (product && product.id !== productId) conflict(slug);
  const [alias] = await tx
    .select()
    .from(productSlugRedirects)
    .where(eq(productSlugRedirects.slug, slug))
    .limit(1);
  // Un slug histórico es del producto que lo tuvo: otro no lo toma, pero el
  // mismo sí puede volver a él (A→B→A, docs/TEMPLATE-IMPROVEMENT-PLAN.md E5).
  // No arma una cadena: `getProductSlugRedirect` resuelve siempre directo al
  // slug actual.
  if (alias && alias.productId !== productId) conflict(slug);
}
/** Resolve straight to the current visible product: no external target or redirect chain. */
export async function getProductSlugRedirect(
  slug: string,
  executor?: Executor
): Promise<string | null> {
  const tx = executor ?? getDb();
  const [target] = await tx
    .select({ slug: products.slug })
    .from(productSlugRedirects)
    .innerJoin(products, eq(productSlugRedirects.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(productSlugRedirects.slug, slug),
        eq(products.isActive, true),
        isNotNull(products.publishedAt),
        eq(categories.isActive, true)
      )
    )
    .limit(1);
  return target && target.slug !== slug ? target.slug : null;
}
