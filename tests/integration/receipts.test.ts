import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { RECEIPT_MAX_PER_ORDER, ReceiptError, countReceipts, recordReceipt } from '../../src/domain/receipts';
import { closeTestDb, hasTestDb, resetTables } from '../helpers/db';
import { createOrder } from '../helpers/factories';

describe.skipIf(!hasTestDb)('recordReceipt cap under concurrency', () => {
  beforeEach(resetTables);
  afterAll(closeTestDb);

  it.each([RECEIPT_MAX_PER_ORDER, RECEIPT_MAX_PER_ORDER - 1])(
    'serializes two uploads with %i receipts already recorded',
    async (initialCount) => {
      const orderId = await createOrder();
      const upload = (suffix: string) => recordReceipt({
        orderId, cloudinaryId: `test-${orderId}-${suffix}`, mime: 'image/jpeg', bytes: 100,
      });
      for (let i = 0; i < initialCount; i += 1) await upload(`seed-${i}`);

      const results = await Promise.allSettled([upload('a'), upload('b')]);
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(results.filter((result) => result.status === 'fulfilled'))
        .toHaveLength(RECEIPT_MAX_PER_ORDER - initialCount);
      expect(rejected).toHaveLength(2 - (RECEIPT_MAX_PER_ORDER - initialCount));
      for (const result of rejected) {
        expect(result.reason).toBeInstanceOf(ReceiptError);
        expect(result.reason).toMatchObject({
          code: 'error.comprobante.demasiados', params: { maximo: RECEIPT_MAX_PER_ORDER },
        });
      }
      expect(await countReceipts(orderId)).toBe(RECEIPT_MAX_PER_ORDER);
    },
  );
});
