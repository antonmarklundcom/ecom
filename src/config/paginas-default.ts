import type { PaginaSlug } from "@/domain/store-settings-schema";

/**
 * Los textos con los que arrancan las páginas de políticas (`/envios`,
 * `/devoluciones`, `/preguntas-frecuentes`, `/terminos`, `/privacidad`).
 *
 * **Son un punto de partida, no un texto legal.** Cortos, en voseo, sin
 * números de ley ni promesas que la tienda quizás no cumple: el panel los
 * muestra con el aviso "Texto por defecto — revisalo antes de publicar"
 * hasta que el dueño guarda el suyo desde `/admin/ajustes`.
 *
 * Es piel (NEW-STORE.md §5): una tienda puede reescribir este archivo entero.
 * El formato es el markdown chico de `src/lib/markdown.ts` —párrafos,
 * `**negrita**`, `*cursiva*`, listas con `- ` y links `https://`; sin
 * encabezados— y los `{{…}}` se reemplazan al dibujar la página
 * (`src/lib/placeholders.ts`). Uno sin dato nunca sale crudo: sale una frase
 * que se lee bien ("a coordinar por WhatsApp").
 */
export const PAGINAS_DEFAULT: Readonly<Record<PaginaSlug, { titulo: string; cuerpo: string }>> = {
  envios: {
    titulo: "Envíos",
    cuerpo: `Enviamos a todo el país. El costo del envío depende de tu ciudad y lo ves antes de confirmar el pedido, en el checkout.

**Cuándo sale tu pedido**
Preparamos el pedido cuando se confirma el pago. Si pagás contra entrega, lo confirmamos con vos por WhatsApp antes de despacharlo.

**Seguimiento**
Cuando tu pedido sale, te avisamos. También podés ver en qué estado está desde el link que te llega al comprar.

**¿Dudas con tu envío?**
- WhatsApp: {{whatsapp}}
- Email: {{email}}
- Horario de atención: {{horario}}`,
  },
  devoluciones: {
    titulo: "Cambios y devoluciones",
    cuerpo: `Queremos que te guste lo que compraste en {{tienda}}. Si algo no es lo que esperabas, avisanos dentro de {{diasDevolucion}} de recibido el pedido y lo resolvemos.

**Cómo pedir un cambio o una devolución**
- Escribinos por WhatsApp ({{whatsapp}}) con tu número de pedido.
- Contanos qué producto querés cambiar o devolver y por qué.
- Te decimos cómo hacernos llegar el producto.

**Qué necesitamos**
El producto sin uso, con sus etiquetas y en su empaque original. Si llegó fallado o no es lo que pediste, lo resolvemos nosotros.

**Dónde**
Punto de entrega o retiro: {{direccion}}.`,
  },
  "preguntas-frecuentes": {
    titulo: "Preguntas frecuentes",
    cuerpo: `**¿Cómo compro?**
Elegí tus productos, sumalos al carrito y completá tus datos en el checkout. No hace falta crear una cuenta.

**¿Cómo puedo pagar?**
Aceptamos {{mediosDePago}}.

**¿Los precios incluyen IVA?**
Sí, todos los precios están en guaraníes con IVA incluido.

**¿Hacen envíos?**
Sí, a todo el país. El costo lo ves en el checkout antes de confirmar.

**¿Cómo sigo mi pedido?**
Con el link que te llega al comprar, o desde "Seguí tu pedido" al pie de {{url}}.

**¿Dónde están?**
- Dirección: {{direccion}}
- Horario: {{horario}}

**¿Otra consulta?**
- WhatsApp: {{whatsapp}}
- Email: {{email}}`,
  },
  terminos: {
    titulo: "Términos y condiciones",
    cuerpo: `Estos términos explican cómo funcionan las compras en {{tienda}} ({{url}}). Al hacer un pedido, los aceptás.

**Precios**
Los precios están en guaraníes, con IVA incluido. El precio que vale es el que ves al confirmar el pedido.

**Pedidos y stock**
Un pedido queda confirmado cuando se acredita el pago o, si pagás contra entrega, cuando lo confirmamos con vos. Si un producto se agota antes de eso, te avisamos y te ofrecemos otra opción o la devolución de lo que hayas pagado.

**Pagos**
Aceptamos {{mediosDePago}}.

**Envíos, cambios y devoluciones**
Los plazos y costos están en las páginas de envíos y de cambios y devoluciones.

**Contacto**
- WhatsApp: {{whatsapp}}
- Email: {{email}}`,
  },
  privacidad: {
    titulo: "Política de privacidad",
    cuerpo: `En {{tienda}} cuidamos tus datos.

**Qué datos pedimos**
Tu nombre, teléfono, dirección de entrega y, si querés factura, tu RUC o cédula. Los usamos para preparar, cobrar y entregar tu pedido, y para avisarte cómo va.

**Qué no hacemos**
No vendemos ni compartimos tus datos con terceros para publicidad. Sólo los compartimos con quien hace falta para completar tu compra, como el servicio de envío o el medio de pago que elegiste.

**Mensajes**
Te escribimos por WhatsApp sobre tu pedido. Sólo te mandamos promociones si nos diste permiso.

**Tus datos, tu decisión**
Si querés ver, corregir o borrar tus datos, escribinos.
- WhatsApp: {{whatsapp}}
- Email: {{email}}`,
  },
};
