import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DOCS_DEL_TEMPLATE, esMaquinaria } from '../../scripts/template-shared';

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
 *
 * En una tienda se revisa sólo lo que publica el template (maquinaria y sus
 * docs): `src/config/tienda.ts`, la piel rediseñada y los docs propios son de
 * la tienda, `template:sync` nunca los pisa, y un comentario viejo ahí no es
 * algo que la tienda arregle trayendo el template (O23: Norte).
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

/** En el template se revisa todo; en una tienda, lo que el template publica. */
function seRevisa(archivo: string, esTemplate: boolean): boolean {
  if (PERMITIDOS.some((re) => re.test(archivo))) return false;
  if (/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|gz)$/i.test(archivo)) return false;
  return (
    esTemplate ||
    esMaquinaria(archivo) ||
    (DOCS_DEL_TEMPLATE as readonly string[]).includes(archivo)
  );
}

/** Lo que sí se puede nombrar en cualquier lado. */
const TOLERADOS = /(?:image_|qr_)?cloudinary_id|fotos[:-]migrar-cloudinary|\bcloudinaryId\b/gi;

describe('el proveedor de imágenes anterior no aparece fuera de la migración y el historial', () => {
  it('ningún archivo versionado lo menciona', async () => {
    const archivos = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      // El repo del template tiene `tiendas.json`, que nunca viaja a una tienda.
      .filter((archivo) => seRevisa(archivo, existsSync('tiendas.json')));

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

describe('qué revisa en una tienda', () => {
  it('la config y la piel de la tienda no; la maquinaria y los docs del template sí', () => {
    expect(seRevisa('src/config/tienda.ts', false)).toBe(false);
    expect(seRevisa('README.md', false)).toBe(false);
    expect(seRevisa('src/lib/imagenes-r2.ts', false)).toBe(true);
    expect(seRevisa('NEW-STORE.md', false)).toBe(true);
    expect(seRevisa('src/config/tienda.ts', true)).toBe(true);
    expect(seRevisa('CHANGELOG.md', true)).toBe(false);
  });
});
