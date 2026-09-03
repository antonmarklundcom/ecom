/**
 * Contrato de `data-testid` entre la maquinaria (`src/components/**`,
 * checkout, admin) y los specs de `tests/e2e/**`.
 *
 * Antes de este contrato, los specs localizaban por texto y markup del seed
 * —nombres de categoría, slugs de producto demo, textos de botones—, así que
 * cada tienda clonada los rompía al rediseñar la piel (NEW-STORE.md §5). Este
 * módulo es la única fuente de verdad: los componentes ponen estos ids en su
 * markup y los specs los importan en vez de inventar selectores propios.
 *
 * Regla para quien clona la tienda: se puede repintar cualquier markup, pero
 * **no** quitar un `data-testid` de esta lista de un elemento que ya lo tiene
 * (ver NEW-STORE.md §5). Agregar o sacar clases, cambiar el texto visible o
 * mover el elemento de lugar no rompe nada; borrar el atributo sí.
 *
 * `tests/unit/testids-contrato.test.ts` falla si un id de acá deja de
 * aparecer en `src/`.
 */
export const TESTIDS = {
  /** Un link del menú de categorías del header (`site-header.tsx`). */
  headerCategoryLink: "header-category-link",
  /** El botón que abre el carrito (`cart-button.tsx`). */
  headerCartLink: "header-cart-link",
  /** La ficha de producto en una grilla (`product-card.tsx`), con `data-slug`. */
  productCard: "product-card",
  /** Agregar al carrito en la ficha de producto (`add-to-cart.tsx`). */
  productAddToCart: "product-add-to-cart",
  /** "Ir al checkout" en el carrito slide-over (`cart-sheet.tsx`). */
  cartCheckoutLink: "cart-checkout-link",
  /** Campos del checkout (`checkout-form.tsx`). */
  checkoutName: "checkout-name",
  checkoutPhone: "checkout-phone",
  checkoutDocType: "checkout-doc-type",
  checkoutDocNumber: "checkout-doc-number",
  checkoutCity: "checkout-city",
  checkoutAddress: "checkout-address",
  /** Radio de forma de entrega, con `data-slug` del método. */
  checkoutShippingMethod: "checkout-shipping-method",
  /** Radio de medio de pago, con `data-value` (`transferencia` | `contra_entrega` | `tarjeta`). */
  checkoutPaymentMethod: "checkout-payment-method",
  /** La línea de total del checkout, visible recién con la cotización lista. */
  checkoutTotal: "checkout-total",
  checkoutSubmit: "checkout-submit",
  /** El número de pedido en la página de confirmación (`pedido/[orderNumber]`). */
  orderConfirmationNumber: "order-confirmation-number",
  /** Login del panel (`admin/login`, `login-form.tsx`). */
  adminLoginEmail: "admin-login-email",
  adminLoginPassword: "admin-login-password",
  adminLoginSubmit: "admin-login-submit",
  /** El link "Pedidos" del nav del panel (`admin/(panel)/layout.tsx`). */
  adminNavOrders: "admin-nav-orders",
  /** El buscador del listado de pedidos (`admin/order-filters.tsx`). */
  adminOrdersSearchInput: "admin-orders-search-input",
  adminOrdersSearchSubmit: "admin-orders-search-submit",
} as const;

export type TestId = (typeof TESTIDS)[keyof typeof TESTIDS];
