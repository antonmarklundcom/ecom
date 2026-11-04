#!/usr/bin/env node
// `pnpm start` — el servidor de producción, con una sola instancia por app.
//
// Hace lo mismo que `next start` (mismos argumentos, mismo PORT del entorno,
// que es como Hostinger le dice el puerto) más dos cosas, explicadas en
// `scripts/start-guard.mjs` y en DEPLOY.md § "Procesos que se apilan":
//
//   - antes de arrancar, cierra la instancia anterior de **esta** app si quedó
//     viva (sólo si puede verificar que es nuestra);
//   - reenvía SIGTERM/SIGINT/SIGHUP al servidor y sale con su código.
//
// `START_GUARD=off` lo apaga: arranca `next start` igual, sin pidfile y sin
// cerrar nada (docs/ENV-OPCIONAL.md). Es la salida de emergencia si algún día
// el guard molesta, sin tener que tocar `package.json`.
//
// Node pelado a propósito: nada de tsx en el arranque del servidor.

import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { arrancar, avisar, codigoDeSalida, reenviarSenales, rutaPidfile } from './start-guard.mjs';

const appDir = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const nextBin = createRequire(path.join(appDir, 'package.json')).resolve('next/dist/bin/next');
const args = [nextBin, 'start', ...process.argv.slice(2)];

if ((process.env.START_GUARD ?? '').trim().toLowerCase() === 'off') {
  // Sin guard: el `next start` de siempre, con las señales reenviadas igual.
  const { spawn } = await import('node:child_process');
  avisar('info', 'START_GUARD=off: se arranca sin control de instancia única');
  const hijo = spawn(process.execPath, args, { cwd: appDir, stdio: 'inherit' });
  const soltar = reenviarSenales({ proceso: process, hijo });
  hijo.on('error', (error) => {
    avisar('error', 'no se pudo lanzar el servidor', { error: error.message });
    process.exit(1);
  });
  hijo.on('exit', (code, signal) => {
    soltar();
    process.exit(codigoDeSalida(code, signal));
  });
} else {
  await arrancar({
    comando: process.execPath,
    args,
    appDir,
    rutaPidfile: rutaPidfile({ appDir }),
    ficha: randomBytes(16).toString('hex'),
  });
}
