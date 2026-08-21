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

  // -------------------------------------------------------------------------
  // Errores del dominio (PR S) — los que una persona lee
  //
  // Viven acá y no adentro de cada `throw` por lo mismo que el resto: si no,
  // los textos que la compradora ve quedan repartidos entre transacciones y
  // bloqueos de fila, y quien traduce tiene que ir a buscarlos ahí.
  // -------------------------------------------------------------------------
  "error.checkout.telefono": "El número de WhatsApp no parece paraguayo.",
  "error.checkout.ruc": "RUC inválido: {motivo}",
  "error.checkout.ci": "CI inválida: {motivo}",
  "error.checkout.carritoVacio": "El carrito está vacío.",
  "error.checkout.noDisponible": "Algunos productos ya no están disponibles. Revisá tu carrito.",
  "error.checkout.noPude": "No pude crear el pedido. Probá de nuevo.",
  "error.checkout.totalCambio":
    "El total cambió de {antes} a {despues} mientras completabas los datos. Revisalo y confirmá de nuevo.",
  "error.checkout.cuponCaido":
    "El código de descuento ya no se puede usar. Revisá el total y confirmá de nuevo.",
  "error.checkout.demasiadosIntentos":
    "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.",
  "error.checkout.revisaDatos": "Revisá los datos del formulario.",
  "error.checkout.sinTarjeta": "El pago con tarjeta no está disponible en este momento.",
  "error.checkout.generico": "No pudimos crear el pedido. Probá de nuevo en un momento.",

  "error.comprobante.vacio": "El archivo está vacío.",
  "error.comprobante.pesado": "El comprobante no puede pesar más de 5 MB.",
  "error.comprobante.formato": "Subí una foto (JPG o PNG) o un PDF del comprobante.",
  "error.comprobante.noEsTransferencia": "Este pedido no se paga por transferencia.",
  "error.comprobante.noEsperaComprobante": "Este pedido ya no está esperando el comprobante.",
  "error.comprobante.pedidoNoEncontrado": "No encontramos ese pedido.",
  "error.comprobante.elegiArchivo": "Elegí el archivo del comprobante.",
  "error.comprobante.generico": "No pudimos subir el comprobante. Probá de nuevo.",
  "error.comprobante.demasiados":
    "Ya subiste {maximo} comprobantes para este pedido. Escribinos por WhatsApp.",
  "error.comprobante.sinMotivo":
    "Escribí el motivo del rechazo: el comprador lo ve y necesita saber qué corregir.",
  "error.comprobante.noExiste": "No encontramos ese comprobante.",
  "error.comprobante.yaAprobado": "Ese comprobante ya estaba aprobado.",
  "error.comprobante.yaRechazado": "Ese comprobante ya estaba rechazado.",

  "error.buscarPedido.noEncontrado":
    "No encontramos un pedido con esos datos. Revisá el número y el teléfono que usaste al comprar.",
  "error.buscarPedido.demasiados.uno":
    "Demasiados intentos. Probá de nuevo en {n} minuto, o escribinos por WhatsApp.",
  "error.buscarPedido.demasiados.varios":
    "Demasiados intentos. Probá de nuevo en {n} minutos, o escribinos por WhatsApp.",

  "error.cuenta.telefono": "Ese número de WhatsApp no parece paraguayo.",
  "error.cuenta.nombre": "Poné tu nombre completo.",
  "error.cuenta.yaExiste": "Ya hay una cuenta con ese WhatsApp o ese email. Probá entrar.",
  "error.cuenta.emailUsado": "Ese email ya está usado por otra cuenta.",
  "error.cuenta.noPude": "No pudimos crear la cuenta. Probá de nuevo.",
  "error.cuenta.codigoNoPude": "No pude generar un código. Probá de nuevo.",

  // -------------------------------------------------------------------------
  // Mensajes de WhatsApp que el comercio le manda al comprador (PR S)
  //
  // Nunca llevan el detalle de lo comprado: un WhatsApp llega a la pantalla de
  // bloqueo del teléfono, que puede estar sobre una mesa con más gente
  // alrededor. Al traducirlos, no agregar ítems acá.
  // -------------------------------------------------------------------------
  "wa.seguimiento":
    "Hola {nombre}! Te escribo por tu pedido {numero} ({total}). Podés seguirlo acá: {url}",
  "wa.recuperar.vencido":
    "Hola {nombre}! Tu pedido {numero} quedó sin pagar y se venció la reserva. Si todavía lo querés, avisanos y lo revisamos según disponibilidad.",
  "wa.recuperar.rechazado":
    "Hola {nombre}! No pudimos validar el comprobante de tu pedido {numero}. Entrá al link de abajo, mirá el motivo y subí uno nuevo.",
  "wa.recuperar.pendiente":
    "Hola {nombre}! Te recuerdo tu pedido {numero}, que quedó pendiente de pago.",
  "wa.recuperar.total": "Total: {total}",
  "wa.recuperar.paraTransferir": "Para transferir:",
  "wa.recuperar.banco": "{banco} — {tipoCuenta}",
  "wa.recuperar.titular": "Titular: {titular}",
  "wa.recuperar.ruc": "RUC: {ruc}",
  "wa.recuperar.cuenta": "Cuenta: {cuenta}",
  "wa.recuperar.subiComprobante": "Cuando pagues, subí el comprobante acá: {url}",

  // -------------------------------------------------------------------------
  // Errores del panel (PR R) — los lee el dueño, no la compradora
  // -------------------------------------------------------------------------
  "adminError.sesionCerrada": "Se cerró tu sesión. Volvé a entrar.",
  "adminError.generico": "No pudimos completar la acción. Probá de nuevo.",

  "adminError.categoria.nombreCorto": "El nombre necesita al menos 2 caracteres.",
  "adminError.categoria.nombreLargo": "El nombre no puede pasar los 120 caracteres.",
  "adminError.categoria.sinUrl":
    "De ese nombre no sale ninguna URL. Escribí el slug a mano, con letras y números.",
  "adminError.categoria.slugLargo": "El slug no puede pasar los 120 caracteres.",
  "adminError.categoria.urlRepetida": "Ya hay una categoría con la URL \"{slug}\".",
  "adminError.categoria.urlRepetidaOtra": "Ya hay otra categoría con la URL \"{slug}\".",
  "adminError.categoria.noPude": "No pude crear la categoría.",
  "adminError.categoria.noExiste": "Esa categoría no existe.",

  "adminError.envio.nombreCorto": "El nombre necesita al menos 2 caracteres.",
  "adminError.envio.nombreLargo": "El nombre no puede pasar los 160 caracteres.",
  "adminError.envio.sinSlug": "De ese nombre no sale ningún identificador. Escribí el slug a mano.",
  "adminError.envio.slugLargo": "El slug no puede pasar los 120 caracteres.",
  "adminError.envio.ciudadLarga": "\"{ciudad}…\" es demasiado largo para una ciudad.",
  "adminError.envio.noEsNumero": "{campo} tiene que ser un número.",
  "adminError.envio.noEsEntero": "{campo} va en guaraníes enteros, sin centavos.",
  "adminError.envio.precioLabel": "El precio del envío",
  "adminError.envio.umbralLabel": "El umbral de envío gratis",
  "adminError.envio.precioNegativo": "El precio del envío no puede ser negativo.",
  "adminError.envio.umbralCero":
    "Un umbral de ₲0 haría gratis todos los envíos de la zona. Si es lo que querés, poné el precio en ₲0 y dejá el umbral vacío.",
  "adminError.envio.ciudadRepetida":
    "\"{ciudad}\" ya está en la zona \"{zona}\". Una ciudad va en una sola zona: con dos, el precio del envío depende del orden de las zonas y nadie se entera.",
  "adminError.envio.slugRepetido": "Ya hay una zona con el identificador \"{slug}\".",
  "adminError.envio.slugRepetidoOtra": "Ya hay otra zona con el identificador \"{slug}\".",
  "adminError.envio.noPude": "No pude crear la zona.",
  "adminError.envio.noExiste": "Esa zona no existe.",
  "adminError.envio.ultimaActiva":
    "Es la última zona activa: sin ninguna, la tienda pasa a cobrar ₲0 de envío a todo el país sin avisar en ninguna pantalla. Si querés dejar de cobrar el flete, poné el precio de esta zona en ₲0.",

  // Datos bancarios (PR T). No son plata —no entran en ningún total— pero son
  // a dónde va la plata de otra persona, así que el RUC se verifica de verdad.
  "adminError.banco.campo.banco": "el banco",
  "adminError.banco.campo.titular": "el titular",
  "adminError.banco.campo.ruc": "el RUC",
  "adminError.banco.campo.cuenta": "el número de cuenta",
  "adminError.banco.campo.tipoCuenta": "el tipo de cuenta",
  "adminError.banco.incompleto":
    "Faltan {campos}. Los cinco datos se guardan juntos: media cuenta cargada muestra un banco sin número, y esa transferencia se hace mal.",
  "adminError.banco.largo": "{campo} no puede pasar los {maximo} caracteres.",
  "adminError.banco.ruc":
    "El RUC no es válido ({motivo}). Revisá el dígito verificador: va después del guion, y un RUC mal tipeado rompe la transferencia en el banco, no acá.",
  "adminError.banco.qrVacio": "No llegó ninguna imagen del QR.",
  "adminError.banco.sinDatosParaQr":
    "Guardá primero los datos de la cuenta: el QR solo no se muestra en ningún lado.",
  "adminError.banco.noExiste": "Todavía no hay datos bancarios cargados.",
  "adminError.banco.elegiQr": "Elegí la imagen del QR.",

  "adminError.usuario.email": "Revisá el email.",
  "adminError.password.corta": "La contraseña debe tener al menos {minimo} caracteres",
  "adminError.password.simple": "La contraseña debe combinar letras y números",
  "adminError.usuario.emailRepetido": "Ya hay un usuario con ese email.",
  "adminError.usuario.noPude": "No pude crear el usuario.",
  "adminError.usuario.noExiste": "Ese usuario no existe.",
  "adminError.usuario.noTeDesactives":
    "No podés desactivar tu propia cuenta: quedarías afuera del panel sin forma de volver.",
  "adminError.usuario.ultimoDueno":
    "Es el último dueño activo: la tienda quedaría sin nadie que pueda gestionar usuarios. Nombrá otro dueño primero.",
  "adminError.usuario.noTeDegrades":
    "No podés quitarte a vos mismo el rol de dueño: perderías el acceso a esta pantalla.",
  "adminError.usuario.ultimoDuenoDegradar":
    "Es el último dueño activo: si lo degradás, nadie puede volver a nombrar dueños. Nombrá otro dueño primero.",

  "adminError.cupon.codigoCorto": "El código necesita al menos 3 caracteres.",
  "adminError.cupon.valor": "El valor tiene que ser un entero mayor que cero.",
  "adminError.cupon.porcentaje": "Un porcentaje no puede pasar de 100.",
  "adminError.cupon.fechas": "La fecha de inicio es posterior a la de fin.",
  "adminError.cupon.topeUsos": "El tope de usos tiene que ser un entero mayor que cero.",
  "adminError.cupon.topeCliente": "El tope por cliente tiene que ser un entero mayor que cero.",
  "adminError.cupon.codigoRepetido": "Ya existe un cupón con ese código.",
  "adminError.cupon.codigoRepetidoOtro": "Ya existe otro cupón con ese código.",
  "adminError.cupon.noPude": "No pude crear el cupón.",
  "adminError.cupon.noExiste": "Ese cupón no existe.",
  "adminError.cupon.yaUsado":
    "Ese cupón ya se usó en pedidos reales: no se le puede cambiar el código ni el descuento. Desactivalo y creá uno nuevo.",

  "adminError.producto.noPude": "No pude crear el producto.",
  "adminError.producto.noExiste": "Ese producto no existe.",
  "adminError.producto.slugRepetido": "Ya hay un producto con el slug \"{slug}\".",
  "adminError.producto.skuRepetido": "El SKU \"{sku}\" ya está usado por otra variante.",
  "adminError.producto.varianteNoExiste": "Esa variante no existe.",
  "adminError.stock.sinMotivo": "Escribí el motivo del ajuste (ej: rotura, conteo, reposición).",
  "adminError.stock.deltaCero": "El ajuste tiene que ser un número entero distinto de cero.",
  "adminError.stock.negativo": "No podés descontar {cantidad}: hay {stock} en stock.",
  "adminError.foto.vacia": "El archivo está vacío.",
  "adminError.foto.pesada": "La foto no puede pesar más de 5 MB.",
  "adminError.foto.formato": "Subí una foto en JPG, PNG o WebP.",

  "adminError.pago.yaDevuelto":
    "Ese pago ya está marcado como devuelto: no corresponde revivir el pedido.",
  "adminError.pago.noAcreditado": "Ese pago no está acreditado: no hay nada que recuperar.",
  "adminError.pago.pedidoCancelado":
    "Ese pedido está cancelado y no se revive solo: si el comprador todavía lo quiere, armá uno nuevo. Si no, marcá el pago como devuelto.",
  "adminError.pago.sinMotivo":
    "Escribí por qué se devuelve: queda en el historial del pedido y es lo único que va a explicar esta plata dentro de seis meses.",
  "adminError.pago.noEncontrado": "No encontramos ese pago.",
  "adminError.pago.pedidoNoExiste": "El pedido de ese pago ya no existe.",
  "adminError.pago.nadaQueDevolver": "Ese pago no está acreditado: no hay nada que devolver todavía.",
  "adminError.pago.pedidoRevivio":
    "Ese pedido volvió a estar vivo ({estado}) desde que abriste esta pantalla. Recargá y mirá el pedido antes de marcar una devolución.",

  // Validación de los formularios del panel.
  "adminError.revisaDatos": "Revisá los datos.",
  "adminError.noEntendi.pedido": "No entendí qué querés hacer con el pedido.",
  "adminError.noEntendi.comprobante": "Faltan datos para revisar el comprobante.",
  "adminError.noEntendi.pago": "No entendí de qué pago se trata.",
  "adminError.noEntendi.devolucion": "Faltan datos para registrar la devolución.",
  "adminError.noEntendi.categoria": "No entendí qué categoría cambiar.",
  "adminError.noEntendi.zona": "No entendí qué zona cambiar.",
  "adminError.noEntendi.cupon": "No entendí qué cupón cambiar.",
  "adminError.noEntendi.usuario": "No entendí qué usuario cambiar.",
  "adminError.noEntendi.rol": "No entendí qué rol poner.",
  "adminError.noEntendi.mover": "No entendí hacia dónde mover.",
  "adminError.comprobanteInvalido": "Comprobante inválido.",
  "adminError.productoInvalido": "Producto inválido.",
  "adminError.elegiFoto": "Elegí la foto.",
  "adminError.imagenInvalida": "Imagen inválida.",
  "adminError.filtros": "Revisá los filtros antes de bajar el archivo.",
  "adminError.sinCuentasClientes": "Esta tienda no tiene cuentas de cliente.",

  "adminError.login.generico": "Email o contraseña incorrectos.",
  "adminError.login.demasiados.uno": "Demasiados intentos. Esperá {n} minuto.",
  "adminError.login.demasiados.varios": "Demasiados intentos. Esperá {n} minutos.",

  "adminForm.nombreProducto": "Poné el nombre del producto",
  "adminForm.sku": "Falta el SKU",
  "adminForm.etiquetaVariante": "Poné una etiqueta: Talle M, 500 ml…",
  "adminForm.precioEntero": "El precio va en guaraníes enteros",
  "adminForm.umbralEntero": "El umbral va en guaraníes enteros",
  "adminForm.ajusteCero": "El ajuste no puede ser cero",
  "adminForm.motivoAjuste": "Escribí el motivo del ajuste",
  "adminForm.nombreCategoria": "Poné el nombre de la categoría",
  "adminForm.nombreZona": "Poné el nombre de la zona",
  "adminForm.banco.banco": "Poné el nombre del banco",
  "adminForm.banco.titular": "Poné el titular de la cuenta",
  "adminForm.banco.ruc": "Poné el RUC del titular",
  "adminForm.banco.cuenta": "Poné el número de cuenta",
  "adminForm.banco.tipoCuenta": "Poné el tipo de cuenta",
  "adminForm.codigoCupon": "El código necesita al menos 3 caracteres",
  "adminForm.valorEntero": "El valor va en enteros",
  "adminForm.email": "Revisá el email",
  "adminForm.passwordTemporal": "Poné una contraseña temporal",
  "adminForm.passwordNueva": "Poné la contraseña nueva",

  // Cabeceras de los CSV. Se traducen porque el archivo lo abre el dueño en su
  // planilla; los datos de adentro no cambian.
  "csv.pedido.numero": "Nº de pedido",
  "csv.pedido.fecha": "Fecha",
  "csv.pedido.cliente": "Cliente",
  "csv.whatsapp": "WhatsApp",
  "csv.pedido.estado": "Estado",
  "csv.pedido.metodo": "Método de pago",
  "csv.pedido.total": "Total (₲)",
  "csv.producto.sku": "SKU",
  "csv.producto.nombre": "Producto",
  "csv.producto.categoria": "Categoría",
  "csv.producto.variante": "Variante",
  "csv.producto.precio": "Precio (₲)",
  "csv.producto.stock": "Stock",
  "csv.cliente.nombre": "Nombre",
  "csv.cliente.email": "Email",
  "csv.cliente.acepto": "Aceptó el",

  // -------------------------------------------------------------------------
  // Estados del pedido (PR R)
  //
  // Dos traducciones del mismo ENUM, y las dos son legítimas: el panel dice
  // qué tiene que hacer el dueño ("Verificar comprobante") y la página del
  // pedido le cuenta al comprador qué pasa con su plata ("Comprobante en
  // revisión"). Son el mismo estado visto desde los dos lados del mostrador.
  // -------------------------------------------------------------------------
  "estado.panel.pendiente_pago": "Esperando pago",
  "estado.panel.esperando_verificacion": "Verificar comprobante",
  "estado.panel.pagado": "Pagado",
  "estado.panel.preparando": "Preparando",
  "estado.panel.enviado": "Enviado",
  "estado.panel.entregado": "Entregado",
  "estado.panel.rechazado": "Comprobante rechazado",
  "estado.panel.vencido": "Vencido",
  "estado.panel.cancelado": "Cancelado",
  "estado.panel.reembolsado": "Reembolsado",

  "estado.comprador.pendiente_pago": "Esperando tu pago",
  "estado.comprador.esperando_verificacion": "Comprobante en revisión",
  "estado.comprador.pagado": "Pago confirmado",
  "estado.comprador.preparando": "Preparando tu pedido",
  "estado.comprador.enviado": "En camino",
  "estado.comprador.entregado": "Entregado",
  "estado.comprador.rechazado": "Comprobante rechazado",
  "estado.comprador.vencido": "Vencido",
  "estado.comprador.cancelado": "Cancelado",
  "estado.comprador.reembolsado": "Reembolsado",

  "metodo.transferencia": "Transferencia / QR",
  "metodo.contra_entrega": "Contra entrega",
  "metodo.tarjeta": "Tarjeta",

  "transicion.pagado": "Marcar como pagado",
  "transicion.preparando": "Empezar a preparar",
  "transicion.enviado": "Marcar como enviado",
  "transicion.entregado": "Marcar como entregado",
  "transicion.cancelado": "Cancelar pedido",
  "transicion.vencido": "Marcar como vencido",
  "transicion.rechazado": "Rechazar comprobante",
  "transicion.reembolsado": "Marcar como reembolsado",
  "transicion.pendiente_pago": "Volver a esperando pago",
  "transicion.esperando_verificacion": "Volver a verificación",

  // -------------------------------------------------------------------------
  // Panel (PR R)
  // -------------------------------------------------------------------------
  "panel.titulo": "Panel",
  "panel.salir": "Salir",
  "panel.saliendo": "Saliendo…",
  "panel.nav.resumen": "Resumen",
  "panel.nav.pedidos": "Pedidos",
  "panel.nav.productos": "Productos",
  "panel.nav.clientes": "Clientes",
  "panel.nav.cupones": "Cupones",
  "panel.nav.actividad": "Actividad",
  "panel.nav.categorias": "Categorías",
  "panel.nav.envios": "Envíos",
  "panel.nav.banco": "Banco",
  "panel.nav.usuarios": "Usuarios",

  "panel.login.meta": "Entrar",
  "panel.login.email": "Email",
  "panel.login.password": "Contraseña",
  "panel.login.entrar": "Entrar",
  "panel.login.entrando": "Entrando…",

  "panel.csv.descargar": "Descargar CSV",
  "panel.csv.preparando": "Preparando…",
  "panel.csv.filas.uno": "{n} fila.",
  "panel.csv.filas.varios": "{n} filas.",
  "panel.csv.truncado":
    "Bajé las primeras {n} filas. Filtrá por fecha para llevarte el resto.",

  "panel.acciones.motivo": "Motivo (queda en el historial del pedido)",
  "panel.acciones.motivo.placeholder": "Ej: el cliente pidió cancelar",
  "panel.acciones.confirmar": "Confirmar",
  "panel.acciones.guardando": "Guardando…",
  "panel.acciones.volver": "Volver",
  "panel.acciones.marcado": "Pedido marcado como “{estado}”.",

  "panel.filtros.buscarPedido": "Nº de pedido, WhatsApp o RUC",
  "panel.filtros.buscarPedido.label": "Buscar pedido",
  "panel.filtros.buscar": "Buscar",
  "panel.filtros.mas": "Más filtros",
  "panel.filtros.ocultar": "Ocultar filtros",
  "panel.filtros.activos": " ({n})",
  "panel.filtros.estado": "Estado",
  "panel.filtros.metodo": "Método de pago",
  "panel.filtros.desde": "Desde",
  "panel.filtros.hasta": "Hasta",
  "panel.filtros.todos": "Todos",
  "panel.filtros.aplicar": "Aplicar",
  "panel.filtros.limpiar": "Limpiar",
  "panel.filtros.porEstado": "Filtrar por estado",
  "panel.filtros.categoria": "Categoría",
  "panel.filtros.todasCategorias": "Todas las categorías",
  "panel.filtros.ordenar": "Ordenar",

  "panel.orden.recientes": "Editados hace poco",
  "panel.orden.stock": "Stock: menor primero",
  "panel.orden.precioAsc": "Precio: menor a mayor",
  "panel.orden.precioDesc": "Precio: mayor a menor",

  "panel.comprobante.pending": "Sin revisar",
  "panel.comprobante.approved": "Aprobado",
  "panel.comprobante.rejected": "Rechazado",
  "panel.comprobante.motivo": "Motivo: {motivo}",
  "panel.comprobante.ver": "Ver comprobante",
  "panel.comprobante.actualizar": "Actualizar vista",
  "panel.comprobante.aprobar": "Aprobar",
  "panel.comprobante.rechazar": "Rechazar",
  "panel.comprobante.aprobado": "Comprobante aprobado. El pedido pasó a pagado.",
  "panel.comprobante.rechazado": "Comprobante rechazado. El cliente puede subir otro.",
  "panel.comprobante.motivoRechazo": "Motivo del rechazo — el cliente lo lee",
  "panel.comprobante.motivoRechazo.placeholder": "Ej: el monto transferido no coincide",
  "panel.comprobante.confirmarRechazo": "Confirmar rechazo",
  "panel.comprobante.abrirPdf": "Abrir el PDF del comprobante",
  "panel.comprobante.alt": "Comprobante de transferencia",
  "panel.comprobante.linkVence":
    "El link vence en un par de minutos. Si no carga, tocá “Actualizar vista”.",

  "panel.pagos.revivido": "{numero} volvió a estar cobrado.",
  "panel.pagos.yaCobrado": "{numero} ya estaba cobrado.",
  "panel.pagos.devolucionAnotada": "Devolución anotada en {numero}.",
  "panel.pagos.detalle": "{proveedor} · pedido en “{estado}” · {fecha}",
  "panel.pagos.motivo": "Motivo de la devolución (queda en el historial del pedido)",
  "panel.pagos.motivo.placeholder": "Ej: transferí de vuelta por SPI el 12/8",
  "panel.pagos.aclaracion":
    "Esto no le transfiere la plata a nadie: anota que vos ya la devolviste, y cancela el pedido.",
  "panel.pagos.confirmarDevolucion": "Confirmar devolución",
  "panel.pagos.reintentar": "Reintentar el pedido",
  "panel.pagos.marcarDevuelto": "Marcar como devuelto",

  "panel.producto.guardado": "Producto guardado.",
  "panel.producto.nombre": "Nombre",
  "panel.producto.slug": "Slug (la URL del producto)",
  "panel.producto.descripcion": "Descripción",
  "panel.producto.categoria": "Categoría",
  "panel.producto.elegiCategoria": "Elegí una",
  "panel.producto.marca": "Marca",
  "panel.producto.iva": "IVA",
  "panel.producto.iva10": "10% (lo habitual)",
  "panel.producto.iva5": "5% (canasta básica)",
  "panel.producto.iva0": "Exento",
  "panel.producto.activo": "Activo",
  "panel.producto.publicado": "Publicado en la tienda",
  "panel.producto.publicadoAyuda":
    "Un producto sin publicar no aparece en el catálogo ni en la búsqueda.",
  "panel.producto.guardar": "Guardar producto",

  "panel.fotos.alt": "Foto del producto",
  "panel.fotos.quitar": "Quitar",
  "panel.fotos.quitada": "Foto quitada.",
  "panel.fotos.subida": "Foto subida.",
  "panel.fotos.vacio": "Todavía no hay fotos: en la tienda se ve un placeholder de color.",
  "panel.fotos.agregar": "Agregar foto (JPG, PNG o WebP, hasta 5 MB)",
  "panel.fotos.descripcion": "Descripción de la foto (accesibilidad y SEO)",
  "panel.fotos.descripcion.placeholder": "Remera azul de frente",
  "panel.fotos.subir": "Subir foto",
  "panel.fotos.subiendo": "Subiendo…",

  "panel.variante.agregar": "Agregar variante",
  "panel.variante.vacio":
    "Un producto sin variantes no se puede comprar: cargá al menos una con su precio.",
  "panel.variante.stockLinea":
    "{stock} en stock · {reservados} reservados · {disponibles} disponibles",
  "panel.variante.inactiva": " · inactiva",
  "panel.variante.editar": "Editar",
  "panel.variante.cancelar": "Cancelar",
  "panel.variante.ajustarStock": "Ajustar stock",
  "panel.variante.guardada": "Variante guardada.",
  "panel.variante.etiqueta": "Etiqueta",
  "panel.variante.etiqueta.placeholder": "Talle M",
  "panel.variante.sku": "SKU",
  "panel.variante.sku.placeholder": "CAM-M-AZ",
  "panel.variante.precio": "Precio en ₲ (IVA incluido)",
  "panel.variante.precioTachado": "Precio tachado (opcional)",
  "panel.variante.activa": "Activa",
  "panel.variante.arrancaEnCero":
    "Arranca con 0 en stock: se carga con “Ajustar stock”, que pide el motivo.",
  "panel.variante.guardar": "Guardar variante",

  "panel.stock.ajustado": "Stock ajustado: quedan {n}.",
  "panel.stock.agregar": "Agregar",
  "panel.stock.quitar": "Quitar",
  "panel.stock.cantidad": "Cantidad",
  "panel.stock.motivo": "Motivo (obligatorio)",
  "panel.stock.motivo.placeholder": "Conteo de depósito / rotura / reposición",

  "panel.actividad.quien": "Quién",
  "panel.actividad.cualquiera": "Cualquiera",
  "panel.actividad.sistema": "El sistema (cron, Pagopar, la compradora)",
  "panel.actividad.desactivado": " (desactivado)",
  "panel.actividad.tipo": "Tipo",
  "panel.actividad.todo": "Todo",
  "panel.actividad.tipoPedido": "Cambios de pedido",
  "panel.actividad.tipoStock": "Ajustes de stock",
  "panel.actividad.hastaIncluye": "Incluye todo ese día.",
  "panel.actividad.filtrar": "Filtrar",

  "panel.abm.noPudimos": "No pudimos hacer eso.",
  "panel.abm.guardarCambios": "Guardar cambios",
  "panel.abm.cancelar": "Cancelar",
  "panel.abm.editar": "Editar",
  "panel.abm.desactivar": "Desactivar",
  "panel.abm.reactivar": "Reactivar",
  "panel.abm.activar": "Activar",
  "panel.abm.ordenActualizado": "Orden actualizado.",
  "panel.abm.subir": "Subir {nombre}",
  "panel.abm.bajar": "Bajar {nombre}",

  "panel.categoria.crear": "Crear categoría",
  "panel.categoria.vacio":
    "Todavía no hay categorías. Sin al menos una, no se puede cargar ningún producto: cada producto pertenece a una.",
  "panel.categoria.desactivada": " · desactivada",
  "panel.categoria.productos.uno": "{n} producto",
  "panel.categoria.productos.varios": "{n} productos",
  "panel.categoria.enVidriera": " · {n} en la vidriera",
  "panel.categoria.confirmar": "¿Desactivar “{nombre}”?",
  "panel.categoria.confirmar.sinPublicados":
    "No hay productos publicados en esta categoría, así que la vidriera no cambia. Sólo desaparece del menú y /categoria/{slug} pasa a dar 404.",
  "panel.categoria.confirmar.conPublicados.uno":
    "Su {n} producto publicado deja de verse en toda la tienda: home, buscador, sitemap y su propia ficha. No se borra nada — los productos quedan como están y vuelven solos cuando reactivés la categoría.",
  "panel.categoria.confirmar.conPublicados.varios":
    "Sus {n} productos publicados dejan de verse en toda la tienda: home, buscador, sitemap y sus propias fichas. No se borra nada — los productos quedan como están y vuelven solos cuando reactivés la categoría.",
  "panel.categoria.siDesactivar": "Sí, desactivar",
  "panel.categoria.desactivando": "Desactivando…",
  "panel.categoria.desactivadaOk": "Categoría desactivada.",
  "panel.categoria.reactivadaOk": "Categoría reactivada.",
  "panel.categoria.actualizada": "Categoría actualizada.",
  "panel.categoria.creada": "Categoría creada.",
  "panel.categoria.editarTitulo": "Editar {nombre}",
  "panel.categoria.nueva": "Nueva categoría",
  "panel.categoria.nombre": "Nombre",
  "panel.categoria.nombreAyuda": "Lo que se lee en el menú de la tienda.",
  "panel.categoria.url": "URL",
  "panel.categoria.urlPreview": "Queda /categoria/{slug}",
  "panel.categoria.avisoUrl":
    "Estás cambiando la URL. La anterior (/categoria/{slug}) va a dar 404: los links compartidos por WhatsApp y lo que Google tenga indexado dejan de funcionar. El nombre se puede cambiar sin tocar la URL — para eso son dos campos.",

  "panel.zona.crear": "Crear zona",
  "panel.zona.vacio":
    "Todavía no hay zonas de envío. Mientras no haya ninguna activa, el checkout cobra ₲0 de flete y lo dice en pantalla — está bien para una demo y no para cobrar de verdad.",
  "panel.zona.comodin":
    "Una ciudad que no esté en ninguna lista se cotiza como {zona} ({precio}), que es la zona activa más cara. El checkout se lo avisa a la compradora.",
  "panel.zona.desactivada": " · desactivada",
  "panel.zona.envioGratis": "Envío gratis",
  "panel.zona.sinCiudades": "Sin ciudades: sólo se usa como comodín cuando es la activa más cara.",
  "panel.zona.ciudades.uno": "{n} ciudad: {lista}",
  "panel.zona.ciudades.varios": "{n} ciudades: {lista}",
  "panel.zona.masCiudades": ", +{n} más",
  "panel.zona.gratisDesde": "Gratis a partir de {monto} de subtotal.",
  "panel.zona.desactivadaOk": "Zona desactivada.",
  "panel.zona.activadaOk": "Zona activada.",
  "panel.zona.actualizada": "Zona actualizada.",
  "panel.zona.creada": "Zona creada.",
  "panel.zona.editarTitulo": "Editar {nombre}",
  "panel.zona.nueva": "Nueva zona",
  "panel.zona.nombre": "Nombre",
  "panel.zona.nombreAyuda": "Lo lee la compradora en el checkout: “Envío — Gran Asunción”.",
  "panel.zona.precio": "Precio del envío",
  "panel.zona.precioAyuda": "Guaraníes enteros, IVA 10% incluido como el resto de los precios.",
  "panel.zona.ciudadesLabel": "Ciudades",
  "panel.zona.ciudades.placeholder": "Asunción\nLambaré\nFernando de la Mora",
  "panel.zona.ciudadesAyuda": "Una por línea o separadas por coma — pegá la lista como la tengas. ",
  "panel.zona.ciudadesAyuda.ninguna":
    "Sin ninguna, esta zona nunca coincide con una ciudad: sólo se cobra si es la activa más cara, o sea como comodín del interior.",
  "panel.zona.ciudadesAyuda.algunas":
    "Van {n}. Los acentos y las mayúsculas no importan al comparar; se guarda como lo escribiste.",
  "panel.zona.gratisLabel": "Envío gratis desde",
  "panel.zona.gratisAyuda": "Sobre el subtotal, sin el envío. Vacío = esta zona no lo ofrece.",
  "panel.zona.identificador": "Identificador",
  "panel.zona.identificadorAyuda":
    "Interno: no sale en ninguna URL. Sirve para distinguir dos zonas que se llamen parecido.",

  "panel.rol.owner": "Dueño",
  "panel.rol.staff": "Encargado",
  "panel.rol.vendedor": "Vendedor",
  "panel.rol.owner.ayuda": "Todo, incluidos usuarios, devoluciones y descargas de CSV.",
  "panel.rol.staff.ayuda": "Pedidos, comprobantes, productos y stock. Sin devoluciones ni CSV.",
  "panel.rol.vendedor.ayuda": "Ve pedidos y los despacha. Sin montos, comprobantes ni stock.",
  "panel.rol.label": "Rol",
  "panel.rol.de": "Rol de {email}",

  "panel.usuario.agregar": "Agregar usuario",
  "panel.usuario.nuevo": "Nuevo usuario",
  "panel.usuario.creado": "Usuario creado. Pasale la contraseña por un canal seguro.",
  "panel.usuario.email": "Email",
  "panel.usuario.nombre": "Nombre",
  "panel.usuario.passwordTemporal": "Contraseña temporal",
  "panel.usuario.passwordAyuda":
    "Al menos {minimo} caracteres, con letras y números. Se la pasás vos por WhatsApp o en persona — la tienda no manda emails. Que la cambie al entrar.",
  "panel.usuario.crear": "Crear usuario",
  "panel.usuario.creando": "Creando…",
  "panel.usuario.vos": " (vos)",
  "panel.usuario.desactivado": " · desactivado",
  "panel.usuario.ultimoIngreso": "Último ingreso: {fecha}",
  "panel.usuario.nuncaEntro": "Nunca entró",
  "panel.usuario.passwordNueva": "Contraseña nueva para {email}",
  "panel.usuario.cambiarPassword": "Cambiar contraseña",
  "panel.usuario.passwordCambiada": "Contraseña cambiada. Pasásela por un canal seguro.",
  "panel.usuario.resetear": "Resetear contraseña",
  "panel.usuario.rolActualizado": "Rol actualizado.",
  "panel.usuario.desactivadoOk": "Usuario desactivado.",
  "panel.usuario.reactivadoOk": "Usuario reactivado.",
  "panel.usuario.tuCuenta":
    "Tu propia cuenta no se puede desactivar ni degradar desde acá: quedarías afuera del panel sin forma de volver.",

  "panel.cupon.tipo.porcentaje": "Porcentaje",
  "panel.cupon.tipo.monto_fijo": "Monto fijo",
  "panel.cupon.crear": "Crear cupón",
  "panel.cupon.vacio":
    "Todavía no hay cupones. Mientras no haya ninguno, el checkout no muestra el campo de descuento.",
  "panel.cupon.descuento": "{valor} de descuento",
  "panel.cupon.desactivado": " · desactivado",
  "panel.cupon.agotado": " · agotado",
  "panel.cupon.minimo": " · mínimo {monto}",
  "panel.cupon.desde": " · desde {fecha}",
  "panel.cupon.hasta": " · hasta {fecha}",
  "panel.cupon.soloClientes": " · sólo con cuenta",
  "panel.cupon.usos.uno": "{n} uso",
  "panel.cupon.usos.varios": "{n} usos",
  "panel.cupon.usosDe": " de {n}",
  "panel.cupon.discrepancia": " · ⚠ {n} pedidos lo usan",
  "panel.cupon.descontados": " · {monto} descontados",
  "panel.cupon.maxPorCliente": " · máx. {n} por cliente",
  "panel.cupon.desactivadoOk": "Cupón desactivado.",
  "panel.cupon.activadoOk": "Cupón activado.",
  "panel.cupon.actualizado": "Cupón actualizado.",
  "panel.cupon.creado": "Cupón creado.",
  "panel.cupon.editarTitulo": "Editar {codigo}",
  "panel.cupon.nuevo": "Nuevo cupón",
  "panel.cupon.codigo": "Código",
  "panel.cupon.codigoAyuda": "Se guarda en mayúsculas. Es lo que va a tipear la compradora.",
  "panel.cupon.porcentajeLabel": "Porcentaje (1 a 100)",
  "panel.cupon.montoLabel": "Monto en guaraníes",
  "panel.cupon.enterosAyuda": "Enteros. El guaraní no tiene céntimos.",
  "panel.cupon.tipoLabel": "Tipo",
  "panel.cupon.minimoLabel": "Mínimo de compra",
  "panel.cupon.minimoAyuda": "Sobre el subtotal, sin el envío.",
  "panel.cupon.topeLabel": "Tope de usos",
  "panel.cupon.topeAyuda": "Vacío = sin tope.",
  "panel.cupon.desdeLabel": "Desde",
  "panel.cupon.formatoFecha": "(dd/mm/aaaa)",
  "panel.cupon.desde.placeholder": "01/09/2026",
  "panel.cupon.hastaLabel": "Hasta",
  "panel.cupon.hasta.placeholder": "30/09/2026",
  "panel.cupon.hastaAyuda": "Incluye todo ese día.",
  "panel.cupon.maxClienteLabel": "Máximo por cliente",
  "panel.cupon.maxClienteAyuda":
    "Se cuenta por cuenta de cliente, o por WhatsApp si compró de invitada.",
  "panel.cupon.soloClientesLabel": "Sólo para quienes tengan cuenta",
  "panel.cupon.soloClientesAyuda":
    "Si esta tienda no tiene las cuentas de cliente prendidas, un cupón así no lo va a poder usar nadie.",

  "panel.login.titulo": "Panel del comercio",
  "panel.login.bajada": "Entrá con tu cuenta para ver los pedidos.",

  "panel.categorias.meta": "Categorías",
  "panel.categorias.titulo": "Categorías",
  "panel.categorias.bajada":
    "El menú de la tienda, en el orden en que se ve. Nada se borra: una categoría se desactiva, y con ella dejan de verse sus productos hasta que la vuelvas a prender.",

  "panel.envios.meta": "Envíos",
  "panel.envios.titulo": "Zonas de envío",
  "panel.envios.bajada":
    "Cuánto sale el flete a cada ciudad. Lo que cambies acá se cotiza de los próximos pedidos en adelante — los que ya se hicieron conservan el envío que la compradora aceptó pagar.",

  "panel.banco.meta": "Banco",
  "panel.banco.titulo": "Datos bancarios",
  "panel.banco.bajada":
    "A dónde transfieren tus compradoras. Lo que guardes acá es lo que muestra la página del pedido y lo que va en el WhatsApp de recuperación — sin redeploy y sin tocar ningún archivo.",
  "panel.banco.desdeEntorno":
    "Hoy la tienda muestra los datos que están cargados en el entorno del servidor: {banco}, {titular}, cuenta {cuenta}. Lo que guardes acá los reemplaza a partir de ese momento.",
  "panel.banco.sinNada":
    "Todavía no hay datos bancarios en ningún lado: la página del pedido avisa que faltan en vez de mostrar una cuenta. Cargalos acá y la transferencia queda habilitada.",
  "panel.banco.formTitulo": "La cuenta del comercio",
  "panel.banco.guardado": "Datos bancarios guardados.",
  "panel.banco.campo.banco": "Banco",
  "panel.banco.campo.titular": "Titular",
  "panel.banco.campo.ruc": "RUC",
  "panel.banco.campo.cuenta": "Número de cuenta",
  "panel.banco.campo.tipoCuenta": "Tipo de cuenta",
  "panel.banco.titularAyuda": "Como figura en el banco: si no coincide, la transferencia rebota.",
  "panel.banco.rucAyuda": "Con el dígito verificador: 80012345-6. Lo verificamos antes de guardar.",
  "panel.banco.tipoCuentaAyuda": "Es lo que se lee como etiqueta al lado del número en la página del pedido.",
  "panel.banco.tipoCuentaPlaceholder": "Cuenta corriente",
  "panel.banco.actualizado": "Última edición: {fecha}",
  "panel.banco.qrTitulo": "QR del SPI",
  "panel.banco.qrBajada":
    "Opcional. Con QR cargado, la compradora escanea desde la app de su banco en vez de copiar el número a mano — que es donde se equivoca.",
  "panel.banco.qrVacio": "Todavía no hay QR cargado: la página muestra los datos con botón de copiar.",
  "panel.banco.qrArchivo": "Imagen del QR",
  "panel.banco.qrArchivoAyuda": "JPG, PNG o WebP, hasta 5 MB. Sacale la captura desde la app del banco.",
  "panel.banco.qrSubir": "Subir QR",
  "panel.banco.qrSubido": "QR cargado.",
  "panel.banco.qrQuitar": "Quitar QR",
  "panel.banco.qrQuitado": "QR quitado.",

  "panel.usuarios.meta": "Usuarios",
  "panel.usuarios.titulo": "Usuarios del panel",
  "panel.usuarios.bajada":
    "Quién puede entrar y qué puede hacer. Nadie se borra: se desactiva, y así el historial de lo que hizo sigue siendo consultable.",

  "panel.cupones.meta": "Cupones",
  "panel.cupones.titulo": "Cupones",
  "panel.cupones.bajada":
    "Mientras no haya ninguno activo, el checkout no muestra el campo de descuento. Un cupón usado no se puede editar ni borrar: se desactiva.",

  "panel.productoNuevo.meta": "Nuevo producto",
  "panel.productoNuevo.titulo": "Nuevo producto",
  "panel.productoNuevo.bajada":
    "Primero se crea el producto; las variantes, los precios y las fotos se cargan después.",

  "panel.resumen.meta": "Resumen",
  "panel.resumen.titulo": "Resumen",
  "panel.resumen.sinPedidoVivo": "Pagos sin pedido vivo",
  "panel.resumen.sinPedidoVivo.ayuda":
    "Entró la plata pero el pedido no está cobrado — normalmente el pago llegó justo después de que el pedido venciera y la mercadería ya se había vendido. Reintentar vuelve a probar si hoy hay stock; si no lo hay, no pasa nada y podés volver a intentarlo. Marcar como devuelto es para cuando ya le transferiste la plata de vuelta al comprador.",
  "panel.resumen.sinBanco": "Faltan los datos bancarios",
  "panel.resumen.sinBanco.ayuda":
    "La página del pedido está avisando que no hay a dónde transferir, y la transferencia es el método principal de la tienda. Se cargan una vez y quedan.",
  "panel.resumen.sinBanco.link": "Cargar los datos bancarios →",

  "panel.resumen.ventasHoy": "Ventas de hoy",
  "panel.resumen.ventasMes": "Ventas del mes",
  "panel.resumen.cobrados.uno": "{n} pedido cobrado",
  "panel.resumen.cobrados.varios": "{n} pedidos cobrados",
  "panel.resumen.soloCobrados":
    "Sólo se cuentan los pedidos ya cobrados (pagado en adelante). Un pedido esperando pago todavía puede vencer.",
  "panel.resumen.ultimos7": "Últimos 7 días",
  "panel.resumen.ultimos7.ayuda":
    "Cada día se corta a medianoche de Asunción y cuenta lo mismo que el cuadro de arriba.",
  "panel.resumen.masVendido": "Lo más vendido del mes",
  "panel.resumen.sinVentas": "Todavía no hay ventas cobradas este mes.",
  "panel.resumen.unidades": "{n} u.",
  "panel.resumen.esperandoVerificacion": "Esperando verificación",
  "panel.resumen.verTodos": "Ver todos ({n})",
  "panel.resumen.sinComprobantes": "No hay comprobantes esperando revisión. Todo al día.",
  "panel.resumen.stockBajo": "Stock bajo",
  "panel.resumen.stockBajo.ayuda":
    "Disponible = lo que hay físicamente menos lo que ya está reservado por un pedido.",
  "panel.resumen.sinStockBajo": "Ninguna variante con stock bajo.",
  "panel.resumen.pendientes": "Pendientes de pago",
  "panel.resumen.pendientes.uno":
    "{n} pedido espera el pago. Los que pasen su fecha de reserva los vence el cron automáticamente.",
  "panel.resumen.pendientes.varios":
    "{n} pedidos esperan el pago. Los que pasen su fecha de reserva los vence el cron automáticamente.",
  "panel.resumen.verPendientes": "Ver pendientes",

  "panel.paginacion.anteriores": "← Anteriores",
  "panel.paginacion.siguientes": "Siguientes →",

  "panel.pedidos.meta": "Pedidos",
  "panel.pedidos.titulo": "Pedidos",
  "panel.pedidos.porCobrar": "Por cobrar",
  "panel.pedidos.cuenta.uno": "{n} pedido",
  "panel.pedidos.cuenta.varios": "{n} pedidos",
  "panel.pedidos.sinResultados": "No hay pedidos con esos filtros.",
  "panel.pedidos.comprobantes.uno": " · {n} comprobante sin revisar",
  "panel.pedidos.comprobantes.varios": " · {n} comprobantes sin revisar",
  "panel.pedidos.csvAyuda": "Baja los pedidos con los filtros puestos, no sólo esta página.",
  "panel.pedidos.avisarWhatsApp": "Avisar por WhatsApp →",
  "panel.pedidos.avisoMensaje":
    "Pedido nuevo {numero} — {cliente} — {total} ({metodo}). Ver: {url}",

  "panel.productos.meta": "Productos",
  "panel.productos.titulo": "Productos",
  "panel.productos.nuevo": "Nuevo producto",
  "panel.productos.buscar.placeholder": "Buscar por nombre o slug",
  "panel.productos.buscar.label": "Buscar producto",
  "panel.productos.sinResultados": "No hay productos que coincidan.",
  "panel.productos.sinPrecio": "Sin precio",
  "panel.productos.variantes.uno": "{n} variante",
  "panel.productos.variantes.varios": "{n} variantes",
  "panel.productos.enStock": "{n} en stock",
  "panel.productos.sinPublicar": " · sin publicar",
  "panel.productos.csvAyuda": "Una fila por variante, con los filtros puestos.",

  "panel.clientes.meta": "Clientes",
  "panel.clientes.titulo": "Clientes",
  "panel.clientes.cuenta.uno": "{n} cliente",
  "panel.clientes.cuenta.varios": "{n} clientes",
  "panel.clientes.bajada":
    "Sale de los pedidos, agrupados por WhatsApp. Lo gastado cuenta sólo los pedidos ya cobrados.",
  "panel.clientes.csvNovedades": "Descargar lista de novedades",
  "panel.clientes.csvAyuda": "Sólo las cuentas activas que aceptaron recibir novedades.",
  "panel.clientes.buscar.placeholder": "Nombre, WhatsApp o RUC",
  "panel.clientes.buscar.label": "Buscar cliente",
  "panel.clientes.sinBusqueda": "Ningún cliente coincide con esa búsqueda.",
  "panel.clientes.sinPedidos": "Todavía no hay pedidos.",
  "panel.clientes.pedidos.uno": "{n} pedido",
  "panel.clientes.pedidos.varios": "{n} pedidos",
  "panel.clientes.cobrados.uno": " ({n} cobrado)",
  "panel.clientes.cobrados.varios": " ({n} cobrados)",
  "panel.clientes.conCuenta": "Con cuenta",
  "panel.clientes.aceptaNovedades": " · acepta novedades",
  "panel.clientes.ultimoEl": " · último el {fecha}",

  "panel.actividad.meta": "Actividad",
  "panel.actividad.titulo": "Actividad",
  "panel.actividad.movimientos.uno": "{n} movimiento",
  "panel.actividad.movimientos.varios": "{n} movimientos",
  "panel.actividad.bajada":
    "Todo lo que se movió en la tienda: cambios de estado de pedidos y ajustes de stock, del más nuevo al más viejo. Es un registro, no se edita.",
  "panel.actividad.sinResultados": "No hay movimientos con esos filtros.",
  "panel.actividad.creadoComo": "creado como {estado}",
  "panel.actividad.transicion": "{desde} → {hasta}",
  "panel.actividad.deltaStock": "{delta} ({antes} → {despues})",
  "panel.actividad.elSistema": "El sistema",
  "panel.actividad.masNuevos": "← Más nuevos",
  "panel.actividad.masViejos": "Más viejos →",

  "panel.porCobrar.meta": "Por cobrar",
  "panel.porCobrar.volver": "← Pedidos",
  "panel.porCobrar.titulo": "Por cobrar",
  "panel.porCobrar.vencidos.uno": " · {n} vencido",
  "panel.porCobrar.vencidos.varios": " · {n} vencidos",
  "panel.porCobrar.bajada":
    "Pendientes de pago, vencidos y con el comprobante rechazado, del más viejo al más nuevo. El mensaje ya lleva los datos para transferir, el total y el link del pedido.",
  "panel.porCobrar.cortado":
    "Mostramos los {n} más viejos de {total}. Cobrá estos y volvé a entrar.",
  "panel.porCobrar.sinBanco":
    "Faltan los datos bancarios: el mensaje sale sin la parte de la transferencia. Cargalos en Banco y el botón queda completo.",
  "panel.porCobrar.sinResultados": "No hay pedidos esperando pago.",
  "panel.porCobrar.hoy": "hoy",
  "panel.porCobrar.antiguedad.uno": "hace {n} día",
  "panel.porCobrar.antiguedad.varios": "hace {n} días",
  "panel.porCobrar.escribir": "Escribirle por WhatsApp →",

  "panel.pedido.meta": "Pedido",
  "panel.pedido.escribir": "Escribir por WhatsApp",
  "panel.pedido.mandarDatos": "Mandar datos para pagar",
  "panel.pedido.esRegalo": "Es un regalo",
  "panel.pedido.sinMensaje": "Sin mensaje para la tarjeta.",
  "panel.pedido.comprobantes": "Comprobantes",
  "panel.pedido.items": "Ítems",
  "panel.pedido.itemDetalle": " · {precio} c/u · IVA {tasa}%",
  "panel.pedido.subtotal": "Subtotal",
  "panel.pedido.descuento": "Descuento",
  "panel.pedido.descuentoCon": "Descuento — {codigo}",
  "panel.pedido.envio": "Envío",
  "panel.pedido.total": "Total",
  "panel.pedido.ivaIncluido": "IVA incluido en el total",
  "panel.pedido.iva10": "IVA 10%",
  "panel.pedido.iva5": "IVA 5%",
  "panel.pedido.gravado": "Gravado",
  "panel.pedido.ivaPorLinea": "Ver IVA por línea",
  "panel.pedido.lineaIva": "{nombre} · IVA {tasa}%",
  "panel.pedido.cliente": "Cliente",
  "panel.pedido.nombre": "Nombre",
  "panel.pedido.whatsapp": "WhatsApp",
  "panel.pedido.email": "Email",
  "panel.pedido.documento": "Documento",
  "panel.pedido.consumidorFinal": "Consumidor final",
  "panel.pedido.docConNumero": "{tipo} {numero}",
  "panel.pedido.novedades": "Novedades",
  "panel.pedido.acepta": "Acepta",
  "panel.pedido.noAcepta": "No acepta",
  "panel.pedido.referencia": "Ref: {referencia}",
  "panel.pedido.cambiarEstado": "Cambiar estado",
  "panel.pedido.estadoFinal": "Este pedido está en un estado final: ya no se puede mover.",
  "panel.pedido.sinPermiso": "Tu usuario no puede mover este pedido desde este estado.",
  "panel.pedido.historial": "Historial",
  "panel.pedido.transicionDesde": "{estado} → ",
  "panel.pedido.motivoEvento": " · {motivo}",

  "panel.producto.meta": "Producto",
  "panel.producto.volver": "← Productos",
  "panel.producto.datos": "Datos",
  "panel.producto.variantes": "Variantes y stock",
  "panel.producto.ultimosAjustes": "Últimos ajustes de stock",
  "panel.producto.ajusteLinea": "{fecha} · {actor} · {antes} → {despues} · {motivo}",
  "panel.producto.fotos": "Fotos",

  // También lo usa `/admin/productos/nuevo`, que lo dibuja arriba del
  // formulario para poder volver sin perder el filtro.
  "panel.productoNuevo.volver": "← Productos",
} as const satisfies Record<string, string>;
