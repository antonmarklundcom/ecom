import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Data model (ARCH.md §2).
 *
 * Money rule, no exceptions: every `*_pyg` column is BIGINT UNSIGNED holding
 * whole guaraníes. No DECIMAL, no FLOAT, no cents. Prices are IVA incluido.
 */

// ---------------------------------------------------------------------------
// ENUMs (TASKS.md §3)
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  'pendiente_pago',
  'esperando_verificacion',
  'pagado',
  'preparando',
  'enviado',
  'entregado',
  'rechazado',
  'vencido',
  'cancelado',
  'reembolsado',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['transferencia', 'contra_entrega', 'tarjeta'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ['spi', 'cod', 'pagopar'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RECEIPT_REVIEWS = ['pending', 'approved', 'rejected'] as const;
export type ReceiptReview = (typeof RECEIPT_REVIEWS)[number];

export const DOC_TYPES = ['RUC', 'CI', 'NINGUNO'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const USER_ROLES = ['owner', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INVOICE_STATUSES = ['none', 'queued', 'approved', 'rejected'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const RESERVATION_STATES = ['held', 'consumed', 'released'] as const;
export type ReservationState = (typeof RESERVATION_STATES)[number];

export const IVA_RATES = [10, 5, 0] as const;
export type IvaRate = (typeof IVA_RATES)[number];

/** Whole guaraníes. Never a float, never a decimal. */
const pyg = (name: string) => bigint(name, { mode: 'number', unsigned: true });

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const categories = mysqlTable(
  'categories',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    // Self-reference: declared as a plain column + FK added in post-push SQL so
    // drizzle-kit does not need a forward reference to its own table.
    parentId: int('parent_id'),
    position: int('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('categories_slug_uq').on(t.slug), index('categories_parent_idx').on(t.parentId)],
);

export const products = mysqlTable(
  'products',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    categoryId: int('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    brand: varchar('brand', { length: 120 }),
    /** 10 | 5 | 0 — IVA incluido en el precio. */
    ivaRate: tinyint('iva_rate').notNull().default(10),
    isActive: boolean('is_active').notNull().default(true),
    publishedAt: datetime('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    unique('products_slug_uq').on(t.slug),
    index('products_category_idx').on(t.categoryId),
    index('products_active_published_idx').on(t.isActive, t.publishedAt),
    // FULLTEXT(name, description) is created by scripts/post-push.ts — the
    // drizzle-kit MySQL dialect has no fulltext index builder.
  ],
);

export const productImages = mysqlTable(
  'product_images',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    cloudinaryId: varchar('cloudinary_id', { length: 255 }).notNull(),
    blurDataUrl: text('blur_data_url'),
    alt: varchar('alt', { length: 255 }),
    position: int('position').notNull().default(0),
  },
  (t) => [index('product_images_product_idx').on(t.productId, t.position)],
);

export const variants = mysqlTable(
  'variants',
  {
    id: int('id').autoincrement().primaryKey(),
    productId: int('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    sku: varchar('sku', { length: 64 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    pricePyg: pyg('price_pyg').notNull(),
    compareAtPyg: pyg('compare_at_pyg'),
    /** Physical count. Only changes when money confirms (see transitionOrder). */
    onHand: int('on_hand', { unsigned: true }).notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    position: int('position').notNull().default(0),
  },
  (t) => [unique('variants_sku_uq').on(t.sku), index('variants_product_idx').on(t.productId)],
);

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const orders = mysqlTable(
  'orders',
  {
    id: int('id').autoincrement().primaryKey(),
    orderNumber: varchar('order_number', { length: 16 }).notNull(),
    accessToken: varchar('access_token', { length: 64 }).notNull(),
    status: mysqlEnum('status', ORDER_STATUSES).notNull().default('pendiente_pago'),

    customerName: varchar('customer_name', { length: 160 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
    customerEmail: varchar('customer_email', { length: 200 }),
    docType: mysqlEnum('doc_type', DOC_TYPES).notNull().default('NINGUNO'),
    docNumber: varchar('doc_number', { length: 32 }),
    isConsumidorFinal: boolean('is_consumidor_final').notNull().default(true),

    shipCity: varchar('ship_city', { length: 120 }).notNull(),
    shipBarrio: varchar('ship_barrio', { length: 120 }),
    shipAddress: varchar('ship_address', { length: 255 }).notNull(),
    shipReference: varchar('ship_reference', { length: 255 }),
    shipMapsUrl: varchar('ship_maps_url', { length: 500 }),
    shippingZoneId: int('shipping_zone_id'),

    subtotalPyg: pyg('subtotal_pyg').notNull().default(0),
    shippingPyg: pyg('shipping_pyg').notNull().default(0),
    totalPyg: pyg('total_pyg').notNull().default(0),
    iva10Pyg: pyg('iva_10_pyg').notNull().default(0),
    iva5Pyg: pyg('iva_5_pyg').notNull().default(0),

    paymentMethod: mysqlEnum('payment_method', PAYMENT_METHODS).notNull(),
    reservedUntil: datetime('reserved_until'),

    // FASE 2 — FacturaPY. Nullable, unused in the MVP (ARCH.md §7).
    invoiceStatus: mysqlEnum('invoice_status', INVOICE_STATUSES).notNull().default('none'),
    invoiceCdc: varchar('invoice_cdc', { length: 64 }),
    invoicePdfUrl: varchar('invoice_pdf_url', { length: 500 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
    paidAt: datetime('paid_at'),
  },
  (t) => [
    unique('orders_number_uq').on(t.orderNumber),
    unique('orders_access_token_uq').on(t.accessToken),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_phone_idx').on(t.customerPhone),
    index('orders_doc_number_idx').on(t.docNumber),
    index('orders_reserved_until_idx').on(t.reservedUntil),
  ],
);

export const orderItems = mysqlTable(
  'order_items',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // RESTRICT: a variant that was ever sold cannot be deleted out from under
    // an order. The snapshots below are what the buyer actually agreed to.
    variantId: int('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    nameSnapshot: varchar('name_snapshot', { length: 255 }).notNull(),
    skuSnapshot: varchar('sku_snapshot', { length: 64 }).notNull(),
    unitPricePyg: pyg('unit_price_pyg').notNull(),
    qty: int('qty', { unsigned: true }).notNull(),
    ivaRate: tinyint('iva_rate').notNull(),
    lineTotalPyg: pyg('line_total_pyg').notNull(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_variant_idx').on(t.variantId),
  ],
);

export const payments = mysqlTable(
  'payments',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    provider: mysqlEnum('provider', PAYMENT_PROVIDERS).notNull(),
    providerRef: varchar('provider_ref', { length: 191 }).notNull(),
    amountPyg: pyg('amount_pyg').notNull(),
    status: mysqlEnum('status', PAYMENT_STATUSES).notNull().default('pending'),
    rawPayload: json('raw_payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    unique('payments_provider_ref_uq').on(t.provider, t.providerRef),
    index('payments_order_idx').on(t.orderId),
  ],
);

/** Webhook idempotency ledger — UNIQUE(provider, event_key) is the whole point. */
export const paymentEvents = mysqlTable(
  'payment_events',
  {
    id: int('id').autoincrement().primaryKey(),
    provider: mysqlEnum('provider', PAYMENT_PROVIDERS).notNull(),
    eventKey: varchar('event_key', { length: 191 }).notNull(),
    payload: json('payload'),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
  },
  (t) => [unique('payment_events_key_uq').on(t.provider, t.eventKey)],
);

export const receipts = mysqlTable(
  'receipts',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    /** Private Cloudinary folder — served to the admin via signed URLs only. */
    cloudinaryId: varchar('cloudinary_id', { length: 255 }).notNull(),
    mime: varchar('mime', { length: 100 }).notNull(),
    bytes: int('bytes', { unsigned: true }).notNull(),
    uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
    review: mysqlEnum('review', RECEIPT_REVIEWS).notNull().default('pending'),
    reviewedBy: int('reviewed_by'),
    reviewedAt: datetime('reviewed_at'),
    note: varchar('note', { length: 500 }),
  },
  (t) => [index('receipts_order_idx').on(t.orderId), index('receipts_review_idx').on(t.review)],
);

export const stockReservations = mysqlTable(
  'stock_reservations',
  {
    id: int('id').autoincrement().primaryKey(),
    variantId: int('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    qty: int('qty', { unsigned: true }).notNull(),
    expiresAt: datetime('expires_at').notNull(),
    state: mysqlEnum('state', RESERVATION_STATES).notNull().default('held'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('stock_reservations_availability_idx').on(t.variantId, t.state, t.expiresAt),
    index('stock_reservations_order_idx').on(t.orderId),
  ],
);

/**
 * Ajustes manuales de stock hechos desde el panel (PLAN.md 4.6).
 *
 * `variants.on_hand` es la única cifra física, y fuera de una venta confirmada
 * sólo la mueve el dueño. Cada movimiento deja fila acá con el motivo, el
 * actor y el antes/después: sin esto, un faltante de inventario es una
 * discusión sin registro. Append-only, igual que `order_events`.
 */
export const stockAdjustments = mysqlTable(
  'stock_adjustments',
  {
    id: int('id').autoincrement().primaryKey(),
    variantId: int('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    /** Con signo: negativo es merma, positivo es reposición. */
    delta: int('delta').notNull(),
    previousOnHand: int('previous_on_hand', { unsigned: true }).notNull(),
    newOnHand: int('new_on_hand', { unsigned: true }).notNull(),
    /** Obligatorio por diseño: un ajuste sin motivo no se puede auditar. */
    reason: varchar('reason', { length: 300 }).notNull(),
    actor: varchar('actor', { length: 120 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('stock_adjustments_variant_idx').on(t.variantId, t.createdAt)],
);

/** Append-only audit log. Written by transitionOrder() and nothing else. */
export const orderEvents = mysqlTable(
  'order_events',
  {
    id: int('id').autoincrement().primaryKey(),
    orderId: int('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    fromStatus: mysqlEnum('from_status', ORDER_STATUSES),
    toStatus: mysqlEnum('to_status', ORDER_STATUSES).notNull(),
    actor: varchar('actor', { length: 120 }).notNull(),
    reason: varchar('reason', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Admin / operación
// ---------------------------------------------------------------------------

export const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    email: varchar('email', { length: 200 }).notNull(),
    /** bcrypt. There is no public registration route — see scripts/create-owner.ts. */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 160 }),
    role: mysqlEnum('role', USER_ROLES).notNull().default('staff'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('users_email_uq').on(t.email)],
);

export const shippingZones = mysqlTable(
  'shipping_zones',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    /** Lista de ciudades PY que caen en esta zona. */
    cities: json('cities').$type<string[]>().notNull(),
    pricePyg: pyg('price_pyg').notNull(),
    /** Envío gratis a partir de este subtotal. NULL = sin umbral. */
    freeThresholdPyg: pyg('free_threshold_pyg'),
    isActive: boolean('is_active').notNull().default(true),
    position: int('position').notNull().default(0),
  },
  (t) => [unique('shipping_zones_slug_uq').on(t.slug)],
);

/**
 * Dedicated order-number counter. One row, bumped with an atomic UPDATE.
 * Never COUNT(*) — gaps are fine, collisions are not.
 */
export const counters = mysqlTable('counters', {
  name: varchar('name', { length: 64 }).primaryKey(),
  value: bigint('value', { mode: 'number', unsigned: true }).notNull().default(0),
});
