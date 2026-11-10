import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cambiarEstadoCategoria,
  crearCategoria,
  editarCategoria,
  moverCategoria,
} from "@/app/actions/admin-categories";
import { guardarAjustes, restaurarAjustes } from "@/app/actions/admin-ajustes";
import { advanceOrder } from "@/app/actions/admin-orders";
import {
  adjustVariantStock,
  bulkSetProductsActive,
  saveProduct,
} from "@/app/actions/admin-products";

import { closeTestDb, hasTestDb, resetTables } from "../helpers/db";
import {
  createAdminUser,
  createCategory,
  createOrder,
  createProduct,
  createVariant,
} from "../helpers/factories";

/**
 * Las escrituras del panel tiran la caché de la vidriera.
 *
 * La home, la categoría y la ficha son ISR (ARCH.md §6): sin esta llamada, el
 * dueño corrige un precio, recarga y sigue viendo el viejo hasta 5 minutos —
 * el bug que llega como "no me tomó el cambio". El espía es el helper único
 * (`src/lib/revalidar-vidriera.ts`); que **cada** acción lo llame lo cuida
 * `tests/unit/vidriera-cache.test.ts` leyendo el código, y acá se ejecutan de
 * verdad, contra la base, las de cada archivo.
 */

const mocks = vi.hoisted(() => ({
  session: {
    userId: 0,
    role: "owner",
    email: "test@example.test",
    sessionVersion: 1,
  },
  revalidarVidriera: vi.fn(),
}));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  getSession: async () => mocks.session,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/revalidar-vidriera", () => ({
  revalidarVidriera: mocks.revalidarVidriera,
}));

describe.skipIf(!hasTestDb)("las escrituras del panel invalidan la vidriera", () => {
  beforeEach(async () => {
    await resetTables();
    mocks.session.userId = await createAdminUser();
    mocks.revalidarVidriera.mockClear();
  });
  afterAll(closeTestDb);

  function invalido(): void {
    expect(mocks.revalidarVidriera).toHaveBeenCalledTimes(1);
  }

  it("categorías: crear, editar, apagar y mover", async () => {
    const creada = await crearCategoria({ name: "Remeras" });
    expect(creada).toMatchObject({ ok: true });
    invalido();

    const otra = await createCategory("pantalones");
    const id = (creada as { ok: true; id: number }).id;

    mocks.revalidarVidriera.mockClear();
    expect(
      await editarCategoria({ categoryId: id, name: "Remeras y musculosas" })
    ).toMatchObject({ ok: true });
    invalido();

    mocks.revalidarVidriera.mockClear();
    expect(
      await moverCategoria({ categoryId: otra, direction: "up" })
    ).toMatchObject({ ok: true });
    invalido();

    mocks.revalidarVidriera.mockClear();
    expect(
      await cambiarEstadoCategoria({ categoryId: id, isActive: false })
    ).toMatchObject({ ok: true });
    invalido();
  });

  it("productos: alta, stock y acción masiva", async () => {
    const categoryId = await createCategory();
    expect(
      await saveProduct({
        slug: "remera-nueva",
        name: "Remera nueva",
        categoryId,
        ivaRate: 10,
        isActive: true,
        published: true,
      })
    ).toMatchObject({ ok: true });
    invalido();

    const productId = await createProduct(categoryId);
    const variantId = await createVariant({ productId, onHand: 3 });

    mocks.revalidarVidriera.mockClear();
    expect(
      await adjustVariantStock({
        variantId,
        productId,
        delta: 2,
        reason: "Llegó mercadería",
      })
    ).toMatchObject({ ok: true });
    invalido();

    mocks.revalidarVidriera.mockClear();
    expect(
      await bulkSetProductsActive({
        productIds: [productId],
        isActive: false,
        reason: "Fuera de temporada",
      })
    ).toMatchObject({ ok: true });
    invalido();
  });

  it("ajustes de la tienda: guardar y restaurar una sección", async () => {
    expect(
      await guardarAjustes({
        seccion: "anuncio",
        valores: { activo: true, texto: "Feriado el lunes", href: "" },
      })
    ).toEqual({ ok: true });
    invalido();

    mocks.revalidarVidriera.mockClear();
    expect(await restaurarAjustes({ seccion: "anuncio" })).toEqual({ ok: true });
    invalido();
  });

  it("pedidos: cancelar desde el panel libera stock que se ve en la vidriera", async () => {
    const orderId = await createOrder({ status: "pendiente_pago" });
    expect(
      await advanceOrder({ orderId, to: "cancelado", reason: "Lo pidió" })
    ).toEqual({ ok: true });
    invalido();
  });

  it("una escritura rechazada no invalida nada", async () => {
    expect(await crearCategoria({ name: "" })).toMatchObject({ ok: false });
    expect(mocks.revalidarVidriera).not.toHaveBeenCalled();
  });
});
