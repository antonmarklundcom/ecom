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
