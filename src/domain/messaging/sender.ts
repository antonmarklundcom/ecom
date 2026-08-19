/**
 * Por dónde le mandamos un mensaje a una compradora (PLAN.md FASE 2, PR F.2).
 *
 * La interfaz existe antes que cualquier proveedor real, y a propósito: el
 * login sin contraseña, los avisos de "pedido enviado" y los carritos
 * abandonados son todos el mismo problema —mandar un mensaje— y no conviene
 * tener tres integraciones distintas cuando llegue el momento.
 *
 * **La regla de esta fase: sin credenciales, la opción no se ofrece.** Un
 * botón de "mandame un código" que no puede mandar nada es peor que no
 * tenerlo: quien lo aprieta se queda esperando un mensaje que no va a llegar y
 * no sabe si el problema es suyo.
 */

export type MessageChannel = 'whatsapp' | 'consola';

export type OutgoingMessage = {
  /** `+595XXXXXXXXX`, ya normalizado. */
  to: string;
  body: string;
};

export interface MessageSender {
  readonly channel: MessageChannel;
  /** Nombre para mostrarle a la persona: "WhatsApp". */
  readonly label: string;
  send(message: OutgoingMessage): Promise<void>;
}

export class MessageSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageSendError';
  }
}
