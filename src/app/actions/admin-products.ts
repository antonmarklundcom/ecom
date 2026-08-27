"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addProductImage,
  adjustStock,
  createProduct,
  deleteProductImage,
  saveVariant,
  updateProduct,
} from "@/domain/admin-products";
import {
  buildCatalogImportPlan,
  ensureCatalogCategories,
  type CatalogImportPlan,
} from "@/domain/catalog-import-plan";
import { type CatalogoProducto } from "@/domain/catalog-import";
import { validateProductImage } from "@/domain/product-images";
import { CLOUDINARY_PRODUCTS_FOLDER, cloudinary } from "@/lib/cloudinary";
import { slugify } from "@/lib/slug";
import { spreadsheetToCsvText, UnsupportedSpreadsheetError } from "@/lib/spreadsheet";
import {
  actorLabel,
  adminActionError,
  requireStaffSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
import { t } from "@/i18n";

// Import directo del script de seed: mismo `upsertCatalogProducts` que usa
// `pnpm importar:productos`, no una reimplementación para el panel.
import { upsertCatalogProducts, type CatalogProductUpsert } from "../../../scripts/seed";

/**
 * Alta y edición del catálogo (PLAN.md 4.6).
 *
 * Igual que en `admin-orders.ts`: **cada** acción vuelve a chequear el rol
 * antes de tocar nada. El middleware no cubre las server actions.
 */

const ProductSchema = z.object({
  productId: z.number().int().positive().optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug va en minúsculas y con guiones: remera-azul"),
  name: z.string().trim().min(2, t("adminForm.nombreProducto")).max(200),
  description: z.string().trim().max(5000).optional(),
  categoryId: z.number().int().positive(),
  brand: z.string().trim().max(120).optional(),
  // 10 | 5 | 0 y nada más: es la tasa que después se factura.
  ivaRate: z.union([z.literal(10), z.literal(5), z.literal(0)]),
  isActive: z.boolean(),
  published: z.boolean(),
});

export async function saveProduct(
  input: unknown,
): Promise<AdminActionResult<{ productId: number }>> {
  try {
    await requireStaffSession();

    const parsed = ProductSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    const write = {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      categoryId: parsed.data.categoryId,
      brand: parsed.data.brand || null,
      ivaRate: parsed.data.ivaRate,
      isActive: parsed.data.isActive,
      published: parsed.data.published,
    };

    const productId = parsed.data.productId;
    if (productId === undefined) {
      const created = await createProduct(write);
      revalidatePath("/admin/productos");
      return { ok: true, productId: created };
    }

    await updateProduct(productId, write);
    revalidatePath("/admin/productos");
    revalidatePath(`/admin/productos/${productId}`);
    return { ok: true, productId };
  } catch (error) {
    return adminActionError("saveProduct", error);
  }
}

const VariantSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
  sku: z.string().trim().min(1, t("adminForm.sku")).max(64),
  label: z.string().trim().min(1, t("adminForm.etiquetaVariante")).max(120),
  // Enteros en guaraníes. Nada de decimales: el guaraní no tiene céntimos y un
  // float acá es el principio de un total que no cuadra.
  pricePyg: z.number().int(t("adminForm.precioEntero")).nonnegative(),
  compareAtPyg: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean(),
});

export async function saveProductVariant(input: unknown): Promise<AdminActionResult> {
  try {
    await requireStaffSession();

    const parsed = VariantSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    await saveVariant(parsed.data.productId, {
      id: parsed.data.variantId,
      sku: parsed.data.sku,
      label: parsed.data.label,
      pricePyg: parsed.data.pricePyg,
      compareAtPyg: parsed.data.compareAtPyg ?? null,
      isActive: parsed.data.isActive,
    });

    revalidatePath(`/admin/productos/${parsed.data.productId}`);
    return { ok: true };
  } catch (error) {
    return adminActionError("saveProductVariant", error);
  }
}

const AdjustSchema = z.object({
  variantId: z.number().int().positive(),
  delta: z.number().int().refine((value) => value !== 0, t("adminForm.ajusteCero")),
  // El motivo es obligatorio acá y otra vez en el dominio: este mensaje es
  // para el formulario, el del dominio es la regla real.
  reason: z.string().trim().min(4, t("adminForm.motivoAjuste")),
  productId: z.number().int().positive().optional(),
});

/** Ajuste de stock con motivo. Queda auditado en `stock_adjustments`. */
export async function adjustVariantStock(
  input: unknown,
): Promise<AdminActionResult<{ newOnHand: number }>> {
  try {
    const actor = await requireStaffSession();

    const parsed = AdjustSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
    }

    const result = await adjustStock({
      variantId: parsed.data.variantId,
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      actor: actorLabel(actor),
      actorUserId: actor.userId,
    });

    if (parsed.data.productId) revalidatePath(`/admin/productos/${parsed.data.productId}`);
    revalidatePath("/admin/productos");
    revalidatePath("/admin");
    return { ok: true, newOnHand: result.newOnHand };
  } catch (error) {
    return adminActionError("adjustVariantStock", error);
  }
}

/**
 * Subida de una foto de producto.
 *
 * Va a la carpeta pública `productos/` — al revés que los comprobantes, esto
 * tiene que servirse por CDN sin firmar. El tipo se valida por los bytes
 * antes de subir.
 */
export async function uploadProductImage(formData: FormData): Promise<AdminActionResult> {
  try {
    await requireStaffSession();

    const productId = Number(formData.get("productId"));
    if (!Number.isInteger(productId) || productId <= 0) {
      return { ok: false, error: t("adminError.productoInvalido") };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: t("adminError.elegiFoto") };
    }

    const content = Buffer.from(await file.arrayBuffer());
    const { mime } = validateProductImage({ bytes: content.byteLength, content });

    const uploaded = await cloudinary.uploader.upload(
      `data:${mime};base64,${content.toString("base64")}`,
      { folder: CLOUDINARY_PRODUCTS_FOLDER, resource_type: "image", overwrite: false },
    );

    const alt = String(formData.get("alt") ?? "").trim();
    await addProductImage({
      productId,
      cloudinaryId: uploaded.public_id,
      alt: alt === "" ? null : alt.slice(0, 255),
    });

    revalidatePath(`/admin/productos/${productId}`);
    return { ok: true };
  } catch (error) {
    return adminActionError("uploadProductImage", error);
  }
}

const RemoveImageSchema = z.object({
  imageId: z.number().int().positive(),
  productId: z.number().int().positive(),
});

export async function removeProductImage(input: unknown): Promise<AdminActionResult> {
  try {
    await requireStaffSession();

    const parsed = RemoveImageSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: t("adminError.imagenInvalida") };
    }

    // Se borra sólo la fila. El archivo queda en Cloudinary a propósito: si
    // la imagen está referenciada en otro lado, borrarla del CDN rompe esa
    // página, y el costo de una foto huérfana es despreciable.
    await deleteProductImage(parsed.data.imageId);

    revalidatePath(`/admin/productos/${parsed.data.productId}`);
    return { ok: true };
  } catch (error) {
    return adminActionError("removeProductImage", error);
  }
}

// ---------------------------------------------------------------------------
// Carga masiva por planilla (CSV/Excel) — `pnpm importar:productos` desde el
// panel.
//
// Dos acciones, no una: `previewCatalogImport` es el ensayo (cuenta y muestra
// errores, no escribe nada — el default de la CLI sin `--aplicar`) y
// `applyCatalogImport` recién escribe cuando el dueño confirma. El checkbox
// "pisar stock" es el equivalente de `--pisar-stock`: apagado por defecto,
// porque pisar en silencio el stock real de una variante que ya existe es
// justo el tipo de sorpresa que una planilla de semanas no debería poder dar.
// ---------------------------------------------------------------------------

const MAX_CATALOG_FILE_BYTES = 10 * 1024 * 1024;

export type CatalogImportSummary = {
  productosNuevos: number;
  productosActualizar: number;
  variantesNuevas: number;
  variantesActualizar: number;
  categoriasNuevas: string[];
  pisaStock: boolean;
};

export type CatalogImportPreviewResult =
  | ({ ok: true } & CatalogImportSummary)
  | { ok: false; errores: string[] };

async function readCatalogFile(
  formData: FormData,
): Promise<{ ok: true; csvText: string } | { ok: false; errores: string[] }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errores: [t("adminError.elegiArchivo")] };
  }
  if (file.size > MAX_CATALOG_FILE_BYTES) {
    return { ok: false, errores: [t("adminError.archivoGrande")] };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    return { ok: true, csvText: spreadsheetToCsvText(file.name, bytes) };
  } catch (error) {
    if (error instanceof UnsupportedSpreadsheetError) {
      return { ok: false, errores: [error.message] };
    }
    throw error;
  }
}

function planSummary(plan: CatalogImportPlan, pisaStock: boolean): CatalogImportSummary {
  return {
    productosNuevos: plan.productosNuevos,
    productosActualizar: plan.productosActualizar,
    variantesNuevas: plan.variantesNuevas,
    variantesActualizar: plan.variantesActualizar,
    categoriasNuevas: plan.categoriasNuevas,
    pisaStock,
  };
}

/**
 * Ensayo: cuenta y muestra, no escribe nada. Es lo que se ve antes de
 * habilitar el botón de confirmar.
 */
export async function previewCatalogImport(formData: FormData): Promise<CatalogImportPreviewResult> {
  try {
    await requireStaffSession();

    const leido = await readCatalogFile(formData);
    if (!leido.ok) return { ok: false, errores: leido.errores };

    const pisaStock = formData.get("pisarStock") === "true";
    const plan = await buildCatalogImportPlan(leido.csvText);
    if (plan.errores.length > 0) return { ok: false, errores: plan.errores };

    return { ok: true, ...planSummary(plan, pisaStock) };
  } catch (error) {
    const result = adminActionError("previewCatalogImport", error);
    return { ok: false, errores: [result.error] };
  }
}

export type CatalogImportApplyResult =
  | ({ ok: true } & CatalogImportSummary & { variantesEscritas: number })
  | { ok: false; errores: string[] };

/**
 * Escribe. Vuelve a parsear y a chequear conflictos de SKU contra la base
 * **en este momento** — no reutiliza el plan del ensayo — porque entre la
 * vista previa y la confirmación pudo haber pasado cualquier cosa (otra
 * persona cargando productos, por ejemplo) y aplicar un plan viejo sería
 * escribir sobre un estado que ya no es el real.
 */
export async function applyCatalogImport(formData: FormData): Promise<CatalogImportApplyResult> {
  try {
    await requireStaffSession();

    const leido = await readCatalogFile(formData);
    if (!leido.ok) return { ok: false, errores: leido.errores };

    const pisaStock = formData.get("pisarStock") === "true";
    const plan = await buildCatalogImportPlan(leido.csvText);
    if (plan.errores.length > 0) return { ok: false, errores: plan.errores };

    const categoriaPorSlug = await ensureCatalogCategories(plan);

    const items: CatalogProductUpsert[] = plan.productos.map((producto: CatalogoProducto) => {
      const categoryId = categoriaPorSlug.get(slugify(producto.categoryName));
      if (!categoryId) throw new Error(`Categoría sin id: ${producto.categoryName}`);
      return {
        slug: producto.slug,
        name: producto.name,
        description: producto.description,
        categoryId,
        brand: producto.brand,
        ivaRate: producto.ivaRate,
        variants: producto.variants,
      };
    });

    const variantesEscritas = await upsertCatalogProducts(items, { resetStock: pisaStock });

    revalidatePath("/admin/productos");
    return { ok: true, ...planSummary(plan, pisaStock), variantesEscritas };
  } catch (error) {
    const result = adminActionError("applyCatalogImport", error);
    return { ok: false, errores: [result.error] };
  }
}
