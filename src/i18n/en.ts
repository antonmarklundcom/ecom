import type { PartialMessages } from "./index";

/**
 * Catálogo de prueba en inglés (PLAN.md FASE 2, PR Q).
 *
 * Existe por el criterio de salida del plan: un segundo idioma tiene que poder
 * renderizar la vidriera entera sin que quede un string hardcodeado. Es
 * además el que demuestra que el fallback sirve — lo que no esté acá cae en
 * es-PY sin romper la pantalla.
 *
 * No se ofrece como idioma "soportado" de ninguna tienda real: una tienda que
 * venda en inglés va a querer revisar cada línea con alguien que la venda.
 */
export const en: PartialMessages = {
  comunes: {
    verProductos: "Shop now",
    verTodo: "See all →",
    inicio: "Home",
    categorias: "Categories",
    productos: (n: number) => `${n} ${n === 1 ? "product" : "products"}`,
    anterior: "Previous",
    siguiente: "Next",
    paginaDeTotal: (page: number, total: number) => `Page ${page} of ${total}`,
    ivaIncluido: "VAT included",
    reintentar: "Try again",
  },

  header: {
    buscarPlaceholder: "Search products…",
    buscarLabel: "Search products",
    categoriasNav: "Categories",
    carrito: "Cart",
    abrirCarrito: "Open cart",
    abrirCarritoConItems: (n: number) => `Open cart (${n})`,
  },

  footer: {
    contacto: "Contact",
    whatsapp: (numero: string) => `WhatsApp ${numero}`,
    seguiTuPedido: "Track your order",
  },

  home: {
    heroTitulo: "Easy shopping, your way to pay",
    heroTexto:
      "Bank transfer, QR or cash on delivery. Prices in guaraníes with VAT included and shipping across the country. Questions? Message us on WhatsApp.",
    destacados: "Featured",
    sinProductos: "No products published yet. Seed the catalogue with",
    errorCatalogo: "Could not read the catalogue:",
    errorCatalogoAyuda: (levantar: string, sembrar: string) =>
      `Start the database with ${levantar}, then ${sembrar}.`,
  },

  categoria: {
    conIva: "prices include VAT",
    sinResultados: "No products match those filters",
    sinResultadosAyuda: "Try removing the brand or widening the price range.",
    verTodaLaCategoria: "See the whole category",
    grillaProductos: "Products",
    paginacion: "Pagination",
    descripcionMeta: (nombre: string) =>
      `${nombre} in guaraníes, VAT included. Shipping across Paraguay.`,
    tituloFallback: "Category",
  },

  filtros: {
    marca: "Brand",
    todasLasMarcas: "All brands",
    filtrarPorMarca: "Filter by brand",
    marcaConCantidad: (marca: string, n: number) => `${marca} (${n})`,
    precio: "Price",
    cualquierPrecio: "Any price",
    filtrarPorPrecio: "Filter by price",
    ordenar: "Sort",
    limpiar: "Clear filters",
    quitarFiltro: "Remove filter",
    orden: {
      relevancia: "Most relevant",
      precioAsc: "Price: low to high",
      precioDesc: "Price: high to low",
      nuevos: "Newest",
    },
  },

  producto: {
    noEncontrado: "Product not found",
    descripcion: "Description",
    consultarWhatsApp: "Have a question? Ask us on WhatsApp",
    consultaWhatsApp: (nombre: string) => `Hi! I'm interested in "${nombre}". Is it available?`,
    iva: "VAT",
    ivaIncluidoEnPrecio: (tasa: number) => `${tasa}% included in the price`,
    disponibilidad: "Availability",
    unidadesDisponibles: (n: number) => `${n} units`,
    sinStock: "Out of stock",
    desde: "From",
    relacionados: "You might also like",
    descripcionMeta: (nombre: string, precio: string) => `${nombre} — ${precio}, VAT included.`,
  },

  stock: {
    sinStock: "Out of stock",
    ultimaUnidad: "Last one",
    quedan: (n: number) => `${n} left`,
    disponible: "In stock",
  },

  buscar: {
    titulo: "Search products",
    resultadosPara: (term: string) => `Results for “${term}”`,
    minimo: "Type at least two letters to search.",
    sinResultados: (term: string) => `Nothing found for “${term}”`,
    sinResultadosAyuda: "Try fewer words, or browse the categories.",
  },

  whatsapp: {
    contacto: "WhatsApp contact",
    escribinos: "Message us on WhatsApp",
    consultaGenerica: "Hi! I have a question about a product.",
  },

  carrito: {
    titulo: "Your cart",
    vacio: "Your cart is empty.",
    seguirComprando: "Keep shopping",
    cantidad: "Quantity",
    quitarUno: "Remove one",
    agregarUno: "Add one",
    quitar: "Remove",
    subtotal: "Subtotal",
    irAlCheckout: "Go to checkout",
    consultarPorWhatsApp: "Ask on WhatsApp",
    agregarAlCarrito: "Add to cart",
    elegiVariante: "Pick an option",
    preciosSeConfirman: "Prices are confirmed with the server. Everything includes VAT.",
    envioSeCalcula: "Shipping is calculated at checkout based on your city.",
    abriendoWhatsApp: "Opening WhatsApp…",
    consultaDuda: "Have a question? Ask us on WhatsApp",
    agregadoTitulo: "Added to your cart",
    problemas: {
      noDisponible: (nombre: string) => `${nombre} sold out and we removed it from your cart.`,
      stockParcial: (nombre: string, quedan: number, pediste: number) =>
        `Only ${quedan} left of ${nombre} (you asked for ${pediste}).`,
      precioCambio: (nombre: string) => `The price of ${nombre} changed while it sat in your cart.`,
    },
  },

  envioGratis: {
    alcanzado: "You've got free shipping!",
    faltan: "away from free shipping.",
    faltanPrefijo: "You're",
    enAlgunasZonasDesde: "In some areas shipping is free from",
    ponéTuCiudad: "Enter your city at checkout and we'll tell you yours.",
    puedeQueTengas:
      "You may have free shipping: it depends on your city. Enter it at checkout and we'll tell you.",
  },

  checkout: {
    titulo: "Checkout",
    encabezado: "Complete your order",
    conCuenta: "We already have your details: check them and confirm.",
    sinCuenta: "No account, no sign-up: we'll send your order link on WhatsApp.",
  },

  pedido: {
    buscarTitulo: "Find my order",
    buscarEncabezado: "Find your order",
    buscarAyuda:
      "If you lost the link we sent on WhatsApp, use your order number and the phone you bought with.",
    detalleTitulo: "Your order",
    etiqueta: "Order",
    estado: "Status:",
    pagarTransferencia: "Pay by transfer or QR",
    pagarTransferenciaAyuda:
      "Transfer the exact total and upload the receipt below. We'll check it and confirm.",
    banco: "Bank",
    titular: "Account holder",
    ruc: "RUC",
    totalATransferir: "Total to transfer (₲)",
    qrAlt: "QR code to pay via SPI",
    qrAyuda: "Or scan the QR from your banking app.",
    pasos: {
      abrirApp: "Open your banking app and choose an SPI transfer or QR payment.",
      copiarDatos: "Copy the bank, account holder, RUC and account number above (or scan the QR).",
      copiarTotalPrefijo: "Copy the exact total —",
      copiarTotalSufijo: "— and paste it as the amount. Don't round it or change the number.",
      confirmar: "Confirm the transfer.",
      captura: "Take a screenshot of the receipt and upload it below.",
    },
    sinDatosBancarios:
      "The shop's bank details aren't set up yet. Message us on WhatsApp with your order number and we'll pass them along in the meantime.",
    subiComprobante: "Upload your receipt",
    comprobanteMax:
      "You've uploaded the maximum number of receipts. If something went wrong, message us on WhatsApp.",
    comprobanteCampo: "Receipt (JPG, PNG or PDF, up to 5 MB)",
    subiendo: "Uploading…",
    enviarComprobante: "Send receipt",
    comprobanteRecibido: "Receipt received. We'll check it and let you know.",
    comprobantePorWhatsApp: "You can also send us the receipt straight on WhatsApp:",
    enviarComprobantePorWhatsApp: "Send receipt on WhatsApp",
    tuPedido: "Your order",
    subtotal: "Subtotal",
    descuento: "Discount",
    envio: "Shipping",
    total: "Total",
    ivaIncluido: (tasa: number) => `${tasa}% VAT included`,
    seguimiento: "Tracking",
    referencia: (texto: string) => `Landmark: ${texto}`,
    seguirComprando: "Keep shopping",
    consultaWhatsApp: (numero: string, total: string) =>
      `Hi! I'm writing about my order ${numero} (${total}).`,
    comprobanteWhatsApp: (numero: string, total: string, url: string) =>
      `Hi! I've transferred order ${numero} for ${total}. ` +
      `Here's the receipt. You can see the order here: ${url}`,
    pagoparTitulo: "Coming back from Pagopar",
    pagoparNoEncontrado: "We couldn't find your order",
    pagoparAyuda:
      "You came back from Pagopar but we couldn't identify the order from here. If you already paid, don't worry: your order confirmation reached you on WhatsApp with the link to track it.",
    pagoparBuscar: "Find my order with the number and my WhatsApp",
    numeroDePedido: "Order number",
    whatsappUsado: "WhatsApp used for the purchase",
    buscando: "Searching…",
  },

  copiar: {
    copiar: "Copy",
    copiado: "Copied!",
    copiadoToast: (campo: string) => `${campo} copied`,
    error: "Couldn't copy. Copy it by hand.",
  },

  formulario: {
    nombreApellido: "Full name",
    whatsapp: "WhatsApp",
    email: "Email",
    opcional: "(optional)",
    emailAyuda: "In case your WhatsApp fails. Not required, and we don't use it for anything else.",
    documento: "Tax ID",
    consumidorFinal: "Final consumer",
    cedula: "ID card",
    ruc: "RUC",
    rucConDv: "RUC (with check digit)",
    nroCedula: "ID card number",
    ciudad: "City",
    barrio: "Neighbourhood",
    direccion: "Address",
    referencia: "Landmark (optional)",
    referenciaPlaceholder: "House with the green gate, between X and Y",
    comoPagar: "How would you like to pay?",
    pago: {
      transferencia: "Bank transfer / QR (SPI)",
      transferenciaAyuda: "We send you the details and you upload the receipt.",
      contraEntrega: "Cash on delivery",
      contraEntregaAyuda: "You pay in cash when your order arrives.",
      tarjeta: "Card / Pagopar",
      tarjetaAyuda: "Pay online right now, by card or other Pagopar methods.",
    },
    esRegalo: "It's a gift",
    esRegaloAyuda: "We'll wrap it as a gift and add a note if you want.",
    mensajeTarjeta: "Message for the card (optional)",
    mensajeTarjetaPlaceholder: "Happy birthday! With love.",
    novedades: "I want to receive news and offers",
    novedadesAyuda: (tienda: string) =>
      `${tienda} will message the WhatsApp number above, only about offers and new products. ` +
      "Never about this order — that reaches you anyway — and we never pass your number to anyone. " +
      "Ask us to remove you whenever you like.",
    tenesCodigo: "Have a discount code?",
    codigoDescuento: "Discount code",
    codigoPlaceholder: "WELCOME",
    aplicar: "Apply",
    quitar: "Remove",
    cuponListo: (codigo: string, monto: string) => `Done: ${codigo} takes off ${monto}.`,
    cuponPoneCiudad: "Enter your city to see the total with the discount applied.",
    subtotalConIva: "Subtotal (VAT included)",
    descuento: "Discount",
    envio: "Shipping",
    gratis: "Free",
    total: "Total",
    poneCiudad: "Enter your city and we'll work out shipping before you confirm.",
    ciudadFueraDeZona: (zona: string) =>
      `We couldn't find your city in our zones, so we quoted the highest rate (${zona}). ` +
      "Message us on WhatsApp and we'll sort it out.",
    totalSeConfirma: "The total is confirmed when the order is created.",
    creandoPedido: "Creating your order…",
    confirmarPedido: "Confirm order",
  },

  cupones: {
    noExiste: "That code doesn't exist or is no longer available.",
    noEmpezo: "That code isn't valid yet.",
    vencido: "That code has expired.",
    agotado: "That code has been used all the times available.",
    agotadoParaVos: "You've already used that code as many times as allowed.",
    minimoSinMonto: "Your order doesn't reach the minimum that code requires.",
    minimoConFalta: (minimo: string, falta: string) =>
      `That code needs a minimum order of ${minimo}: you're ${falta} short.`,
    minimo: (minimo: string) => `That code needs a minimum order of ${minimo}.`,
    soloClientes: "That code is only for customers with an account.",
  },

  cuenta: {
    miCuenta: "My account",
    entrar: "Sign in",
    entrando: "Signing in…",
    salir: "Sign out",
    saliendo: "Signing out…",
    entrarTitulo: "Sign in to your account",
    entrarEncabezado: "Sign in to your account",
    entrarAyuda: "To see your orders and skip typing your details again.",
    whatsappOEmail: "WhatsApp or email",
    contrasena: "Password",
    contrasenaAyuda: (minimo: number) =>
      `At least ${minimo} characters, with letters and numbers.`,
    olvidasteContrasena: "Forgot your password?",
    olvidasteAyuda: "We'll send you a code on WhatsApp and you sign in with that.",
    codigo: "Code",
    codigoAyuda:
      "If there's an account with that WhatsApp number, we'll send a 6-digit code. It expires in 10 minutes.",
    mandandoCodigo: "Sending…",
    mandameCodigo: "Send me a code",
    todaviaNoTenesCuenta: "Don't have an account yet?",
    creaUna: "Create one",
    yaTenesCuenta: "Already have an account?",
    entra: "Sign in",
    registroTitulo: "Create account",
    registroEncabezado: "Create your account",
    registroAyuda: "We save your details so your next order takes two taps.",
    creando: "Creating…",
    crearCuenta: "Create account",
    telefonoAyuda: "It's what you sign in with, and where we message you about your order.",
    novedadesWhatsApp: "I want to receive news and offers on WhatsApp.",
    noHaceFaltaCuentaComprar:
      "You don't need an account to buy. This is only so you don't type your address again.",
    noHaceFaltaCuentaInvitada:
      "You don't need an account to buy. You can order as a guest and track it with the link we send on WhatsApp.",
    hola: (nombre: string) => `Hi, ${nombre}`,
    misPedidos: "My orders",
    sinPedidos: "You haven't placed any orders with this account yet.",
    miraLoQueHay: "See what's in stock",
    pedidosDeInvitada:
      "If you bought before creating this account, those orders don't show up yet. Track them with the link we sent on WhatsApp.",
    misDatos: "My details",
    whatsappEtiqueta: "WhatsApp:",
    whatsappNoSeCambia:
      "It's the key to your account, so it can't be changed here. Message us if you need to.",
    guardando: "Saving…",
    guardar: "Save",
    datosGuardados: "Done, we saved your details.",
    guardarDatosTitulo: "Shall we save your details for next time?",
    guardarDatosTexto: (numero: string) =>
      "With an account you don't type your address again, and all your orders live in one " +
      `place. Your order ${numero} is already placed: this is just for next time.`,
    crearMiCuenta: "Create my account",
    telefonoPlaceholder: "0981 123 456",
    codigoPlaceholder: "123456",
  },

  estados: {
    comprador: {
      pendiente_pago: "Waiting for your payment",
      esperando_verificacion: "Receipt under review",
      pagado: "Payment confirmed",
      preparando: "Preparing your order",
      enviado: "On its way",
      entregado: "Delivered",
      rechazado: "Receipt rejected",
      vencido: "Expired",
      cancelado: "Cancelled",
      reembolsado: "Refunded",
    },
  },

  errores: {
    error404: "Error 404",
    noEncontramosPagina: "We couldn't find this page",
    noEncontramosPaginaAyuda:
      "The product may no longer be published, or the link was copied wrong.",
    irAlInicio: "Go to homepage",
    buscarMiPedido: "Find my order",
    algoSalioMal: "Something went wrong",
    algoSalioMalAyuda: "We had a problem loading this page. Try again in a few seconds.",
    referencia: (digest: string) => `Ref: ${digest}`,
  },
};
