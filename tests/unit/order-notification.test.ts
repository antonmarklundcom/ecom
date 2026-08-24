import { afterEach, describe, expect, it, vi } from 'vitest';

import { notifyNewOrder, orderNotificationConfig } from '@/domain/messaging/order-notification';

/**
 * Aviso de "pedido nuevo" al dueño (`order-notification.ts`).
 *
 * Igual criterio que `messaging.test.ts`: lo que más importa es el apagado —
 * sin destinatario configurado, `notifyNewOrder` no manda nada y sobre todo
 * **nunca tira**, porque se llama después de que el pedido ya quedó escrito.
 */

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe('orderNotificationConfig', () => {
  it('sin plantilla, no hay configuración', () => {
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = 'token';
    delete process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME;

    expect(orderNotificationConfig()).toBeNull();
  });

  it('con las tres, sale la config con su default de versión', () => {
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME = 'pedido_nuevo';
    delete process.env.WHATSAPP_CLOUD_API_VERSION;

    expect(orderNotificationConfig()).toMatchObject({
      phoneNumberId: '123',
      templateName: 'pedido_nuevo',
      apiVersion: 'v21.0',
    });
  });
});

describe('notifyNewOrder', () => {
  const order = { orderNumber: 'PY-000123', totalPyg: 150_000, customerName: 'Juana Pérez' };

  it('sin destinatario, no manda nada y no tira', async () => {
    delete process.env.ORDER_NOTIFICATIONS_WHATSAPP_TO;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(notifyNewOrder(order)).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('en producción, con destinatario pero sin plantilla de Meta, no manda nada', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.ORDER_NOTIFICATIONS_WHATSAPP_TO = '+595981123456';
    delete process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyNewOrder(order);
    expect(log).not.toHaveBeenCalled();
  });

  it('en dev, con destinatario pero sin plantilla, cae en la consola', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.ORDER_NOTIFICATIONS_WHATSAPP_TO = '+595981123456';
    delete process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyNewOrder(order);
    expect(log).toHaveBeenCalled();
    const printed = log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(printed).toContain('PY-000123');
  });

  it('una falla al mandar se loguea y no tira', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.ORDER_NOTIFICATIONS_WHATSAPP_TO = '+595981123456';
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_CLOUD_ORDER_TEMPLATE_NAME = 'pedido_nuevo';

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('red caída'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(notifyNewOrder(order)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
