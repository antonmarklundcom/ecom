import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import {
  ACTION_BODY_MAX_BYTES,
  CATALOG_FILE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_BYTES,
  RECEIPT_MAX_BYTES,
} from "@/lib/upload-limits";

/**
 * Next corta el body de una server action en 1 MB y el del proxy en 10 MB si
 * `next.config.ts` no dice otra cosa. Un comprobante de 2 MB —la foto normal
 * de un celular— terminaba en un 413 antes de llegar a `validateReceipt`.
 */
describe("techo de las subidas", () => {
  const mayor = Math.max(RECEIPT_MAX_BYTES, PRODUCT_IMAGE_MAX_BYTES, CATALOG_FILE_MAX_BYTES);

  it("deja lugar al archivo más grande más el resto del multipart", () => {
    expect(ACTION_BODY_MAX_BYTES).toBeGreaterThan(mayor);
  });

  it("next.config.ts sube el límite de las server actions y del proxy", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(ACTION_BODY_MAX_BYTES);
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(ACTION_BODY_MAX_BYTES);
  });
});
