import { MessageSendError, type MessageSender, type OutgoingMessage } from './sender';

/**
 * WhatsApp Cloud API de Meta (PLAN.md FASE 2, PR F.2).
 *
 * **Lo que una tienda nueva tiene que conseguir antes de poder prender esto**,
 * y es el motivo por el que el login sin contraseña viene pre-armado pero
 * apagado:
 *
 * 1. Una app de Meta for Developers con el producto WhatsApp agregado.
 * 2. Un número de teléfono verificado por Meta (no sirve el WhatsApp común del
 *    comercio: tiene que estar dado de alta en la plataforma).
 * 3. Un token de acceso permanente (los de prueba duran 24 h).
 * 4. Una **plantilla de mensaje aprobada** por Meta. Fuera de la ventana de 24
 *    horas desde el último mensaje de la persona, Meta no deja mandar texto
 *    libre: sólo plantillas que revisó. Un código de login siempre cae fuera
 *    de esa ventana, así que la plantilla no es opcional.
 *
 * El paso 4 es el que sorprende y el que tarda: la aprobación puede demorar
 * días. Está en `.env.example` y en NEW-STORE.md.
 */
export const WHATSAPP_TEMPLATE_LANGUAGE = 'es';

export type WhatsappCloudConfig = {
  phoneNumberId: string;
  accessToken: string;
  /** Nombre de la plantilla aprobada por Meta. */
  templateName: string;
  apiVersion: string;
};

/**
 * Lee la configuración del entorno. Devuelve `null` si falta cualquier cosa —
 * "configurado a medias" es lo mismo que "no configurado", porque una llamada
 * con la mitad de las credenciales falla igual pero más tarde y peor.
 */
export function whatsappCloudConfig(): WhatsappCloudConfig | null {
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const templateName = process.env.WHATSAPP_CLOUD_TEMPLATE_NAME?.trim();

  if (!phoneNumberId || !accessToken || !templateName) return null;

  return {
    phoneNumberId,
    accessToken,
    templateName,
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || 'v21.0',
  };
}

export function createWhatsappCloudSender(config: WhatsappCloudConfig): MessageSender {
  return {
    channel: 'whatsapp',
    label: 'WhatsApp',

    async send(message: OutgoingMessage): Promise<void> {
      const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

      // Plantilla y no `type: "text"`: fuera de la ventana de 24 h Meta
      // rechaza el texto libre, y un código de login siempre está fuera.
      const payload = {
        messaging_product: 'whatsapp',
        // Meta quiere el número sin `+`.
        to: message.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message.body }] }],
        },
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        // El detalle al log del servidor; hacia afuera, nada. El mensaje de
        // error de Meta puede incluir el número de destino.
        console.error('WhatsApp Cloud: la llamada falló', error);
        throw new MessageSendError('No pudimos mandar el mensaje.');
      }

      if (!response.ok) {
        console.error(
          'WhatsApp Cloud respondió %s: %s',
          response.status,
          await response.text().catch(() => '(sin cuerpo)'),
        );
        throw new MessageSendError('No pudimos mandar el mensaje.');
      }
    },
  };
}
