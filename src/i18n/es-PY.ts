/**
 * Catálogo de mensajes — **es-PY, el idioma por defecto y el fallback**.
 *
 * Reglas para editarlo, que son las que hacen que traducir sea posible:
 *
 * 1. **Las claves son el contrato.** Un catálogo de otro idioma copia este
 *    archivo y cambia sólo los valores. Hay un test de CI que exige que todos
 *    los catálogos registrados tengan exactamente estas claves.
 * 2. **Una clave por frase completa**, no por pedacito. Partir "Te faltan ₲X
 *    para el envío gratis" en tres claves obliga a quien traduce a adivinar el
 *    orden de las palabras, y hay idiomas donde el orden es otro.
 * 3. **Los `{parámetros}` van con nombre**, nunca por posición: `{n}`,
 *    `{nombre}`, `{monto}`. Quien traduce los puede mover de lugar.
 * 4. **Los plurales van de a dos claves**, `<base>.uno` y `<base>.varios`, y
 *    se leen con `tPlural()`. Las dos reciben `{n}`.
 * 5. **La plata no se traduce.** Los montos los formatea `formatGs()` y
 *    entran como parámetro ya armado (`₲ 35.000`): la moneda de este template
 *    es el guaraní, y cambiarla no es traducir (PLAN.md, PR P–S).
 *
 * Ordenado por área de la tienda, y adentro de cada área por dónde aparece en
 * la pantalla. Para encontrar algo, buscá el texto: está literal.
 */
export const esPY = {
  // -------------------------------------------------------------------------
  // Header y pie
  // -------------------------------------------------------------------------
  "header.categorias": "Categorías",
  "header.buscar.placeholder": "Buscar productos…",
  "header.buscar.label": "Buscar productos",
  "header.buscar.sugerencias": "Sugerencias",
  "header.buscar.verTodos": "Ver todos los resultados de “{termino}”",

  "footer.categorias": "Categorías",
  "footer.contacto": "Contacto",
  "footer.whatsapp": "WhatsApp {telefono}",
  "footer.seguirPedido": "Seguí tu pedido",

  "whatsapp.flotante.label": "Escribinos por WhatsApp",
  "whatsapp.flotante.nav": "Contacto por WhatsApp",
  "whatsapp.consultaGenerica": "¡Hola! Tengo una consulta sobre un producto.",

  // -------------------------------------------------------------------------
  // Home
  // -------------------------------------------------------------------------
  "home.hero.titulo": "Comprá fácil, pagá como quieras",
  "home.hero.texto":
    "Transferencia, QR o contra entrega. Precios en guaraníes con IVA incluido y envíos a todo el país. ¿Dudas? Escribinos por WhatsApp.",
  "home.hero.cta": "Ver productos",
  "home.categorias": "Categorías",
  "home.categorias.verTodo": "Ver todo →",
  "home.destacados": "Destacados",
  "home.sinProductos":
    "Todavía no hay productos publicados. Sembrá el catálogo con pnpm db:seed.",
  "home.errorCatalogo": "No pude leer el catálogo:",
  "home.errorCatalogo.ayuda":
    "Levantá la base con docker compose up -d, después pnpm db:push && pnpm db:seed.",

  // -------------------------------------------------------------------------
  // Catálogo: fichas, precios, stock
  // -------------------------------------------------------------------------
  "catalogo.productos.uno": "{n} producto",
  "catalogo.productos.varios": "{n} productos",
  "catalogo.opciones": "{n} opciones",
  "catalogo.ivaIncluidoNota": "precios con IVA incluido",
  "catalogo.tituloOculto": "Productos",
  "catalogo.sinFoto": "{nombre} (sin foto todavía)",

  "precio.ivaIncluido": "IVA incluido",

  "stock.sin": "Sin stock",
  "stock.ultima": "Última unidad",
  "stock.quedan": "Quedan {n}",
  "stock.disponible": "Disponible",

  // -------------------------------------------------------------------------
  // Filtros de categoría
  // -------------------------------------------------------------------------
  "filtros.marca.label": "Filtrar por marca",
  "filtros.marca.todas": "Todas las marcas",
  "filtros.marca.conCuenta": "{marca} ({n})",
  "filtros.precio.label": "Filtrar por precio",
  "filtros.precio.cualquiera": "Cualquier precio",
  "filtros.orden.label": "Ordenar",
  "filtros.orden.relevancia": "Más relevantes",
  "filtros.orden.precioAsc": "Precio: menor a mayor",
  "filtros.orden.precioDesc": "Precio: mayor a menor",
  "filtros.orden.nuevos": "Más nuevos",
  "filtros.quitar": "Quitar el filtro {filtro}",
  "filtros.limpiarTodo": "Limpiar todo",

  "precio.rango.hasta": "Hasta {monto}",
  "precio.rango.entre": "{desde} a {hasta}",
  "precio.rango.masDe": "Más de {monto}",

  // -------------------------------------------------------------------------
  // Carrito
  // -------------------------------------------------------------------------
  "carrito.abrir": "Abrir carrito",
  "carrito.abrirCon": "Abrir carrito ({n})",
  "carrito.boton": "Carrito",
  "carrito.titulo": "Tu carrito",
  "carrito.descripcion": "Los precios se confirman con el servidor. Todo incluye IVA.",
  "carrito.vacio": "Tu carrito está vacío.",
  "carrito.seguirComprando": "Seguí comprando",
  "carrito.quitar": "Quitar",
  "carrito.subtotal": "Subtotal",
  "carrito.envioEnCheckout": "El envío se calcula en el checkout según tu ciudad.",
  "carrito.irAlCheckout": "Ir al checkout",
  "carrito.consultarWhatsApp": "¿Tenés una duda? Consultanos por WhatsApp",
  "carrito.abriendoWhatsApp": "Abriendo WhatsApp…",

  "carrito.problema.noDisponible": "{nombre} se quedó sin stock y lo sacamos del carrito.",
  "carrito.problema.stockParcial": "De {nombre} quedan {disponible} (pediste {pedido}).",
  "carrito.problema.precioCambio":
    "El precio de {nombre} cambió mientras estaba en tu carrito.",

  "cantidad.label": "Cantidad",
  "cantidad.quitarUno": "Quitar uno",
  "cantidad.agregarUno": "Agregar uno",

  // -------------------------------------------------------------------------
  // Envío gratis
  // -------------------------------------------------------------------------
  "envioGratis.alcanzado": "¡Tenés envío gratis!",
  "envioGratis.falta": "Te faltan {monto} para el envío gratis.",
  "envioGratis.indefinidoConMonto":
    "En algunas zonas el envío es gratis desde {monto}. Poné tu ciudad en el checkout y te decimos la tuya.",
  "envioGratis.indefinido":
    "Puede que tengas envío gratis: depende de tu ciudad. Ponela en el checkout y te decimos.",

  // -------------------------------------------------------------------------
  // Ficha de producto
  // -------------------------------------------------------------------------
  "producto.elegiOpcion": "Elegí una opción",
  "producto.agregar": "Agregar al carrito",
  "producto.agregado": "Agregado al carrito",
  "producto.consultaWhatsApp": '¡Hola! Me interesa "{nombre}". ¿Está disponible?',
  "producto.dudaWhatsApp": "¿Tenés una duda? Consultanos por WhatsApp",
  "producto.descripcion": "Descripción",
  "producto.iva": "IVA",
  "producto.ivaValor": "{tasa}% incluido en el precio",
  "producto.disponibilidad": "Disponibilidad",
  "producto.unidades": "{n} unidades",
  "producto.desde": "Desde",
  "producto.relacionados": "También te puede interesar",
  "producto.noEncontrado": "Producto no encontrado",
  "producto.metaDescripcion": "{nombre} — {precio}, IVA incluido.",

  // -------------------------------------------------------------------------
  // Copiar datos bancarios
  // -------------------------------------------------------------------------
  "copiar.boton": "Copiar",
  "copiar.listo": "¡Copiado!",
  "copiar.ok": "{campo} copiado",
  "copiar.error": "No se pudo copiar. Copialo a mano.",

  // -------------------------------------------------------------------------
  // Navegación común
  // -------------------------------------------------------------------------
  "nav.inicio": "Inicio",
  "nav.paginacion": "Paginación",
  "nav.anterior": "Anterior",
  "nav.siguiente": "Siguiente",
  "nav.pagina": "Página {actual} de {total}",

  // -------------------------------------------------------------------------
  // Categoría
  // -------------------------------------------------------------------------
  "categoria.meta": "Categoría",
  "categoria.metaDescripcion": "{nombre} en guaraníes, IVA incluido. Envíos a todo Paraguay.",
  "categoria.sinResultados": "No encontramos productos con esos filtros",
  "categoria.sinResultados.ayuda": "Probá quitando la marca o ampliando el rango de precio.",
  "categoria.verTodo": "Ver toda la categoría",

  // -------------------------------------------------------------------------
  // Buscador
  // -------------------------------------------------------------------------
  "buscar.meta": "Buscar",
  "buscar.titulo": "Buscar productos",
  "buscar.resultadosPara": "Resultados para “{termino}”",
  "buscar.minimo": "Escribí al menos dos letras para buscar.",
  "buscar.nada": "No encontramos nada con “{termino}”",
  "buscar.nada.ayuda": "Probá con menos palabras, o mirá las categorías.",

  // -------------------------------------------------------------------------
  // Páginas de error
  // -------------------------------------------------------------------------
  "error404.codigo": "Error 404",
  "error404.titulo": "No encontramos esta página",
  "error404.texto":
    "Puede que el producto ya no esté publicado o que el link esté mal copiado.",
  "error404.inicio": "Ir al inicio",
  "error404.buscarPedido": "Buscar mi pedido",

  "error.titulo": "Algo salió mal",
  "error.texto": "Tuvimos un problema cargando esta página. Probá de nuevo en unos segundos.",
  "error.ref": "Ref: {digest}",
  "error.reintentar": "Reintentar",

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------
  "checkout.meta": "Checkout",
  "checkout.titulo": "Finalizá tu compra",
  "checkout.bajadaConCuenta": "Ya tenemos tus datos: revisalos y confirmá.",
  "checkout.bajadaInvitado":
    "Sin cuenta ni registro: te mandamos el link de tu pedido por WhatsApp.",
  "checkout.carritoVacio": "Tu carrito está vacío",
  "checkout.verProductos": "Ver productos",

  "checkout.nombre": "Nombre y apellido",
  "checkout.whatsapp": "WhatsApp",
  "checkout.whatsapp.placeholder": "0981 123 456",
  "checkout.email": "Email",
  "checkout.opcional": "(opcional)",
  "checkout.email.placeholder": "tucorreo@ejemplo.com",
  "checkout.email.ayuda":
    "Por si tu WhatsApp falla. No es obligatorio y no lo usamos para nada más.",

  "checkout.documento": "Documento",
  "checkout.documento.ninguno": "Consumidor final",
  "checkout.documento.ci": "Cédula",
  "checkout.documento.ruc": "RUC",
  "checkout.documento.rucLabel": "RUC (con DV)",
  "checkout.documento.ciLabel": "Nro. de cédula",

  "checkout.ciudad": "Ciudad",
  "checkout.barrio": "Barrio",
  "checkout.direccion": "Dirección",
  "checkout.referencia": "Referencia (opcional)",
  "checkout.referencia.placeholder": "Casa de portón verde, entre X e Y",

  "checkout.pago.pregunta": "¿Cómo querés pagar?",
  "checkout.pago.transferencia": "Transferencia / QR (SPI)",
  "checkout.pago.transferencia.ayuda": "Te pasamos los datos y subís el comprobante.",
  "checkout.pago.contraEntrega": "Contra entrega",
  "checkout.pago.contraEntrega.ayuda": "Pagás en efectivo cuando recibís el pedido.",
  "checkout.pago.tarjeta": "Tarjeta / Pagopar",
  "checkout.pago.tarjeta.ayuda":
    "Pagás online, ahora, con tarjeta u otros medios de Pagopar.",

  "checkout.regalo": "Es un regalo",
  "checkout.regalo.ayuda": "Lo preparamos para regalar y, si querés, le sumamos un mensaje.",
  "checkout.regalo.mensaje": "Mensaje para la tarjeta (opcional)",
  "checkout.regalo.mensaje.placeholder": "¡Feliz cumple! Con mucho cariño.",

  "checkout.novedades": "Quiero recibir novedades y promociones",
  "checkout.novedades.ayuda":
    "{tienda} te escribe al WhatsApp que pusiste arriba, sólo por ofertas y productos nuevos. Nunca por este pedido —eso te llega igual— y nunca le pasamos tu número a nadie. Pedinos que te saquemos cuando quieras.",

  "checkout.cupon.pregunta": "¿Tenés un código de descuento?",
  "checkout.cupon.label": "Código de descuento",
  "checkout.cupon.placeholder": "BIENVENIDA",
  "checkout.cupon.aplicar": "Aplicar",
  "checkout.cupon.aplicado": "Listo: {codigo} descuenta {monto}.",
  "checkout.cupon.quitar": "Quitar",
  "checkout.cupon.faltaCiudad": "Poné tu ciudad para ver el total con el descuento aplicado.",

  "checkout.subtotal": "Subtotal (IVA incluido)",
  "checkout.descuento": "Descuento",
  "checkout.descuentoCon": "Descuento — {codigo}",
  "checkout.envio": "Envío",
  "checkout.envioCon": "Envío — {zona}",
  "checkout.envioGratis": "Gratis",
  "checkout.total": "Total",
  "checkout.nota.faltaCiudad": "Poné tu ciudad y te calculamos el envío antes de confirmar.",
  "checkout.nota.masCara":
    "No encontramos tu ciudad en nuestras zonas: te cotizamos la tarifa más alta ({zona}). Escribinos por WhatsApp y lo revisamos.",
  "checkout.nota.exacta": "El total se confirma al crear el pedido.",
  "checkout.confirmar": "Confirmar pedido",
  "checkout.confirmando": "Creando tu pedido…",

  // -------------------------------------------------------------------------
  // Cupones rechazados
  // -------------------------------------------------------------------------
  "cupon.rechazo.noExiste": "Ese código no existe o ya no está disponible.",
  "cupon.rechazo.noEmpezo": "Ese código todavía no está vigente.",
  "cupon.rechazo.vencido": "Ese código ya venció.",
  "cupon.rechazo.agotado": "Ese código ya se usó todas las veces disponibles.",
  "cupon.rechazo.agotadoParaVos": "Ya usaste ese código la cantidad de veces permitida.",
  "cupon.rechazo.minimo": "Tu compra no llega al mínimo que pide ese código.",
  "cupon.rechazo.minimoConMonto": "Ese código pide una compra mínima de {minimo}.",
  "cupon.rechazo.minimoConFalta":
    "Ese código pide una compra mínima de {minimo}: te faltan {falta}.",
  "cupon.rechazo.soloClientes": "Ese código es sólo para quienes tienen cuenta.",

  // -------------------------------------------------------------------------
  // Buscar un pedido
  // -------------------------------------------------------------------------
  "buscarPedido.meta": "Buscar mi pedido",
  "buscarPedido.titulo": "Buscá tu pedido",
  "buscarPedido.bajada":
    "Si perdiste el link que te mandamos por WhatsApp, entrá con el número de pedido y el teléfono que usaste al comprar.",
  "buscarPedido.numero": "Número de pedido",
  "buscarPedido.numero.placeholder": "PY-000123",
  "buscarPedido.telefono": "WhatsApp usado en la compra",
  "buscarPedido.boton": "Buscar mi pedido",
  "buscarPedido.buscando": "Buscando…",

  // -------------------------------------------------------------------------
  // La página del pedido (la que le llega por WhatsApp)
  // -------------------------------------------------------------------------
  "pedido.meta": "Tu pedido",
  "pedido.etiqueta": "Pedido",
  "pedido.estado": "Estado:",
  "pedido.consultaWhatsApp": "¡Hola! Te escribo por mi pedido {numero} ({total}).",

  "pedido.transferencia.titulo": "Pagá por transferencia o QR",
  "pedido.transferencia.bajada":
    "Transferí el total exacto y subí el comprobante acá abajo. Lo revisamos y te confirmamos.",
  "pedido.banco.banco": "Banco",
  "pedido.banco.titular": "Titular",
  "pedido.banco.ruc": "RUC",
  "pedido.banco.total": "Total a transferir (₲)",
  "pedido.banco.qrAlt": "Código QR para pagar por SPI",
  "pedido.banco.qrAyuda": "O escaneá el QR desde la app de tu banco.",
  "pedido.banco.sinDatos":
    "Los datos bancarios del comercio todavía no están configurados. Escribinos por WhatsApp con tu número de pedido y te los pasamos a mano mientras tanto.",
  "pedido.pasos.1": "Abrí la app de tu banco y elegí transferencia por SPI o pago por QR.",
  "pedido.pasos.2":
    "Copiá el banco, titular, RUC y número de cuenta de arriba (o escaneá el QR).",
  "pedido.pasos.3":
    "Copiá el total exacto —{total}— y pegalo como monto. No redondees ni cambies el número.",
  "pedido.pasos.4": "Confirmá la transferencia.",
  "pedido.pasos.5": "Sacá una captura del comprobante y subila acá abajo.",

  "pedido.comprobante.titulo": "Subí tu comprobante",
  "pedido.comprobante.waAyuda": "También podés mandarnos el comprobante directo por WhatsApp:",
  "pedido.comprobante.waBoton": "Enviar comprobante por WhatsApp",
  "pedido.comprobante.waMensaje":
    "¡Hola! Ya transferí el pedido {numero} por {total}. Te mando el comprobante. Podés ver el pedido acá: {url}",

  "pedido.items.titulo": "Tu pedido",
  "pedido.subtotal": "Subtotal",
  "pedido.descuento": "Descuento",
  "pedido.descuentoCon": "Descuento — {codigo}",
  "pedido.envio": "Envío",
  "pedido.total": "Total",
  "pedido.iva10": "IVA 10% incluido",
  "pedido.iva5": "IVA 5% incluido",

  "pedido.envio.titulo": "Envío",
  "pedido.envio.referencia": "Ref: {referencia}",
  "pedido.seguimiento": "Seguimiento",
  "pedido.escribinos": "Escribinos por WhatsApp",
  "pedido.seguirComprando": "Seguir comprando",

  "pedido.subirComprobante.maximo":
    "Ya subiste el máximo de comprobantes. Si hubo un problema, escribinos por WhatsApp.",
  "pedido.subirComprobante.campo": "Comprobante (JPG, PNG o PDF, hasta 5 MB)",
  "pedido.subirComprobante.enviar": "Enviar comprobante",
  "pedido.subirComprobante.enviando": "Subiendo…",
  "pedido.subirComprobante.recibido": "Comprobante recibido. Lo revisamos y te avisamos.",

  // -------------------------------------------------------------------------
  // Vuelta de Pagopar
  // -------------------------------------------------------------------------
  "pagopar.meta": "Volviendo de Pagopar",
  "pagopar.noEncontrado": "No encontramos tu pedido",
  "pagopar.noEncontrado.texto":
    "Volviste de Pagopar pero no pudimos identificar el pedido desde acá. Si ya pagaste, no te preocupes: tu comprobante de pedido te llegó por WhatsApp con el link para seguirlo.",
  "pagopar.buscar": "Buscar mi pedido con el número y mi WhatsApp",

  // -------------------------------------------------------------------------
  // Cuentas de cliente (sólo se ven con `TIENDA.cuentasClientes` prendido)
  // -------------------------------------------------------------------------
  "cuenta.header.entrar": "Entrar",
  "cuenta.header.miCuenta": "Mi cuenta",

  "cuenta.meta": "Mi cuenta",
  "cuenta.hola": "Hola, {nombre}",
  "cuenta.salir": "Salir",
  "cuenta.saliendo": "Saliendo…",
  "cuenta.pedidos": "Mis pedidos",
  "cuenta.pedidos.vacio": "Todavía no hiciste ningún pedido con esta cuenta.",
  "cuenta.pedidos.mira": "Mirá lo que hay",
  "cuenta.pedidos.invitada":
    "Si compraste antes de crear esta cuenta, esos pedidos no aparecen todavía. Seguilos con el link que te mandamos por WhatsApp.",
  "cuenta.datos": "Mis datos",
  "cuenta.datos.whatsapp": "WhatsApp:",
  "cuenta.datos.whatsappNota":
    "Es la llave de tu cuenta, así que no se cambia desde acá. Escribinos si lo necesitás.",
  "cuenta.datos.novedades": "Quiero recibir novedades y promociones por WhatsApp.",
  "cuenta.datos.guardar": "Guardar",
  "cuenta.datos.guardando": "Guardando…",
  "cuenta.datos.guardado": "Listo, guardamos tus datos.",

  "cuenta.entrar.meta": "Entrar a tu cuenta",
  "cuenta.entrar.titulo": "Entrá a tu cuenta",
  "cuenta.entrar.bajada": "Para ver tus pedidos y no volver a tipear tus datos.",
  "cuenta.entrar.identificador": "WhatsApp o email",
  "cuenta.entrar.password": "Contraseña",
  "cuenta.entrar.boton": "Entrar",
  "cuenta.entrar.entrando": "Entrando…",
  "cuenta.entrar.sinCuenta": "¿Todavía no tenés cuenta?",
  "cuenta.entrar.crear": "Creá una",
  "cuenta.entrar.noHaceFalta":
    "No hace falta cuenta para comprar. Podés hacer tu pedido como invitada y seguirlo con el link que te mandamos por WhatsApp.",

  "cuenta.codigo.titulo": "¿No te acordás la contraseña?",
  "cuenta.codigo.bajada": "Te mandamos un código por WhatsApp y entrás con eso.",
  "cuenta.codigo.pedir": "Mandame un código",
  "cuenta.codigo.mandando": "Mandando…",
  "cuenta.codigo.aviso":
    "Si hay una cuenta con ese WhatsApp, te mandamos un código de 6 dígitos. Vence en 10 minutos.",
  "cuenta.codigo.label": "Código",
  "cuenta.codigo.placeholder": "123456",
  "cuenta.codigo.otroNumero": "Usar otro número",

  "cuenta.registro.meta": "Crear cuenta",
  "cuenta.registro.titulo": "Creá tu cuenta",
  "cuenta.registro.bajada": "Guardamos tus datos para que la próxima compra sea de dos toques.",
  "cuenta.registro.telefonoAyuda": "Es con lo que entrás, y por donde te avisamos de tu pedido.",
  "cuenta.registro.passwordAyuda": "Al menos {minimo} caracteres, con letras y números.",
  "cuenta.registro.boton": "Crear cuenta",
  "cuenta.registro.creando": "Creando…",
  "cuenta.registro.yaTenes": "¿Ya tenés cuenta?",
  "cuenta.registro.entrar": "Entrá",
  "cuenta.registro.noHaceFalta":
    "No hace falta cuenta para comprar. Esto es sólo para no volver a tipear tu dirección.",

  "cuenta.guardarDatos.titulo": "¿Guardamos tus datos para la próxima?",
  "cuenta.guardarDatos.texto":
    "Con una cuenta no volvés a tipear tu dirección, y tenés todos tus pedidos en un solo lugar. Tu pedido {numero} ya está hecho: esto es sólo para la próxima vez.",
  "cuenta.guardarDatos.boton": "Crear mi cuenta",
} as const satisfies Record<string, string>;
