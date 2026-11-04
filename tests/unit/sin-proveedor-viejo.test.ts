import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Las imágenes, los comprobantes y los backups viven en R2. El proveedor
 * anterior sólo puede aparecer en:
 *
 * - el script de migración única (`scripts/fotos-migrar-cloudinary.ts`) y su
 *   test, que son los que saben bajar de ahí;
 * - el historial: `CHANGELOG.md`, `fable/` (revisiones y planes cerrados),
 *   `docs/TEMPLATE-IMPROVEMENT-PLAN.md` (la auditoría de octubre, cerrada) y
 *   las migraciones de `drizzle/`, que no se reescriben;
 * - `.env.example`, que no se edita (reglas del repo: sólo las cinco
 *   imprescindibles; su comentario todavía nombra al proveedor viejo);
 * - los nombres de columnas SQL históricos (`cloudinary_id`,
 *   `image_cloudinary_id`, `qr_cloudinary_id`), que no se renombran para no
 *   migrar, el nombre del comando de migración en la documentación, y el alias
 *   deprecado `cloudinaryId` de la foto del hero (para que el `tienda.ts` de
 *   una tienda, que `template:sync` nunca pisa, siga compilando).
 *
 * Cualquier otra mención es código o documentación que quedó vieja.
 */

const PERMITIDOS = [
  /^scripts\/fotos-migrar-cloudinary\.ts$/,
  /^tests\/unit\/fotos-scripts\.test\.ts$/,
  /^tests\/unit\/sin-proveedor-viejo\.test\.ts$/,
  /^CHANGELOG\.md$/,
  /^\.env\.example$/,
  /^fable\//,
  /^drizzle\//,
  /^docs\/TEMPLATE-IMPROVEMENT-PLAN\.md$/,
  /^pnpm-lock\.yaml$/,
];

/** Lo que sí se puede nombrar en cualquier lado. */
const TOLERADOS = /(?:image_|qr_)?cloudinary_id|fotos[:-]migrar-cloudinary|\bcloudinaryId\b/gi;

describe('el proveedor de imágenes anterior no aparece fuera de la migración y el historial', () => {
  it('ningún archivo versionado lo menciona', async () => {
    const archivos = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((archivo) => !PERMITIDOS.some((re) => re.test(archivo)))
      .filter((archivo) => !/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|gz)$/i.test(archivo));

    const conMencion: string[] = [];
    for (const archivo of archivos) {
      let texto: string;
      try {
        texto = await readFile(path.join(process.cwd(), archivo), 'utf8');
      } catch {
        continue;
      }
      if (/cloudinary/i.test(texto.replace(TOLERADOS, ''))) conMencion.push(archivo);
    }
    expect(conMencion).toEqual([]);
  });
});
