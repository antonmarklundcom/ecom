import {
  MODO_VENTA_POR_DEFECTO,
  saleModeEfectivo,
  type ModoVenta,
  type SaleMode,
} from "./modo-venta";

/**
 * La disponibilidad que se le dice a la compradora y a Google
 * (fable/plan-trafico.md §2.4). **Una** función decide, en el servidor; la
 * línea visible de la ficha y el `Offer` del JSON-LD reciben su resultado y
 * ninguno la recalcula (`tests/unit/disponibilidad.test.ts`).
 *
 * Las reglas, en orden:
 *
 * 1. Stock propio disponible > 0 → `en_stock`.
 * 2. `enquiry` (por columna, o `stock` en modo consulta) → `por_encargo`,
 *    salvo que el panel maneje proveedores y la oferta preferida de la
 *    variante tenga stock > 0 mirado en los últimos 7 días → `en_stock`.
 * 3. `stock` sin nada disponible → `agotado` (como siempre).
 * 4. `showcase` → `null`: no se publica disponibilidad.
 *
 * Lo único que sale de acá es la palabra. Ningún dato del proveedor (quién,
 * cuánto cuesta, cuánto tiene, cuándo se miró) llega a la página:
 * `disponibilidad-proveedor.ts` lo lee y esto lo reduce a la palabra antes de
 * devolver. Este módulo es puro (sin base): lo importa `src/lib/seo.ts`.
 */

export const DISPONIBILIDADES = ["en_stock", "por_encargo", "agotado"] as const;
export type Disponibilidad = (typeof DISPONIBILIDADES)[number];

/** Cuánto vale lo que un proveedor dijo tener: una semana. */
export const VIGENCIA_STOCK_EXTERNO_DIAS = 7;
const VIGENCIA_MS = VIGENCIA_STOCK_EXTERNO_DIAS * 24 * 60 * 60 * 1000;

/** Lo que el proveedor dijo de una variante, ya leído de la base. */
export type StockExterno = {
  stock: number | null;
  miradoEl: Date | null;
};

/** ¿Este dato de proveedor alcanza para decir "en stock" hoy? */
export function stockExternoVigente(
  dato: StockExterno | null | undefined,
  ahora: Date
): boolean {
  if (!dato || dato.stock === null || dato.stock <= 0 || !dato.miradoEl)
    return false;
  const edad = ahora.getTime() - dato.miradoEl.getTime();
  // Una fecha futura (reloj mal puesto al cargarla) no es "recién mirado".
  return edad >= 0 && edad <= VIGENCIA_MS;
}

/** **La** regla, para una variante. Pura. */
export function disponibilidad(input: {
  saleMode?: SaleMode;
  modo?: ModoVenta;
  /** El stock propio disponible (on hand − reservado), como lo da la vidriera. */
  disponible: number;
  /** El dato del proveedor de esta variante, sólo con `proveedores` prendido. */
  externo?: StockExterno | null;
  ahora?: Date;
}): Disponibilidad | null {
  const efectivo =
    saleModeEfectivo(input.saleMode, input.modo ?? MODO_VENTA_POR_DEFECTO) ??
    "stock";
  if (efectivo === "showcase") return null;
  if (input.disponible > 0) return "en_stock";
  if (efectivo === "enquiry")
    return stockExternoVigente(input.externo, input.ahora ?? new Date())
      ? "en_stock"
      : "por_encargo";
  return "agotado";
}

/**
 * El resumen del producto: `en_stock` si alguna variante lo está, si no
 * `por_encargo` si alguna lo está, si no `agotado`. `null` sin variantes con
 * disponibilidad (vitrina, o un producto sin variantes).
 */
export function resumenDisponibilidad(
  porVariante: readonly (Disponibilidad | null)[]
): Disponibilidad | null {
  for (const palabra of DISPONIBILIDADES)
    if (porVariante.includes(palabra)) return palabra;
  return null;
}

/** El vocabulario de schema.org de cada palabra. */
export const SCHEMA_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  en_stock: "https://schema.org/InStock",
  por_encargo: "https://schema.org/BackOrder",
  agotado: "https://schema.org/OutOfStock",
};

export type DisponibilidadDelProducto = {
  /** Por SKU: lo que recibe `productJsonLd` y la línea de cada variante. */
  porSku: Record<string, Disponibilidad | null>;
  /** El resumen (`resumenDisponibilidad`). */
  producto: Disponibilidad | null;
};

/**
 * La disponibilidad de cada variante de un producto, y el resumen. Pura: el
 * dato de proveedor ya viene leído (`externos`, por id de variante; vacío con
 * `proveedores` apagado). Lo lee `disponibilidadDelProducto` de
 * `src/domain/disponibilidad-proveedor.ts`.
 */
export function disponibilidadPorVariante(
  product: {
    saleMode?: SaleMode;
    variants: readonly { id: number; sku: string; available: number }[];
  },
  opciones: {
    modo: ModoVenta;
    externos?: ReadonlyMap<number, StockExterno>;
    ahora?: Date;
  }
): DisponibilidadDelProducto {
  const ahora = opciones.ahora ?? new Date();
  const porSku: Record<string, Disponibilidad | null> = {};
  for (const variant of product.variants) {
    porSku[variant.sku] = disponibilidad({
      saleMode: product.saleMode,
      modo: opciones.modo,
      disponible: variant.available,
      externo: opciones.externos?.get(variant.id) ?? null,
      ahora,
    });
  }
  return { porSku, producto: resumenDisponibilidad(Object.values(porSku)) };
}
