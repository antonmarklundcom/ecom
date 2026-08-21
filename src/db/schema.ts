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

/**
 * Los roles viven en `src/lib/roles.ts`, sin dependencias, y se re-exportan
 * acá para que el resto del código los siga leyendo del schema. El motivo del
 * rodeo está escrito en ese archivo: `src/proxy.ts` corre en el edge y no
 * puede arrastrar `drizzle-orm` sólo para conocer tres strings.
 */
export { USER_ROLES, type UserRole } from '../lib/roles';
// El `export ... from` de arriba re-exporta pero no trae el binding a este
// módulo, y `users.role` lo necesita como valor.
import { USER_ROLES } from '../lib/roles';

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

    /**
     * Consentimiento para novedades y promociones.
     *
     * Nullable a propósito, y son tres estados distintos: NULL es "no se le
     * preguntó" (todo pedido anterior a esta columna), `false` es "dijo que
     * no" y `true` es "aceptó". Un `NOT NULL DEFAULT false` los mezclaría, y
     * el consentimiento es justamente lo que no se puede completar después:
     * nadie puede decidir hoy qué habría contestado una compradora en marzo.
     *
     * El MVP no manda nada —no hay proveedor de mensajería en el stack— pero
     * el permiso sólo se puede pedir en el momento de la compra.
     */
    marketingOptIn: boolean('marketing_opt_in'),
    /** Cuándo contestó. Sin fecha, un "sí" no prueba nada dentro de un año. */
    marketingOptInAt: datetime('marketing_opt_in_at'),

    /**
     * Pedido para regalar. A diferencia del consentimiento, acá `false` y "no
     * contestó" son lo mismo —un pedido que nadie marcó como regalo no lo
     * es—, así que la columna es NOT NULL.
     */
    isGift: boolean('is_gift').notNull().default(false),
    /** Mensajito para la tarjeta. Sólo se guarda si `is_gift` está en true. */
    giftNote: varchar('gift_note', { length: 300 }),

    // FASE 2 — FacturaPY. Nullable, unused in the MVP (ARCH.md §7).
    invoiceStatus: mysqlEnum('invoice_status', INVOICE_STATUSES).notNull().default('none'),
    invoiceCdc: varchar('invoice_cdc', { length: 64 }),
    invoicePdfUrl: varchar('invoice_pdf_url', { length: 500 }),

    /**
     * El cupón aplicado, si hubo uno (PR G). Columna suelta con la FK en los
     * extras: `coupons` se declara después en este archivo.
     */
    couponId: int('coupon_id'),
    /**
     * El código tal como estaba al comprar. Snapshot, igual que
     * `order_items.name_snapshot`: si mañana el dueño renombra o borra el
     * cupón, este pedido tiene que seguir explicando de dónde salió su
     * descuento.
     */
    couponCode: varchar('coupon_code', { length: 40 }),
    /**
     * Lo que se descontó, en guaraníes enteros. **Siempre** se resta del
     * subtotal, nunca del envío:
     *
     *   total = subtotal − descuento + envío
     *
     * `pnpm reconcile` verifica esa identidad en cada pedido.
     */
    discountPyg: pyg('discount_pyg').notNull().default(0),

    /**
     * La cuenta que hizo el pedido, si había una (PR E). **Nullable para
     * siempre**: el checkout de invitado es el camino principal y no se toca,
     * así que la enorme mayoría de los pedidos van a tener NULL acá.
     *
     * Declarada como columna suelta y con la FK agregada en los extras, igual
     * que `categories.parent_id`: la tabla `customers` se declara después en
     * este archivo y drizzle-kit no maneja la referencia hacia adelante.
     */
    customerId: int('customer_id'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
    paidAt: datetime('paid_at'),
  },
  (t) => [
    unique('orders_number_uq').on(t.orderNumber),
    index('orders_customer_idx').on(t.customerId),
    index('orders_coupon_idx').on(t.couponId),
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
    /**
     * Quién, como FK consultable (PR D).
     *
     * `actor` sigue existiendo y sigue siendo la verdad histórica: es el texto
     * que había en el momento (`admin:due@tienda.py`), y no cambia si después
     * esa persona cambia de email o se borra su usuario. Esta columna es para
     * **preguntar**: "todo lo que hizo el usuario 4 en agosto" no se puede
     * consultar contra un string sin adivinar.
     *
     * Nullable, y las dos razones importan: lo escrito antes de esta columna
     * no se backfillea —inventar la atribución del histórico es peor que no
     * tenerla— y hay escrituras legítimas sin usuario detrás (el cron, un
     * webhook de Pagopar, la compradora subiendo su comprobante).
     */
    actorUserId: int('actor_user_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('stock_adjustments_variant_idx').on(t.variantId, t.createdAt),
    index('stock_adjustments_actor_idx').on(t.actorUserId, t.createdAt),
  ],
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
    /**
     * Quién, como FK consultable (PR D). Ver el comentario largo en
     * `stock_adjustments.actor_user_id`: `actor` es la verdad histórica, esto
     * es para poder preguntar.
     *
     * NULL en todo lo que no lo movió una persona del panel — el cron que
     * vence pedidos, el webhook de Pagopar, la compradora que sube su
     * comprobante — y en todo lo anterior a esta columna.
     */
    actorUserId: int('actor_user_id'),
    reason: varchar('reason', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('order_events_order_idx').on(t.orderId, t.createdAt),
    index('order_events_actor_idx').on(t.actorUserId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Cupones (PLAN.md FASE 2, PR G) — cero filas = invisible
// ---------------------------------------------------------------------------

export const COUPON_TYPES = ['porcentaje', 'monto_fijo'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/**
 * Códigos de descuento.
 *
 * **Un descuento es plata**, así que valen las mismas reglas que el resto del
 * camino del dinero (README §"Reglas no negociables"):
 *
 * - `value` es un **entero** en las dos variantes: el porcentaje (1..100) o el
 *   monto en guaraníes. Nunca un float, nunca un decimal.
 * - El navegador manda el **código**, jamás el descuento. Lo calcula
 *   `computeOrderTotals` en el servidor, contra estas filas.
 *
 * Sin filas en esta tabla no hay campo de cupón en el checkout: cero cupones =
 * la tienda de siempre.
 */
export const coupons = mysqlTable(
  'coupons',
  {
    id: int('id').autoincrement().primaryKey(),

    /** Siempre en mayúsculas y sin espacios: se normaliza antes de guardar. */
    code: varchar('code', { length: 40 }).notNull(),

    type: mysqlEnum('type', COUPON_TYPES).notNull(),

    /**
     * `porcentaje` → 1..100. `monto_fijo` → guaraníes enteros.
     *
     * Una sola columna para los dos casos porque son excluyentes, y en los dos
     * es un entero. Qué significa lo dice `type`, y el dominio lo valida.
     */
    value: bigint('value', { mode: 'number', unsigned: true }).notNull(),

    /** Mínimo de compra (sobre el subtotal, sin envío). NULL = sin mínimo. */
    minOrderPyg: pyg('min_order_pyg'),

    /** Vigencia. NULL de cada lado = sin límite por ese lado. */
    startsAt: datetime('starts_at'),
    endsAt: datetime('ends_at'),

    /** Tope global de usos. NULL = ilimitado. */
    maxUses: int('max_uses', { unsigned: true }),
    /** Tope por comprador. NULL = ilimitado. */
    maxUsesPerCustomer: int('max_uses_per_customer', { unsigned: true }),

    /**
     * Cuántas veces se usó. La incrementa `createOrder` **adentro de la
     * transacción y con la fila bloqueada** (`FOR UPDATE`), igual que el stock:
     * sin eso, dos checkouts simultáneos gastan dos veces un cupón de un uso.
     */
    timesUsed: int('times_used', { unsigned: true }).notNull().default(0),

    /**
     * Sólo para quien tenga cuenta (PR E). Con `TIENDA.cuentasClientes`
     * apagado nadie tiene sesión de cliente, así que estos cupones
     * simplemente no validan — degradan solos, sin romper nada.
     */
    soloClientes: boolean('solo_clientes').notNull().default(false),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('coupons_code_uq').on(t.code), index('coupons_active_idx').on(t.isActive)],
);

// ---------------------------------------------------------------------------
// Cuentas de cliente (PLAN.md FASE 2, PR E) — detrás de `TIENDA.cuentasClientes`
// ---------------------------------------------------------------------------

/**
 * Compradoras con cuenta.
 *
 * **Tabla propia, separada de `users`, y no es un detalle de estilo.** Un
 * cliente jamás tiene que poder pisar el panel: si compartieran tabla, un bug
 * de rol o un `UPDATE` mal escrito convierte a una compradora en staff. Acá no
 * hay ningún camino desde esta tabla hacia `/admin` — ni columna de rol, ni
 * sesión compartida (la cookie y el secreto son propios, ver
 * `src/lib/customer-session.ts`).
 *
 * **La cuenta es opcional y siempre lo va a ser.** El checkout de invitado no
 * se toca: obligar a registrarse antes de la primera compra es el mayor
 * asesino de conversión del e-commerce paraguayo (ARCH.md §1). Esto existe
 * para quien *quiere* que le guardemos los datos.
 */
export const customers = mysqlTable(
  'customers',
  {
    id: int('id').autoincrement().primaryKey(),

    /**
     * La llave real. Normalizado `+595XXXXXXXXX` por `normalizePhonePY` antes
     * de insertar — igual que `orders.customer_phone`, para que las dos
     * columnas se puedan comparar entre sí.
     */
    phone: varchar('phone', { length: 20 }).notNull(),

    /** Opcional: en PY se compra con WhatsApp, no con email. */
    email: varchar('email', { length: 200 }),

    /**
     * bcrypt. **Nullable a propósito**: el PR F agrega login sin contraseña
     * (OTP por WhatsApp), y una cuenta creada por ese camino nunca tuvo una.
     * NULL significa "esta cuenta no entra con contraseña", y `verifyPassword`
     * ya devuelve false contra un hash señuelo en ese caso.
     */
    passwordHash: varchar('password_hash', { length: 255 }),

    name: varchar('name', { length: 160 }).notNull(),

    /**
     * Consentimiento para novedades. Tres estados como en `orders`: NULL es
     * "no se le preguntó", y no se completa con `false`.
     */
    marketingOptIn: boolean('marketing_opt_in'),
    marketingOptInAt: datetime('marketing_opt_in_at'),

    /**
     * Cuándo se probó que el teléfono es suyo. **Siempre NULL en este PR**: no
     * hay proveedor de mensajería todavía, así que nadie puede probar nada.
     *
     * Existe desde ahora porque es lo que decide si `/cuenta` le muestra los
     * pedidos viejos que sólo matchean por número de teléfono. Sin esta
     * columna, cualquiera que se registre tipeando el WhatsApp de otra persona
     * ve el historial de compras de esa persona — nombre, dirección y todo.
     * El PR F (OTP) es el único que la va a escribir.
     */
    phoneVerifiedAt: datetime('phone_verified_at'),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastLoginAt: datetime('last_login_at'),
  },
  (t) => [
    unique('customers_phone_uq').on(t.phone),
    unique('customers_email_uq').on(t.email),
  ],
);

/**
 * Códigos de un solo uso para entrar sin contraseña (PLAN.md FASE 2, PR F).
 *
 * **El código nunca se guarda.** Se guarda su SHA-256, igual que una
 * contraseña: quien lea esta tabla —un backup, un dump, una consulta de
 * soporte— no puede entrar a ninguna cuenta con lo que ve. La comparación es
 * por hash, y el hash es de un valor de 32 bytes aleatorios, así que no hay
 * nada que rainbow-tablear y no hace falta bcrypt (que además haría lento un
 * flujo que la gente espera mirando el teléfono).
 *
 * Append-only en la práctica: `consumed_at` marca el usado y `invalidated_at`
 * los que quedaron viejos al pedir uno nuevo. No se borran, porque "¿cuántos
 * códigos pidió esta cuenta anoche?" es la pregunta de un incidente.
 */
export const loginTokens = mysqlTable(
  'login_tokens',
  {
    id: int('id').autoincrement().primaryKey(),

    customerId: int('customer_id').notNull(),

    /** SHA-256 hex del código. Nunca el código. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),

    /** Por dónde se mandó, para poder explicar un "no me llegó". */
    channel: varchar('channel', { length: 20 }).notNull(),

    expiresAt: datetime('expires_at').notNull(),
    consumedAt: datetime('consumed_at'),
    /** Lo invalidó un pedido posterior: sólo el último código vale. */
    invalidatedAt: datetime('invalidated_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('login_tokens_hash_uq').on(t.tokenHash),
    index('login_tokens_customer_idx').on(t.customerId, t.createdAt),
  ],
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
    /**
     * Última vez que entró al panel. La escribe `authenticate()` y nadie más.
     *
     * NULL es "nunca entró", que es información distinta de "entró hace
     * mucho": es lo que le dice al dueño que la cuenta que creó el martes
     * sigue sin usarse, o que la de alguien que ya no trabaja acá quedó viva.
     */
    lastLoginAt: datetime('last_login_at'),
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

/**
 * Marker written by `POST /api/setup/init` (DEPLOY.md §4).
 *
 * One row, `id` always 1. It exists so the setup route can tell a first deploy
 * from a second call: without it, a curl repeated out of nerves re-seeds the
 * catalogue over a store that is already selling. Migrations and schema extras
 * are idempotent and always run; seeding and the owner upsert are what this
 * gates, and `force: true` is what re-opens them.
 *
 * Timestamps and nothing else — no ids, no emails. Whoever reads this table is
 * asking "did setup already run?", not "who ran it".
 */
export const setupState = mysqlTable('setup_state', {
  id: tinyint('id').primaryKey(),
  migratedAt: timestamp('migrated_at').notNull().defaultNow(),
  seededAt: timestamp('seeded_at'),
  ownerAt: timestamp('owner_at'),
  /** How many times the route ran. Only ever climbs; useful in a post-mortem. */
  runs: int('runs').notNull().default(1),
});

// ---------------------------------------------------------------------------
// Datos bancarios (PLAN.md FASE 2, PR T) — singleton, editable desde /admin
// ---------------------------------------------------------------------------

/**
 * A dónde transferir: banco, titular, RUC, cuenta y tipo de cuenta.
 *
 * Vivían sólo en `BANCO_*` del entorno, y eso significaba que corregir un
 * número de cuenta mal tipeado era un cambio en el hPanel y un redeploy — o
 * sea, una llamada al desarrollador para arreglar el dato del que depende
 * **el método de pago principal** de la tienda. Acá lo edita el dueño desde
 * el navegador y el entorno queda de fallback (ver `getDatosBancarios`).
 *
 * Singleton con el patrón de `setup_state`: una sola fila, `id` siempre 1, y
 * **columnas explícitas** en vez de clave-valor. Un key-value acepta
 * `bnaco = "Itaú"` sin quejarse y deja de tener tipos; acá una columna que no
 * existe no compila.
 *
 * Esto es **copy de display**: no entra en `computeOrderTotals` ni en ningún
 * total. Cambiarlo cambia lo que la compradora lee en la página del pedido y
 * en el WhatsApp de recuperación, nunca cuánto paga.
 *
 * Los cinco campos de texto son `NOT NULL` y el dominio los exige
 * todos-o-nada: media cuenta cargada es peor que ninguna, porque la página
 * mostraría un banco sin número. Sin fila —o con la fila incompleta— la
 * página avisa en vez de inventar, igual que antes.
 */
export const bankDetails = mysqlTable('bank_details', {
  id: tinyint('id').primaryKey(),
  banco: varchar('banco', { length: 120 }).notNull(),
  titular: varchar('titular', { length: 160 }).notNull(),
  ruc: varchar('ruc', { length: 20 }).notNull(),
  cuenta: varchar('cuenta', { length: 60 }).notNull(),
  tipoCuenta: varchar('tipo_cuenta', { length: 60 }).notNull(),
  /**
   * `public_id` del QR SPI en Cloudinary, en una carpeta **pública**. NULL =
   * sin QR cargado, y ahí manda `BANCO_QR_URL` del entorno si está.
   */
  qrCloudinaryId: varchar('qr_cloudinary_id', { length: 255 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  /**
   * Quién lo tocó por última vez. `ON DELETE SET NULL`: el dato bancario de
   * la tienda no se puede ir con el usuario que lo cargó.
   */
  updatedBy: int('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
