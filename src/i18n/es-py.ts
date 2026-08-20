/**
 * Catálogo de textos de la vidriera — **es-PY, el default y el fallback**
 * (PLAN.md FASE 2, PR P y Q).
 *
 * Es el único catálogo que tiene que estar completo: cualquier otro idioma se
 * mezcla encima de éste y lo que falte cae acá (ver `src/i18n/index.ts`). Un
 * test de CI verifica que ningún otro catálogo invente claves que este no
 * tenga.
 *
 * Los mensajes con parámetros son funciones y no strings con `{n}`: el
 * plural, el género y el orden de las palabras cambian por idioma, y una
 * función deja resolverlo en el catálogo en vez de en la pantalla. `formatGs`
 * y las fechas **no** entran acá — la plata queda PYG entero (ARCH.md).
 *
 * Los textos del panel siguen en el código: `/admin` lo lee el dueño, que
 * habla el idioma de su tienda, y traducirlo es el PR R.
 */
export const esPY = {
  comunes: {
    verProductos: "Ver productos",
    verTodo: "Ver todo →",
    inicio: "Inicio",
    categorias: "Categorías",
    productos: (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`,
    anterior: "Anterior",
    siguiente: "Siguiente",
    paginaDeTotal: (page: number, total: number) => `Página ${page} de ${total}`,
    ivaIncluido: "IVA incluido",
    reintentar: "Reintentar",
  },

  header: {
    buscarPlaceholder: "Buscar productos…",
    buscarLabel: "Buscar productos",
    categoriasNav: "Categorías",
    carrito: "Carrito",
    abrirCarrito: "Abrir carrito",
    abrirCarritoConItems: (n: number) => `Abrir carrito (${n})`,
  },

  footer: {
    contacto: "Contacto",
    whatsapp: (numero: string) => `WhatsApp ${numero}`,
    seguiTuPedido: "Seguí tu pedido",
  },

  home: {
    heroTitulo: "Comprá fácil, pagá como quieras",
    heroTexto:
      "Transferencia, QR o contra entrega. Precios en guaraníes con IVA incluido y envíos a todo el país. ¿Dudas? Escribinos por WhatsApp.",
    destacados: "Destacados",
    sinProductos: "Todavía no hay productos publicados. Sembrá el catálogo con",
    errorCatalogo: "No pude leer el catálogo:",
    errorCatalogoAyuda: (levantar: string, sembrar: string) =>
      `Levantá la base con ${levantar}, después ${sembrar}.`,
  },

  categoria: {
    conIva: "precios con IVA incluido",
    sinResultados: "No encontramos productos con esos filtros",
    sinResultadosAyuda: "Probá quitando la marca o ampliando el rango de precio.",
    verTodaLaCategoria: "Ver toda la categoría",
    grillaProductos: "Productos",
    paginacion: "Paginación",
    descripcionMeta: (nombre: string) =>
      `${nombre} en guaraníes, IVA incluido. Envíos a todo Paraguay.`,
    tituloFallback: "Categoría",
  },

  filtros: {
    marca: "Marca",
    todasLasMarcas: "Todas las marcas",
    filtrarPorMarca: "Filtrar por marca",
    marcaConCantidad: (marca: string, n: number) => `${marca} (${n})`,
    precio: "Precio",
    cualquierPrecio: "Cualquier precio",
    filtrarPorPrecio: "Filtrar por precio",
    ordenar: "Ordenar",
    limpiar: "Limpiar filtros",
    quitarFiltro: "Quitar filtro",
    orden: {
      relevancia: "Más relevantes",
      precioAsc: "Precio: menor a mayor",
      precioDesc: "Precio: mayor a menor",
      nuevos: "Más nuevos",
    },
  },

  producto: {
    noEncontrado: "Producto no encontrado",
    descripcion: "Descripción",
    consultarWhatsApp: "¿Tenés una duda? Consultanos por WhatsApp",
    consultaWhatsApp: (nombre: string) => `¡Hola! Me interesa "${nombre}". ¿Está disponible?`,
    iva: "IVA",
    ivaIncluidoEnPrecio: (tasa: number) => `${tasa}% incluido en el precio`,
    disponibilidad: "Disponibilidad",
    unidadesDisponibles: (n: number) => `${n} unidades`,
    sinStock: "Sin stock",
    desde: "Desde",
    relacionados: "También te puede interesar",
    descripcionMeta: (nombre: string, precio: string) =>
      `${nombre} — ${precio}, IVA incluido.`,
  },

  stock: {
    sinStock: "Sin stock",
    ultimaUnidad: "Última unidad",
    quedan: (n: number) => `Quedan ${n}`,
    disponible: "Disponible",
  },

  buscar: {
    titulo: "Buscar productos",
    resultadosPara: (term: string) => `Resultados para “${term}”`,
    minimo: "Escribí al menos dos letras para buscar.",
    sinResultados: (term: string) => `No encontramos nada con “${term}”`,
    sinResultadosAyuda: "Probá con menos palabras, o mirá las categorías.",
  },

  whatsapp: {
    contacto: "Contacto por WhatsApp",
    escribinos: "Escribinos por WhatsApp",
    consultaGenerica: "¡Hola! Tengo una consulta sobre un producto.",
  },

  carrito: {
    titulo: "Tu carrito",
    vacio: "Tu carrito está vacío.",
    seguirComprando: "Seguir comprando",
    cantidad: "Cantidad",
    quitarUno: "Quitar uno",
    agregarUno: "Agregar uno",
    quitar: "Quitar",
    subtotal: "Subtotal",
    irAlCheckout: "Ir al checkout",
    consultarPorWhatsApp: "Consultar por WhatsApp",
    agregarAlCarrito: "Agregar al carrito",
    elegiVariante: "Elegí una opción",
    preciosSeConfirman: "Los precios se confirman con el servidor. Todo incluye IVA.",
    envioSeCalcula: "El envío se calcula en el checkout según tu ciudad.",
    abriendoWhatsApp: "Abriendo WhatsApp…",
    consultaDuda: "¿Tenés una duda? Consultanos por WhatsApp",
    agregadoTitulo: "Agregado al carrito",
    problemas: {
      noDisponible: (nombre: string) => `${nombre} se quedó sin stock y lo sacamos del carrito.`,
      stockParcial: (nombre: string, quedan: number, pediste: number) =>
        `De ${nombre} quedan ${quedan} (pediste ${pediste}).`,
      precioCambio: (nombre: string) =>
        `El precio de ${nombre} cambió mientras estaba en tu carrito.`,
    },
  },

  envioGratis: {
    alcanzado: "¡Tenés envío gratis!",
    faltan: "para el envío gratis.",
    faltanPrefijo: "Te faltan",
    enAlgunasZonasDesde: "En algunas zonas el envío es gratis desde",
    ponéTuCiudad: "Poné tu ciudad en el checkout y te decimos la tuya.",
    puedeQueTengas:
      "Puede que tengas envío gratis: depende de tu ciudad. Ponela en el checkout y te decimos.",
  },

  checkout: {
    titulo: "Checkout",
    encabezado: "Finalizá tu compra",
    conCuenta: "Ya tenemos tus datos: revisalos y confirmá.",
    sinCuenta: "Sin cuenta ni registro: te mandamos el link de tu pedido por WhatsApp.",
  },

  pedido: {
    buscarTitulo: "Buscar mi pedido",
    buscarEncabezado: "Buscá tu pedido",
    buscarAyuda:
      "Si perdiste el link que te mandamos por WhatsApp, entrá con el número de pedido y el teléfono que usaste al comprar.",
    detalleTitulo: "Tu pedido",
    etiqueta: "Pedido",
    estado: "Estado:",
    pagarTransferencia: "Pagá por transferencia o QR",
    pagarTransferenciaAyuda:
      "Transferí el total exacto y subí el comprobante acá abajo. Lo revisamos y te confirmamos.",
    banco: "Banco",
    titular: "Titular",
    ruc: "RUC",
    totalATransferir: "Total a transferir (₲)",
    qrAlt: "Código QR para pagar por SPI",
    qrAyuda: "O escaneá el QR desde la app de tu banco.",
    pasos: {
      abrirApp: "Abrí la app de tu banco y elegí transferencia por SPI o pago por QR.",
      copiarDatos: "Copiá el banco, titular, RUC y número de cuenta de arriba (o escaneá el QR).",
      copiarTotalPrefijo: "Copiá el total exacto —",
      copiarTotalSufijo: "— y pegalo como monto. No redondees ni cambies el número.",
      confirmar: "Confirmá la transferencia.",
      captura: "Sacá una captura del comprobante y subila acá abajo.",
    },
    sinDatosBancarios:
      "Los datos bancarios del comercio todavía no están configurados. Escribinos por WhatsApp con tu número de pedido y te los pasamos a mano mientras tanto.",
    subiComprobante: "Subí tu comprobante",
    comprobanteMax:
      "Ya subiste el máximo de comprobantes. Si hubo un problema, escribinos por WhatsApp.",
    comprobanteCampo: "Comprobante (JPG, PNG o PDF, hasta 5 MB)",
    subiendo: "Subiendo…",
    enviarComprobante: "Enviar comprobante",
    comprobanteRecibido: "Comprobante recibido. Lo revisamos y te avisamos.",
    comprobantePorWhatsApp: "También podés mandarnos el comprobante directo por WhatsApp:",
    enviarComprobantePorWhatsApp: "Enviar comprobante por WhatsApp",
    tuPedido: "Tu pedido",
    subtotal: "Subtotal",
    descuento: "Descuento",
    envio: "Envío",
    total: "Total",
    ivaIncluido: (tasa: number) => `IVA ${tasa}% incluido`,
    seguimiento: "Seguimiento",
    referencia: (texto: string) => `Ref: ${texto}`,
    seguirComprando: "Seguir comprando",
    consultaWhatsApp: (numero: string, total: string) =>
      `¡Hola! Te escribo por mi pedido ${numero} (${total}).`,
    comprobanteWhatsApp: (numero: string, total: string, url: string) =>
      `¡Hola! Ya transferí el pedido ${numero} por ${total}. ` +
      `Te mando el comprobante. Podés ver el pedido acá: ${url}`,
    pagoparTitulo: "Volviendo de Pagopar",
    pagoparNoEncontrado: "No encontramos tu pedido",
    pagoparAyuda:
      "Volviste de Pagopar pero no pudimos identificar el pedido desde acá. Si ya pagaste, no te preocupes: tu comprobante de pedido te llegó por WhatsApp con el link para seguirlo.",
    pagoparBuscar: "Buscar mi pedido con el número y mi WhatsApp",
    numeroDePedido: "Número de pedido",
    whatsappUsado: "WhatsApp usado en la compra",
    buscando: "Buscando…",
  },

  copiar: {
    copiar: "Copiar",
    copiado: "¡Copiado!",
    copiadoToast: (campo: string) => `${campo} copiado`,
    error: "No se pudo copiar. Copialo a mano.",
  },

  formulario: {
    nombreApellido: "Nombre y apellido",
    whatsapp: "WhatsApp",
    email: "Email",
    opcional: "(opcional)",
    emailAyuda: "Por si tu WhatsApp falla. No es obligatorio y no lo usamos para nada más.",
    documento: "Documento",
    consumidorFinal: "Consumidor final",
    cedula: "Cédula",
    ruc: "RUC",
    rucConDv: "RUC (con DV)",
    nroCedula: "Nro. de cédula",
    ciudad: "Ciudad",
    barrio: "Barrio",
    direccion: "Dirección",
    referencia: "Referencia (opcional)",
    referenciaPlaceholder: "Casa de portón verde, entre X e Y",
    comoPagar: "¿Cómo querés pagar?",
    pago: {
      transferencia: "Transferencia / QR (SPI)",
      transferenciaAyuda: "Te pasamos los datos y subís el comprobante.",
      contraEntrega: "Contra entrega",
      contraEntregaAyuda: "Pagás en efectivo cuando recibís el pedido.",
      tarjeta: "Tarjeta / Pagopar",
      tarjetaAyuda: "Pagás online, ahora, con tarjeta u otros medios de Pagopar.",
    },
    esRegalo: "Es un regalo",
    esRegaloAyuda: "Lo preparamos para regalar y, si querés, le sumamos un mensaje.",
    mensajeTarjeta: "Mensaje para la tarjeta (opcional)",
    mensajeTarjetaPlaceholder: "¡Feliz cumple! Con mucho cariño.",
    novedades: "Quiero recibir novedades y promociones",
    novedadesAyuda: (tienda: string) =>
      `${tienda} te escribe al WhatsApp que pusiste arriba, sólo por ofertas y productos nuevos. ` +
      "Nunca por este pedido —eso te llega igual— y nunca le pasamos tu número a nadie. " +
      "Pedinos que te saquemos cuando quieras.",
    tenesCodigo: "¿Tenés un código de descuento?",
    codigoDescuento: "Código de descuento",
    codigoPlaceholder: "BIENVENIDA",
    aplicar: "Aplicar",
    quitar: "Quitar",
    cuponListo: (codigo: string, monto: string) => `Listo: ${codigo} descuenta ${monto}.`,
    cuponPoneCiudad: "Poné tu ciudad para ver el total con el descuento aplicado.",
    subtotalConIva: "Subtotal (IVA incluido)",
    descuento: "Descuento",
    envio: "Envío",
    gratis: "Gratis",
    total: "Total",
    poneCiudad: "Poné tu ciudad y te calculamos el envío antes de confirmar.",
    ciudadFueraDeZona: (zona: string) =>
      `No encontramos tu ciudad en nuestras zonas: te cotizamos la tarifa más alta (${zona}). ` +
      "Escribinos por WhatsApp y lo revisamos.",
    totalSeConfirma: "El total se confirma al crear el pedido.",
    creandoPedido: "Creando tu pedido…",
    confirmarPedido: "Confirmar pedido",
  },

  cupones: {
    noExiste: "Ese código no existe o ya no está disponible.",
    noEmpezo: "Ese código todavía no está vigente.",
    vencido: "Ese código ya venció.",
    agotado: "Ese código ya se usó todas las veces disponibles.",
    agotadoParaVos: "Ya usaste ese código la cantidad de veces permitida.",
    minimoSinMonto: "Tu compra no llega al mínimo que pide ese código.",
    minimoConFalta: (minimo: string, falta: string) =>
      `Ese código pide una compra mínima de ${minimo}: te faltan ${falta}.`,
    minimo: (minimo: string) => `Ese código pide una compra mínima de ${minimo}.`,
    soloClientes: "Ese código es sólo para quienes tienen cuenta.",
  },

  cuenta: {
    miCuenta: "Mi cuenta",
    entrar: "Entrar",
    entrando: "Entrando…",
    salir: "Salir",
    saliendo: "Saliendo…",
    entrarTitulo: "Entrar a tu cuenta",
    entrarEncabezado: "Entrá a tu cuenta",
    entrarAyuda: "Para ver tus pedidos y no volver a tipear tus datos.",
    whatsappOEmail: "WhatsApp o email",
    contrasena: "Contraseña",
    contrasenaAyuda: (minimo: number) =>
      `Al menos ${minimo} caracteres, con letras y números.`,
    olvidasteContrasena: "¿No te acordás la contraseña?",
    olvidasteAyuda: "Te mandamos un código por WhatsApp y entrás con eso.",
    codigo: "Código",
    codigoAyuda:
      "Si hay una cuenta con ese WhatsApp, te mandamos un código de 6 dígitos. Vence en 10 minutos.",
    mandandoCodigo: "Mandando…",
    mandameCodigo: "Mandame un código",
    todaviaNoTenesCuenta: "¿Todavía no tenés cuenta?",
    creaUna: "Creá una",
    yaTenesCuenta: "¿Ya tenés cuenta?",
    entra: "Entrá",
    registroTitulo: "Crear cuenta",
    registroEncabezado: "Creá tu cuenta",
    registroAyuda: "Guardamos tus datos para que la próxima compra sea de dos toques.",
    creando: "Creando…",
    crearCuenta: "Crear cuenta",
    telefonoAyuda: "Es con lo que entrás, y por donde te avisamos de tu pedido.",
    novedadesWhatsApp: "Quiero recibir novedades y promociones por WhatsApp.",
    noHaceFaltaCuentaComprar:
      "No hace falta cuenta para comprar. Esto es sólo para no volver a tipear tu dirección.",
    noHaceFaltaCuentaInvitada:
      "No hace falta cuenta para comprar. Podés hacer tu pedido como invitada y seguirlo con el link que te mandamos por WhatsApp.",
    hola: (nombre: string) => `Hola, ${nombre}`,
    misPedidos: "Mis pedidos",
    sinPedidos: "Todavía no hiciste ningún pedido con esta cuenta.",
    miraLoQueHay: "Mirá lo que hay",
    pedidosDeInvitada:
      "Si compraste antes de crear esta cuenta, esos pedidos no aparecen todavía. Seguilos con el link que te mandamos por WhatsApp.",
    misDatos: "Mis datos",
    whatsappEtiqueta: "WhatsApp:",
    whatsappNoSeCambia:
      "Es la llave de tu cuenta, así que no se cambia desde acá. Escribinos si lo necesitás.",
    guardando: "Guardando…",
    guardar: "Guardar",
    datosGuardados: "Listo, guardamos tus datos.",
    guardarDatosTitulo: "¿Guardamos tus datos para la próxima?",
    guardarDatosTexto: (numero: string) =>
      "Con una cuenta no volvés a tipear tu dirección, y tenés todos tus pedidos en un solo " +
      `lugar. Tu pedido ${numero} ya está hecho: esto es sólo para la próxima vez.`,
    crearMiCuenta: "Crear mi cuenta",
    telefonoPlaceholder: "0981 123 456",
    codigoPlaceholder: "123456",
  },

  estados: {
    comprador: {
      pendiente_pago: "Esperando tu pago",
      esperando_verificacion: "Comprobante en revisión",
      pagado: "Pago confirmado",
      preparando: "Preparando tu pedido",
      enviado: "En camino",
      entregado: "Entregado",
      rechazado: "Comprobante rechazado",
      vencido: "Vencido",
      cancelado: "Cancelado",
      reembolsado: "Reembolsado",
    },
  },

  /**
   * Errores del dominio (PLAN.md FASE 2, PR S).
   *
   * Los throw sites de `src/domain/**` no llevan prosa: piden el texto acá.
   * Un test de CI (`tests/unit/i18n-dominio.test.ts`) falla si alguno vuelve a
   * escribir el mensaje a mano — que es exactamente como se pierde una
   * traducción.
   *
   * No están los errores del panel (`AdminUserError`, `AdminCouponError`,
   * `AdminCategoryError`, `AdminShippingError`): el panel se traduce entero en
   * el PR R y partirlo en dos deja media pantalla en cada idioma. Tampoco los
   * de Pagopar ni `MoneyError`: nadie los lee, van al log del servidor, y
   * traducir un mensaje de diagnóstico es hacerlo más difícil de buscar.
   */
  dominio: {
    checkout: {
      telefonoInvalido: "El número de WhatsApp no parece paraguayo.",
      rucInvalido: (motivo: string) => `RUC inválido: ${motivo}`,
      ciInvalida: (motivo: string) => `CI inválida: ${motivo}`,
      carritoVacio: "El carrito está vacío.",
      sinDisponibilidad: "Algunos productos ya no están disponibles. Revisá tu carrito.",
      noSePudoCrear: "No pude crear el pedido. Probá de nuevo.",
      totalCambio: (antes: string, ahora: string) =>
        `El total cambió de ${antes} a ${ahora} mientras completabas los datos. ` +
        "Revisalo y confirmá de nuevo.",
      cuponYaNoSirve:
        "El código de descuento ya no se puede usar. Revisá el total y confirmá de nuevo.",
    },

    whatsapp: {
      seguimiento: (nombre: string, numero: string, total: string, url: string) =>
        `Hola ${nombre}! Te escribo por tu pedido ${numero} (${total}). ` +
        `Podés seguirlo acá: ${url}`,
      recuperacion: {
        vencido: (hola: string, numero: string) =>
          `${hola} Tu pedido ${numero} quedó sin pagar y se venció la reserva. ` +
          "Si todavía lo querés, avisanos y lo revisamos según disponibilidad.",
        rechazado: (hola: string, numero: string) =>
          `${hola} No pudimos validar el comprobante de tu pedido ${numero}. ` +
          "Entrá al link de abajo, mirá el motivo y subí uno nuevo.",
        pendiente: (hola: string, numero: string) =>
          `${hola} Te recuerdo tu pedido ${numero}, que quedó pendiente de pago.`,
        hola: (nombre: string) => `Hola ${nombre}!`,
        paraTransferir: "Para transferir:",
        titular: (titular: string) => `Titular: ${titular}`,
        ruc: (ruc: string) => `RUC: ${ruc}`,
        cuenta: (cuenta: string) => `Cuenta: ${cuenta}`,
        total: (total: string) => `Total: ${total}`,
        subiComprobante: (url: string) => `Cuando pagues, subí el comprobante acá: ${url}`,
      },
    },
    recibo: {
      vacio: "El archivo está vacío.",
      muyGrande: (mb: number) => `El comprobante no puede pesar más de ${mb} MB.`,
      formato: "Subí una foto (JPG o PNG) o un PDF del comprobante.",
      maximo: (n: number) =>
        `Ya subiste ${n} comprobantes para este pedido. Escribinos por WhatsApp.`,
      noEncontrado: "No encontramos ese comprobante.",
      motivoObligatorio:
        "Escribí el motivo del rechazo: el comprador lo ve y necesita saber qué corregir.",
      yaAprobado: "Ese comprobante ya estaba aprobado.",
      yaRechazado: "Ese comprobante ya estaba rechazado.",
    },

    cliente: {
      telefonoInvalido: "Ese número de WhatsApp no parece paraguayo.",
      nombreCorto: "Poné tu nombre completo.",
      yaExiste: "Ya hay una cuenta con ese WhatsApp o ese email. Probá entrar.",
      noSePudoCrear: "No pudimos crear la cuenta. Probá de nuevo.",
      emailUsado: "Ese email ya está usado por otra cuenta.",
    },

    login: {
      noSePudoGenerar: "No pude generar un código. Probá de nuevo.",
      noSePudoMandar: "No pudimos mandar el mensaje.",
    },

    pedido: {
      noExiste: (id: number) => `No existe el pedido ${id}`,
      sinStockParaCompletar: (faltan: number) =>
        `Ya no hay stock para completar este pedido: faltan ${faltan} unidad(es) de una de las ` +
        "variantes. Si el pago entró, hay que devolverlo.",
      transicionInvalida: (id: number, desde: string, hasta: string) =>
        `Transición inválida para el pedido ${id}: ${desde} → ${hasta}`,
      stockInsuficiente: (variantId: number, pedido: number, hay: number) =>
        `Stock insuficiente para la variante ${variantId}: pedí ${pedido}, hay ${hay}`,
    },
  },

  /**
   * El panel (PLAN.md FASE 2, PR R).
   *
   * Los textos del panel viven en el catálogo por lo mismo que los de la
   * vidriera: son de la tienda, no del código. Lo que **no** se hizo es
   * traducirlos al `en` de prueba — ese catálogo existe para demostrar que la
   * vidriera entera se puede renderizar en otro idioma, que es el criterio de
   * salida del plan; el panel lo lee el dueño, en el idioma de su tienda, y
   * traducir 250 strings para un catálogo de demo sería trabajo sin lector.
   * Lo que falte cae en es-PY, que es exactamente lo que tiene que pasar.
   */
  panel: {
    titulo: "Panel",
    entrar: "Entrar",
    entrando: "Entrando…",
    email: "Email",
    contrasena: "Contraseña",
    loginTitulo: "Panel del comercio",
    loginAyuda: "Entrá con tu cuenta para ver los pedidos.",
    salir: "Salir",
    saliendo: "Saliendo…",

    nav: {
      resumen: "Resumen",
      pedidos: "Pedidos",
      productos: "Productos",
      clientes: "Clientes",
      cupones: "Cupones",
      categorias: "Categorías",
      envios: "Envíos",
      actividad: "Actividad",
      usuarios: "Usuarios",
    },


    resumen: {
      titulo: "Resumen",
      pagosSinPedido: "Pagos sin pedido vivo",
      pagosSinPedidoAyuda1:
        "Entró la plata pero el pedido no está cobrado — normalmente el pago llegó justo después de que el pedido venciera y la mercadería ya se había vendido.",
      reintentar: "Reintentar",
      pagosSinPedidoAyuda2: "vuelve a probar si hoy hay stock; si no lo hay, no pasa nada y podés volver a intentarlo.",
      marcarDevuelto: "Marcar como devuelto",
      pagosSinPedidoAyuda3: "es para cuando ya le transferiste la plata de vuelta al comprador.",
      ventasHoy: "Ventas de hoy",
      ventasMes: "Ventas del mes",
      pedidosCobrados: (n: number) => `${n} ${n === 1 ? "pedido cobrado" : "pedidos cobrados"}`,
      soloCobrados:
        "Sólo se cuentan los pedidos ya cobrados (pagado en adelante). Un pedido esperando pago todavía puede vencer.",
      ultimos7: "Últimos 7 días",
      ultimos7Ayuda:
        "Cada día se corta a medianoche de Asunción y cuenta lo mismo que el cuadro de arriba.",
      masVendido: "Lo más vendido del mes",
      sinVentasDelMes: "Todavía no hay ventas cobradas este mes.",
      unidades: (n: number) => `${n} u.`,
      esperandoVerificacion: "Esperando verificación",
      verTodos: (n: number) => `Ver todos (${n})`,
      sinComprobantes: "No hay comprobantes esperando revisión. Todo al día.",
      stockBajo: "Stock bajo",
      stockBajoAyuda:
        "Disponible = lo que hay físicamente menos lo que ya está reservado por un pedido.",
      sinStockBajo: "Ninguna variante con stock bajo.",
      pendientesDePago: "Pendientes de pago",
      pendientesDePagoAyuda: (n: number) =>
        `${n} ${n === 1 ? "pedido espera" : "pedidos esperan"} el pago. ` +
        "Los que pasen su fecha de reserva los vence el cron automáticamente.",
      verPendientes: "Ver pendientes",
    },


    pedidos: {
      titulo: "Pedidos",
      porCobrar: "Por cobrar",
      cuenta: (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`,
      sinPedidos: "No hay pedidos con esos filtros.",
      comprobantesSinRevisar: (n: number) =>
        `${n} comprobante${n === 1 ? "" : "s"} sin revisar`,
      csvAyuda: "Baja los pedidos con los filtros puestos, no sólo esta página.",
      anteriores: "← Anteriores",
      siguientes: "Siguientes →",
      buscarPlaceholder: "Nº de pedido, WhatsApp o RUC",
      buscarLabel: "Buscar pedido",
      buscar: "Buscar",
      filtrarPorEstado: "Filtrar por estado",
      todos: "Todos",
      ocultarFiltros: "Ocultar filtros",
      masFiltros: "Más filtros",
      estado: "Estado",
      metodoDePago: "Método de pago",
      desde: "Desde",
      hasta: "Hasta",
      aplicar: "Aplicar",
      limpiar: "Limpiar",
    },


    estados: {
      /** Cómo lo lee el dueño: qué hay que hacer con este pedido. */
      panel: {
        pendiente_pago: "Esperando pago",
        esperando_verificacion: "Verificar comprobante",
        pagado: "Pagado",
        preparando: "Preparando",
        enviado: "Enviado",
        entregado: "Entregado",
        rechazado: "Comprobante rechazado",
        vencido: "Vencido",
        cancelado: "Cancelado",
        reembolsado: "Reembolsado",
      },
      metodo: {
        transferencia: "Transferencia / QR",
        contra_entrega: "Contra entrega",
        tarjeta: "Tarjeta",
      },
      /** Verbo del botón que lleva a cada estado, en voseo. */
      transicion: {
        pagado: "Marcar como pagado",
        preparando: "Empezar a preparar",
        enviado: "Marcar como enviado",
        entregado: "Marcar como entregado",
        cancelado: "Cancelar pedido",
        vencido: "Marcar como vencido",
        rechazado: "Rechazar comprobante",
        reembolsado: "Marcar como reembolsado",
        pendiente_pago: "Volver a esperando pago",
        esperando_verificacion: "Volver a verificación",
      },
    },


    pedido: {
      titulo: "Pedido",
      volver: "← Pedidos",
      escribirWhatsApp: "Escribir por WhatsApp",
      mandarDatosPagar: "Mandar datos para pagar",
      esRegalo: "Es un regalo",
      sinMensajeTarjeta: "Sin mensaje para la tarjeta.",
      comprobantes: "Comprobantes",
      items: "Ítems",
      porUnidadConIva: (precio: string, tasa: number) => `${precio} c/u · IVA ${tasa}%`,
      subtotal: "Subtotal",
      descuento: "Descuento",
      envio: "Envío",
      total: "Total",
      ivaIncluidoEnTotal: "IVA incluido en el total",
      iva: (tasa: number) => `IVA ${tasa}%`,
      gravado: "Gravado",
      verIvaPorLinea: "Ver IVA por línea",
      itemConIva: (nombre: string, tasa: number) => `${nombre} · IVA ${tasa}%`,
      cliente: "Cliente",
      nombre: "Nombre",
      whatsapp: "WhatsApp",
      email: "Email",
      documento: "Documento",
      consumidorFinal: "Consumidor final",
      novedades: "Novedades",
      acepta: "Acepta",
      noAcepta: "No acepta",
      referencia: (texto: string) => `Ref: ${texto}`,
      cambiarEstado: "Cambiar estado",
      estadoFinal: "Este pedido está en un estado final: ya no se puede mover.",
      sinPermisoParaMover: "Tu usuario no puede mover este pedido desde este estado.",
      historial: "Historial",
    },


    porCobrar: {
      titulo: "Por cobrar",
      cuenta: (pedidos: number, vencidos: number) =>
        `${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}` +
        (vencidos > 0 ? ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}` : ""),
      ayuda:
        "Pendientes de pago, vencidos y con el comprobante rechazado, del más viejo al más nuevo. El mensaje ya lleva los datos para transferir, el total y el link del pedido.",
      recorte: (mostrados: number, total: number) =>
        `Mostramos los ${mostrados} más viejos de ${total}. Cobrá estos y volvé a entrar.`,
      sinBanco: (variables: string) =>
        `Faltan los datos bancarios (${variables} en el entorno): el mensaje sale sin la parte de ` +
        "la transferencia. Cargalos y el botón queda completo.",
      sinPedidos: "No hay pedidos esperando pago.",
      hoy: "hoy",
      antiguedad: (dias: number) => `hace ${dias} ${dias === 1 ? "día" : "días"}`,
      escribirle: "Escribirle por WhatsApp →",
    },

    productos: {
      titulo: "Productos",
      /** El título de la ficha de un producto, en singular. */
      tituloSingular: "Producto",
      nuevo: "Nuevo producto",
      nuevoAyuda: "Se guarda sin publicar hasta que lo publiques.",
      buscarPlaceholder: "Buscar por nombre o slug",
      buscarLabel: "Buscar producto",
      buscar: "Buscar",
      sinResultados: "No hay productos que coincidan.",
      sinPrecio: "Sin precio",
      variantes: (n: number) => `${n} ${n === 1 ? "variante" : "variantes"}`,
      enStock: (n: number) => `${n} en stock`,
      sinPublicar: " · sin publicar",
      csvAyuda: "Una fila por variante, con los filtros puestos.",
      todasLasCategorias: "Todas las categorías",
      categoria: "Categoría",
      ordenar: "Ordenar",
      orden: {
        recientes: "Editados hace poco",
        stock: "Stock: menor primero",
        precioAsc: "Precio: menor a mayor",
        precioDesc: "Precio: mayor a menor",
      },
      datos: "Datos",
      variantesYStock: "Variantes y stock",
      ultimosAjustes: "Últimos ajustes de stock",
      fotos: "Fotos",
      fotoAlt: "Foto del producto",
      fotoQuitada: "Foto quitada.",
      fotoSubida: "Foto subida.",
      quitar: "Quitar",
      sinFotos: "Todavía no hay fotos: en la tienda se ve un placeholder de color.",
      agregarFoto: "Agregar foto (JPG, PNG o WebP, hasta 5 MB)",
      descripcionFoto: "Descripción de la foto (accesibilidad y SEO)",
      descripcionFotoPlaceholder: "Remera azul de frente",
      subiendo: "Subiendo…",
      subirFoto: "Subir foto",
      volver: "← Productos",
      guardado: "Producto guardado.",
      slug: "Slug (la URL del producto)",
      descripcion: "Descripción",
      elegiUna: "Elegí una",
      marca: "Marca",
      iva: "IVA",
      iva10: "10% (lo habitual)",
      iva5: "5% (canasta básica)",
      ivaExento: "Exento",
      activo: "Activo",
      publicado: "Publicado en la tienda",
      publicadoAyuda: "Un producto sin publicar no aparece en el catálogo ni en la búsqueda.",
      guardarProducto: "Guardar producto",
      nuevoIntro:
        "Primero se crea el producto; las variantes, los precios y las fotos se cargan después.",
    },

    clientes: {
      titulo: "Clientes",
      cuenta: (n: number) => `${n} ${n === 1 ? "cliente" : "clientes"}`,
      ayuda:
        "Sale de los pedidos, agrupados por WhatsApp. Lo gastado cuenta sólo los pedidos ya cobrados (pagado en adelante).",
      descargarNovedades: "Descargar lista de novedades",
      descargarNovedadesAyuda: "Sólo las cuentas activas que aceptaron recibir novedades.",
      buscarPlaceholder: "Nombre, WhatsApp o RUC",
      buscarLabel: "Buscar cliente",
      buscar: "Buscar",
      sinCoincidencias: "Ningún cliente coincide con esa búsqueda.",
      sinPedidos: "Todavía no hay pedidos.",
      conCuenta: "Con cuenta",
      aceptaNovedades: " · acepta novedades",
      pedidos: (pedidos: number, cobrados: number) =>
        `${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}` +
        (cobrados < pedidos ? ` (${cobrados} cobrado${cobrados === 1 ? "" : "s"})` : ""),
      ultimoEl: (fecha: string) => `último el ${fecha}`,
    },

    variantes: {
      agregarVariante: "Agregar variante",
      sinVariantes:
        "Un producto sin variantes no se puede comprar: cargá al menos una con su precio.",
      stockLinea: (enStock: number, reservados: number) =>
        `${enStock} en stock · ${reservados} reservados · `,
      disponibles: (n: number) => `${n} disponibles`,
      inactiva: " · inactiva",
      ajustarStock: "Ajustar stock",
      guardada: "Variante guardada.",
      etiqueta: "Etiqueta",
      etiquetaPlaceholder: "Talle M",
      skuPlaceholder: "CAM-M-AZ",
      precio: "Precio en ₲ (IVA incluido)",
      precioTachado: "Precio tachado (opcional)",
      activa: "Activa",
      arrancaEnCero:
        "Arranca con 0 en stock: se carga con “Ajustar stock”, que pide el motivo.",
      guardarVariante: "Guardar variante",
      agregar: "Agregar",
      quitar: "Quitar",
      cantidad: "Cantidad",
      motivo: "Motivo (obligatorio)",
      motivoPlaceholder: "Conteo de depósito / rotura / reposición",
      stockAjustado: (quedan: number) => `Stock ajustado: quedan ${quedan}.`,
    },

    comprobantes: {
      sinRevisar: "Sin revisar",
      aprobado: "Aprobado",
      rechazado: "Rechazado",
      aprobadoToast: "Comprobante aprobado. El pedido pasó a pagado.",
      rechazadoToast: "Comprobante rechazado. El cliente puede subir otro.",
      motivo: (texto: string) => `Motivo: ${texto}`,
      actualizarVista: "Actualizar vista",
      verComprobante: "Ver comprobante",
      aprobar: "Aprobar",
      rechazar: "Rechazar",
      motivoRechazo: "Motivo del rechazo — el cliente lo lee",
      motivoRechazoPlaceholder: "Ej: el monto transferido no coincide",
      confirmarRechazo: "Confirmar rechazo",
      abrirPdf: "Abrir el PDF del comprobante",
      alt: "Comprobante de transferencia",
      linkVence: "El link vence en un par de minutos. Si no carga, tocá “Actualizar vista”.",
      tamano: (kb: string) => ` · ${kb} KB`,
    },

    pagosHuerfanos: {
      titulo: "Pagos sin pedido vivo",
      volvioACobrado: (numero: string) => `${numero} volvió a estar cobrado.`,
      yaEstabaCobrado: (numero: string) => `${numero} ya estaba cobrado.`,
      devolucionAnotada: (numero: string) => `Devolución anotada en ${numero}.`,
      pedidoEn: (estado: string) => `pedido en “${estado}”`,
      motivoDevolucion: "Motivo de la devolución (queda en el historial del pedido)",
      motivoDevolucionPlaceholder: "Ej: transferí de vuelta por SPI el 12/8",
      devolucionAyuda:
        "Esto no le transfiere la plata a nadie: anota que vos ya la devolviste, y cancela el pedido.",
      confirmarDevolucion: "Confirmar devolución",
      volver: "Volver",
      reintentarPedido: "Reintentar el pedido",
      marcarDevuelto: "Marcar como devuelto",
    },

    usuarios: {
      titulo: "Usuarios",
      roles: {
        owner: "Dueño",
        staff: "Encargado",
        vendedor: "Vendedor",
      },
      rolesAyuda: {
        owner: "Todo, incluidos usuarios, devoluciones y descargas de CSV.",
        staff: "Pedidos, comprobantes, productos y stock. Sin devoluciones ni CSV.",
        vendedor: "Ve pedidos y los despacha. Sin montos, comprobantes ni stock.",
      },
      agregar: "Agregar usuario",
      nuevo: "Nuevo usuario",
      email: "Email",
      contrasenaTemporal: "Contraseña temporal",
      contrasenaAyuda: (minimo: number) =>
        `Al menos ${minimo} caracteres, con letras y números. Se la pasás vos por WhatsApp o en ` +
        "persona — la tienda no manda emails. Que la cambie al entrar.",
      creando: "Creando…",
      crear: "Crear usuario",
      creado: "Usuario creado. Pasale la contraseña por un canal seguro.",
      vos: " (vos)",
      desactivado: " · desactivado",
      ultimoIngreso: (cuando: string) => `Último ingreso: ${cuando}`,
      nuncaEntro: "Nunca entró",
      contrasenaNuevaPara: (email: string) => `Contraseña nueva para ${email}`,
      cambiarContrasena: "Cambiar contraseña",
      contrasenaCambiada: "Contraseña cambiada. Pasásela por un canal seguro.",
      resetearContrasena: "Resetear contraseña",
      volver: "Volver",
      rolDe: (email: string) => `Rol de ${email}`,
      rolActualizado: "Rol actualizado.",
      desactivar: "Desactivar",
      reactivar: "Reactivar",
      desactivadoToast: "Usuario desactivado.",
      reactivadoToast: "Usuario reactivado.",
      tuCuenta:
        "Tu propia cuenta no se puede desactivar ni degradar desde acá: quedarías afuera del panel sin forma de volver.",
      encabezado: "Usuarios del panel",
      ayuda:
        "Quién puede entrar y qué puede hacer. Nadie se borra: se desactiva, y así el historial de lo que hizo sigue siendo consultable.",
    },

    categorias: {
      titulo: "Categorías",
      crear: "Crear categoría",
      sinCategorias: "Todavía no hay categorías. Sin ninguna activa, la vidriera queda vacía.",
      desactivadaSufijo: " · desactivada",
      productos: (n: number) => `${n} producto${n === 1 ? "" : "s"}`,
      enVidriera: (n: number) => ` · ${n} en la vidriera`,
      subir: "Subir",
      bajar: "Bajar",
      ordenActualizado: "Orden actualizado.",
      desactivadaToast: "Categoría desactivada.",
      activadaToast: "Categoría activada.",
      actualizada: "Categoría actualizada.",
      creada: "Categoría creada.",
      editar: (nombre: string) => `Editar ${nombre}`,
      nueva: "Nueva categoría",
      nombreAyuda: "Es lo que se lee en el menú de la tienda.",
      enlace: "Enlace",
      enlaceAyuda: (slug: string) => `/categoria/${slug} — cambiarlo rompe los links ya compartidos.`,
      confirmarDesactivar: (nombre: string) => `Vas a desactivar "${nombre}".`,
      confirmarProductos: (n: number) =>
        `Sus ${n} producto${n === 1 ? "" : "s"} en vidriera dejan de verse y de poder comprarse. ` +
        "No se modifican: al reactivarla vuelven como estaban.",
      confirmarSinProductos:
        "No tiene productos en la vidriera, así que no desaparece nada de la tienda.",
      confirmarUltima: "Es la última categoría activa: la tienda queda sin nada para mostrar.",
      confirmarUrl: (nombre: string, antes: string, ahora: string) =>
        `Vas a cambiar la URL de "${nombre}" de /categoria/${antes} a /categoria/${ahora}.\n\n` +
        "Los links que ya se compartieron y lo que Google indexó van a dar 404.",
      ayuda:
        "El orden de esta lista es el del menú de la tienda. Una categoría desactivada esconde también sus productos de la vidriera, sin modificarlos: al reactivarla vuelven como estaban. No se borran, por los productos que cuelgan de ellas.",
    },

    envios: {
      titulo: "Envíos",
      sinZonasActivas1: "No hay ninguna zona activa: hoy la tienda",
      sinZonasActivas2: "no cobra envío",
      sinZonasActivas3:
        ". Es el estado en el que sale una tienda recién clonada; si no es a propósito, activá o crear una zona.",
      crear: "Crear zona",
      sinZonas: "Todavía no hay zonas de envío.",
      desactivadaSufijo: " · desactivada",
      gratis: "Gratis",
      sinCiudades: "Sin ciudades cargadas",
      gratisDesde: (monto: string) => `Gratis desde ${monto}`,
      sinEnvioGratis: "Sin envío gratis",
      esLaMasCara: " · es la tarifa que paga una ciudad que no esté en ninguna zona",
      confirmarUltima: (nombre: string) =>
        `"${nombre}" es la última zona activa.\n\n` +
        "Sin zonas activas la tienda deja de cobrar envío: todo pedido va a cotizar ₲0.",
      desactivadaToast: "Zona desactivada.",
      activadaToast: "Zona activada.",
      actualizada: "Zona actualizada.",
      creada: "Zona creada.",
      editar: (nombre: string) => `Editar ${nombre}`,
      nueva: "Nueva zona",
      nombreAyuda: "Lo lee quien compra: “Gran Asunción”, “Interior”.",
      precio: "Precio del envío (₲)",
      precioAyuda: "Entero en guaraníes, IVA 10% incluido. 0 = envío gratis siempre.",
      ciudades: "Ciudades",
      ciudadesAyuda:
        "Una por línea. Los acentos y las mayúsculas no importan al cotizar. Una ciudad que no esté en ninguna zona paga la tarifa más cara.",
      envioGratisDesde: "Envío gratis a partir de un monto",
      umbral: "Umbral de envío gratis",
      umbralAyuda: "Subtotal desde el que el envío de esta zona sale ₲0.",
      ayuda:
        "Lo que se cobra de flete sale de acá. Un cambio vale para los pedidos nuevos: los que ya existen guardan su propio envío y no se recalculan. Las zonas no se borran —los pedidos viejos las nombran— se desactivan.",
    },

    cupones: {
      titulo: "Cupones",
      crear: "Crear cupón",
      sinCupones:
        "Todavía no hay cupones. Mientras no haya ninguno, el checkout no muestra el campo de descuento.",
      tipoPorcentaje: "Porcentaje",
      tipoMontoFijo: "Monto fijo",
      deDescuento: "de descuento",
      desactivadoSufijo: " · desactivado",
      agotadoSufijo: " · agotado",
      minimo: (monto: string) => ` · mínimo ${monto}`,
      desde: (fecha: string) => ` · desde ${fecha}`,
      hasta: (fecha: string) => ` · hasta ${fecha}`,
      soloConCuenta: " · sólo con cuenta",
      usos: (usados: number, tope: number | null) =>
        `${usados} uso${usados === 1 ? "" : "s"}` + (tope !== null ? ` de ${tope}` : ""),
      pedidosLoUsan: (n: number) => ` · ⚠ ${n} pedidos lo usan`,
      descontados: (monto: string) => ` · ${monto} descontados`,
      maxPorCliente: (n: number) => ` · máx. ${n} por cliente`,
      desactivadoToast: "Cupón desactivado.",
      activadoToast: "Cupón activado.",
      actualizado: "Cupón actualizado.",
      creado: "Cupón creado.",
      editar: (codigo: string) => `Editar ${codigo}`,
      nuevo: "Nuevo cupón",
      codigo: "Código",
      codigoAyuda: "Se guarda en mayúsculas. Es lo que va a tipear la compradora.",
      porcentajeCampo: "Porcentaje (1 a 100)",
      montoCampo: "Monto en guaraníes",
      enterosAyuda: "Enteros. El guaraní no tiene céntimos.",
      tipo: "Tipo",
      minimoCompra: "Mínimo de compra",
      minimoCompraAyuda: "Sobre el subtotal, sin el envío.",
      topeUsos: "Tope de usos",
      topeUsosAyuda: "Vacío = sin tope.",
      desdeCampo: "Desde",
      hastaCampo: "Hasta",
      formatoFecha: "(dd/mm/aaaa)",
      desdePlaceholder: "01/09/2026",
      hastaPlaceholder: "30/09/2026",
      incluyeEseDia: "Incluye todo ese día.",
      maximoPorCliente: "Máximo por cliente",
      maximoPorClienteAyuda:
        "Se cuenta por cuenta de cliente, o por WhatsApp si compró de invitada.",
      soloConCuentaCampo: "Sólo para quienes tengan cuenta",
      soloConCuentaAyuda:
        "Si esta tienda no tiene las cuentas de cliente prendidas, un cupón así no lo va a poder usar nadie.",
      ayuda:
        "Mientras no haya ninguno activo, el checkout no muestra el campo de descuento. Un cupón usado no se puede editar ni borrar: se desactiva.",
    },

    actividad: {
      titulo: "Actividad",
      ayuda:
        "Cada cambio de estado de un pedido y cada ajuste de stock, del más reciente al más viejo. Lo que movió el cron o un webhook aparece sin usuario: no lo hizo nadie del panel.",
      movimientos: (n: number) => `${n} movimiento${n === 1 ? "" : "s"}`,
      sinMovimientos: "No hay movimientos con esos filtros",
      sinMovimientosAyuda: "Probá ampliando las fechas o sacando el usuario.",
      usuario: "Usuario",
      todos: "Todos",
      tipo: "Tipo",
      todo: "Todo",
      pedidos: "Pedidos",
      stock: "Stock",
      desde: "Desde",
      hasta: "Hasta",
      filtrar: "Filtrar",
      limpiar: "Limpiar",
    },

    acciones: {
      marcado: (estado: string) => `Pedido marcado como “${estado}”.`,
      motivo: "Motivo (queda en el historial del pedido)",
      motivoPlaceholder: "Ej: el cliente pidió cancelar",
      confirmar: "Confirmar",
      volver: "Volver",
    },

    comunes: {
      guardar: "Guardar",
      guardando: "Guardando…",
      guardarCambios: "Guardar cambios",
      cancelar: "Cancelar",
      editar: "Editar",
      activar: "Activar",
      desactivar: "Desactivar",
      nombre: "Nombre",
      opcional: "(opcional)",
      paginacion: "Paginación",
      anterior: "Anterior",
      siguiente: "Siguiente",
      paginaDeTotal: (page: number, total: number) => `Página ${page} de ${total}`,
      noPudimos: "No pudimos hacer eso.",
      descargarCsv: "Descargar CSV",
      preparando: "Preparando…",
      filas: (n: number) => `${n} ${n === 1 ? "fila" : "filas"}.`,
      csvTruncado: (n: number) =>
        `Bajé las primeras ${n} filas. Filtrá por fecha para llevarte el resto.`,
    },
  },

  errores: {
    error404: "Error 404",
    noEncontramosPagina: "No encontramos esta página",
    noEncontramosPaginaAyuda:
      "Puede que el producto ya no esté publicado o que el link esté mal copiado.",
    irAlInicio: "Ir al inicio",
    buscarMiPedido: "Buscar mi pedido",
    algoSalioMal: "Algo salió mal",
    algoSalioMalAyuda: "Tuvimos un problema cargando esta página. Probá de nuevo en unos segundos.",
    referencia: (digest: string) => `Ref: ${digest}`,
  },
};
