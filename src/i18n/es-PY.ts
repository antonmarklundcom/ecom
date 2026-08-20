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
} as const satisfies Record<string, string>;
