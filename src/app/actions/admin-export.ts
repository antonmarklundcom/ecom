"use server";

import { z } from "zod";

import { ORDER_STATUSES, PAYMENT_METHODS } from "@/db/schema";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/components/admin/labels";
import { listOrdersForExport } from "@/domain/admin-orders";
import { listVariantsForExport } from "@/domain/admin-products";
import {
  adminActionError,
  requireAdminSession,
  type AdminActionResult,
} from "@/lib/admin-guard";
import { EXPORT_MAX_ROWS, csvFilename, toCsv } from "@/lib/csv";
import { formatDatePY, formatDateTimePY, parsePyDateInput, parsePyDateInputEnd } from "@/lib/py";

/**
 * Exports a CSV del panel.
 *
 * El archivo se arma **en el servidor**, con los mismos filtros que la pantalla
 * está mostrando: si se armara en el navegador con lo que hay en pantalla,
 * bajaría una página de veinte filas creyendo que bajó el listado entero.
 *
 * Igual que toda acción de `/admin`, `requireAdminSession()` es la primera
 * línea: una server action es un endpoint HTTP propio y se la puede invocar
 * sin pasar por ninguna URL `/admin` (ARCH.md §1). Acá encima el resultado es
 * la base de datos del comercio en texto plano.
 */

export type CsvExport = { csv: string; filename: string; rows: number; truncated: boolean };

const OrdersFiltersSchema = z.object({
  estado: z.enum(ORDER_STATUSES).optional(),
  metodo: z.enum(PAYMENT_METHODS).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  q: z.string().optional(),
});

export async function exportOrdersCsv(input: unknown): Promise<AdminActionResult<CsvExport>> {
  try {
    await requireAdminSession();

    const parsed = OrdersFiltersSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return { ok: false, error: "Revisá los filtros antes de bajar el archivo." };
    }

    const rows = await listOrdersForExport({
      status: parsed.data.estado,
      paymentMethod: parsed.data.metodo,
      createdFrom: parsePyDateInput(parsed.data.desde) ?? undefined,
      createdTo: parsePyDateInputEnd(parsed.data.hasta) ?? undefined,
      search: parsed.data.q,
    });

    const csv = toCsv(
      ["Nº de pedido", "Fecha", "Cliente", "WhatsApp", "Estado", "Método de pago", "Total (₲)"],
      rows.map((row) => [
        row.orderNumber,
        formatDateTimePY(row.createdAt),
        row.customerName,
        row.customerPhone,
        ORDER_STATUS_LABEL[row.status],
        PAYMENT_METHOD_LABEL[row.paymentMethod],
        // Entero pelado: la planilla lo tiene que poder sumar.
        row.totalPyg,
      ]),
    );

    return {
      ok: true,
      csv,
      filename: csvFilename("pedidos", isoDayPY()),
      rows: rows.length,
      truncated: rows.length === EXPORT_MAX_ROWS,
    };
  } catch (error) {
    return adminActionError("exportOrdersCsv", error);
  }
}

const ProductsFiltersSchema = z.object({
  categoria: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});

export async function exportProductsCsv(input: unknown): Promise<AdminActionResult<CsvExport>> {
  try {
    await requireAdminSession();

    const parsed = ProductsFiltersSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return { ok: false, error: "Revisá los filtros antes de bajar el archivo." };
    }

    const rows = await listVariantsForExport({
      search: parsed.data.q,
      categoryId: parsed.data.categoria,
    });

    const csv = toCsv(
      ["SKU", "Producto", "Categoría", "Variante", "Precio (₲)", "Stock"],
      rows.map((row) => [
        row.sku,
        row.productName,
        row.categoryName,
        row.label,
        row.pricePyg,
        row.onHand,
      ]),
    );

    return {
      ok: true,
      csv,
      filename: csvFilename("productos", isoDayPY()),
      rows: rows.length,
      truncated: rows.length === EXPORT_MAX_ROWS,
    };
  } catch (error) {
    return adminActionError("exportProductsCsv", error);
  }
}

/** `2026-08-07` en día paraguayo, para el nombre del archivo. */
function isoDayPY(): string {
  const [day, month, year] = formatDatePY(new Date()).split("/");
  return `${year}-${month}-${day}`;
}
