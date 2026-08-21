import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportedAsyncFunctions, listSourceFiles, readCode } from '../helpers/source';

/**
 * Guardarraíl del PR #4 (PLAN.md 4.9): **toda** server action de admin
 * re-chequea el rol.
 *
 * El middleware de `/admin/*` no alcanza y no es un detalle teórico: una
 * server action se compila a un endpoint HTTP con un id propio, y ese id
 * viaja en el HTML de cualquier página que la use. Quien lo tenga puede
 * hacerle POST directo, sin navegar nunca a una URL `/admin` — el middleware
 * jamás corre. La única defensa real es el guard adentro de la función.
 *
 * Este test es el "verificar guards en cada server action" de la revisión de
 * seguridad, corriendo en CI para que siga siendo cierto cuando alguien
 * agregue la acción número doce.
 */

const ACTIONS_DIR = path.join('src', 'app', 'actions');

/** El login no puede exigir sesión: es el que la crea. */
const PUBLIC_ACTION_MODULES = new Set([path.join(ACTIONS_DIR, 'admin-auth.ts')]);

async function adminActionModules(): Promise<string[]> {
  const files = await listSourceFiles([ACTIONS_DIR]);
  return files.filter(
    (file) => path.basename(file).startsWith('admin-') && !PUBLIC_ACTION_MODULES.has(file),
  );
}

// La extracción de cuerpos (llaves contadas, genéricos del tipo de retorno
// salteados) vive en `tests/helpers/source.ts` y la comparten los tres tests
// que grepean cuerpos de funciones.
const exportedActions = exportedAsyncFunctions;

describe('server actions de admin', () => {
  it('hay acciones de admin para revisar (el test no se quedó sin objetivo)', async () => {
    const modules = await adminActionModules();
    expect(modules.length).toBeGreaterThan(0);

    const total = (
      await Promise.all(
        modules.map(async (file) => exportedActions(await readCode(file)).length),
      )
    ).reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('cada acción exportada re-chequea la sesión antes de tocar nada', async () => {
    const offenders: string[] = [];

    for (const file of await adminActionModules()) {
      const code = await readCode(file);
      for (const action of exportedActions(code)) {
        if (!/require(Admin|Staff|Owner)Session\s*\(/.test(action.body)) {
          offenders.push(`${file} → ${action.name}()`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('el guard es lo primero que corre, antes de leer la entrada', async () => {
    const offenders: string[] = [];

    for (const file of await adminActionModules()) {
      const code = await readCode(file);
      for (const action of exportedActions(code)) {
        const guardAt = action.body.search(/require(Admin|Staff|Owner)Session\s*\(/);
        const parseAt = action.body.search(/\.safeParse\s*\(|formData\.get\s*\(/);
        // Validar la entrada antes de saber quién llama no rompe nada por sí
        // solo, pero es el orden en el que después se cuela una consulta a la
        // DB arriba del guard.
        if (guardAt !== -1 && parseAt !== -1 && parseAt < guardAt) {
          offenders.push(`${file} → ${action.name}()`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('las páginas del panel cuelgan del layout con guard', async () => {
    const files = await listSourceFiles([path.join('src', 'app', 'admin')]);
    const pages = files.filter((file) => path.basename(file) === 'page.tsx');

    // Todo lo que no sea el login vive bajo el route group `(panel)`, cuyo
    // layout llama a requireAdmin(). Una página suelta en /admin/algo se
    // renderizaría sin guard.
    const unguarded = pages.filter(
      (file) => !file.includes(`(panel)`) && !file.endsWith(path.join('login', 'page.tsx')),
    );

    expect(unguarded).toEqual([]);
  });
});

/**
 * La matriz de PLAN.md PR B, clavada acción por acción.
 *
 * El test de arriba pide "algún guard"; éste pide **el que corresponde**.
 * Sin esto, cambiar `requireOwnerSession` por `requireAdminSession` en la
 * acción de reembolsos —un carácter de diferencia en un merge apurado— pasa
 * CI verde y le devuelve a cualquier `vendedor` el poder de registrar plata
 * que sale.
 *
 * Agregar una acción obliga a decidir acá quién la puede llamar: una acción
 * que no está en esta tabla falla el test. Esa es la idea.
 */
const GUARD_ESPERADO: Readonly<Record<string, 'Admin' | 'Staff' | 'Owner'>> = {
  // Los tres roles avanzan pedidos; qué destino puede cada uno lo decide
  // `assertCanTransitionTo` adentro, no el guard del módulo.
  advanceOrder: 'Admin',

  // Comprobantes: decidir si una transferencia entró es plata.
  decideReceipt: 'Staff',
  previewReceipt: 'Staff',

  // Recuperar un pedido con un pago huérfano es operación; devolverlo es
  // plata que sale y no se delega.
  retryPaymentRevival: 'Staff',
  markPaymentRefunded: 'Owner',

  // Catálogo y stock: la operación diaria, sin el mostrador.
  saveProduct: 'Staff',
  saveProductVariant: 'Staff',
  adjustVariantStock: 'Staff',
  uploadProductImage: 'Staff',
  removeProductImage: 'Staff',

  // Un CSV es la base del comercio en un archivo que sale del edificio.
  exportOrdersCsv: 'Owner',
  exportProductsCsv: 'Owner',
  // La lista de gente que consintió recibir mensajes: lo que se lleva quien
  // se va a la competencia.
  exportMarketingOptInsCsv: 'Owner',

  // Repartir accesos es repartir todo lo de arriba: quien puede crear un
  // usuario puede crearse un segundo dueño.
  crearUsuario: 'Owner',
  cambiarEstadoUsuario: 'Owner',
  cambiarRolUsuario: 'Owner',
  resetearPassword: 'Owner',

  // Un cupón es plata que la tienda resigna en cada venta, y uno mal puesto se
  // descubre cuando ya lo usaron cien personas.
  crearCupon: 'Owner',
  editarCupon: 'Owner',
  cambiarEstadoCupon: 'Owner',

  // Apagar una categoría le saca de la vidriera también a sus productos, y
  // cambiarle el slug rompe todas las URLs de esa sección que anden dando
  // vueltas. Un encargado no tiene por qué poder vaciar la tienda de un clic.
  crearCategoria: 'Owner',
  editarCategoria: 'Owner',
  cambiarEstadoCategoria: 'Owner',
  moverCategoria: 'Owner',

  // A qué cuenta transfieren las compradoras. Quien lo puede cambiar puede
  // desviar la facturación entera a otra cuenta sin dejar un pedido raro ni un
  // log de plata: la tienda sigue andando igual y el dueño se entera cuando
  // mira su banco. No se delega.
  guardarDatosBancarios: 'Owner',
  subirQrBancario: 'Owner',
  quitarQrBancario: 'Owner',

  // El flete es plata que entra en cada pedido, y el error se cobra en
  // silencio: no rompe nada, no deja log, y se descubre al cerrar el mes.
  crearZonaEnvio: 'Owner',
  editarZonaEnvio: 'Owner',
  cambiarEstadoZonaEnvio: 'Owner',
  moverZonaEnvio: 'Owner',
};

describe('cada acción llama al guard que le corresponde', () => {
  it('ninguna acción quedó fuera de la matriz', async () => {
    const sinDeclarar: string[] = [];

    for (const file of await adminActionModules()) {
      for (const action of exportedActions(await readCode(file))) {
        if (!(action.name in GUARD_ESPERADO)) sinDeclarar.push(`${file} → ${action.name}()`);
      }
    }

    expect(sinDeclarar).toEqual([]);
  });

  it('la matriz no quedó con acciones que ya no existen', async () => {
    const existentes = new Set<string>();
    for (const file of await adminActionModules()) {
      for (const action of exportedActions(await readCode(file))) existentes.add(action.name);
    }

    const fantasmas = Object.keys(GUARD_ESPERADO).filter((name) => !existentes.has(name));
    expect(fantasmas).toEqual([]);
  });

  it('el guard de cada acción es exactamente el declarado', async () => {
    const offenders: string[] = [];

    for (const file of await adminActionModules()) {
      for (const action of exportedActions(await readCode(file))) {
        const esperado = GUARD_ESPERADO[action.name];
        if (!esperado) continue;

        const usados = [...action.body.matchAll(/require(Admin|Staff|Owner)Session\s*\(/g)].map(
          (match) => match[1],
        );

        if (usados.length !== 1 || usados[0] !== esperado) {
          offenders.push(
            `${file} → ${action.name}(): esperaba require${esperado}Session, encontré [${usados.join(', ') || 'ninguno'}]`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
