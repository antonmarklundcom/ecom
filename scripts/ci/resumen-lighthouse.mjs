#!/usr/bin/env node
// Sólo lo usa el job `lighthouse` de `.github/workflows/ci.yml`: traduce el
// `manifest` que deja `treosh/lighthouse-ci-action` (un JSON con un resumen
// por URL, puntajes de 0 a 1) en una tabla para `$GITHUB_STEP_SUMMARY`, con el
// puntaje de performance como número de 0 a 100 y la meta de ≥ 90.
//
// Nunca falla: es una alarma, no un gate (el job tiene `continue-on-error`).
// Sin manifest —la action no llegó a medir— lo dice en el resumen.
//
// Uso: LIGHTHOUSE_MANIFEST='<json>' node scripts/ci/resumen-lighthouse.mjs >> "$GITHUB_STEP_SUMMARY"
import { pathToFileURL } from 'node:url';

export const META_PERFORMANCE = 90;

/** La ruta de la URL (`/producto/x`), que es lo que se lee en la tabla. */
function ruta(url) {
  try {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}`;
  } catch {
    return String(url);
  }
}

/** Puntaje de 0..1 a 0..100, o `null` si Lighthouse no lo dio. */
function puntaje(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor * 100) : null;
}

/**
 * @param {string | undefined} manifestCrudo el output `manifest` de la action.
 * @returns {string} Markdown para el resumen de la corrida.
 */
export function resumenLighthouse(manifestCrudo) {
  const titulo = `### Lighthouse (mobile) — performance, meta ≥ ${META_PERFORMANCE}\n\n`;

  let manifest;
  try {
    manifest = JSON.parse(manifestCrudo ?? '');
  } catch {
    manifest = null;
  }
  const corridas = Array.isArray(manifest) ? manifest : [];
  // Con `runs: 1` hay una por URL; con más, la representativa de cada una.
  const representativas = corridas.filter(
    (c) => c && typeof c === 'object' && c.isRepresentativeRun !== false,
  );

  if (representativas.length === 0) {
    return `${titulo}Lighthouse no dejó resultados (mirá el log del paso "Lighthouse CI"). No bloquea nada.\n`;
  }

  const filas = representativas.map((c) => {
    const valor = puntaje(c.summary?.performance);
    const estado = valor === null ? '— sin puntaje' : valor >= META_PERFORMANCE ? '✅' : '⚠️ debajo de la meta';
    return `| \`${ruta(c.url)}\` | ${valor ?? '—'} | ${estado} |`;
  });

  return (
    titulo +
    '| Página | Performance | |\n' +
    '|---|---:|---|\n' +
    filas.join('\n') +
    '\n\nEs una alarma: un puntaje bajo no frena el merge (la varianza del runner compartido es mucha). ' +
    'Lo que sí bloquea es el presupuesto de JS de `tests/e2e/presupuesto.spec.ts`.\n'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(resumenLighthouse(process.env.LIGHTHOUSE_MANIFEST));
}
