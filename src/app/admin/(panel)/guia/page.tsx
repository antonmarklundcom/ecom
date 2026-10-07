import Link from "next/link";
import { requireCapabilityPage } from "@/lib/admin-guard";
export default async function AdminGuide() {
  await requireCapabilityPage("usuarios");
  return (
    <section className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">Guía de la tienda</h1>
      <p>
        Los productos de demostración son ficticios. Revisá o eliminá esos
        productos antes de vender; no prueban stock ni información del
        proveedor.
      </p>
      <ol className="list-decimal space-y-3 pl-6">
        <li>
          <Link className="underline" href="/admin/ajustes">
            Configurá marca, contacto y política de pagos.
          </Link>
        </li>
        <li>
          <Link className="underline" href="/admin/productos">
            Cargá productos reales o previsualizá una importación.
          </Link>{" "}
          Verificá ficha técnica, variantes, fotos propias/autorizadas, precios
          e inventario. El checklist es una ayuda; no publica ni habilita
          compras.
        </li>
        <li>
          Configurá banco y proveedor de pago antes de ofrecer esos métodos.
          Hacé una compra de prueba completa.
        </li>
        <li>
          Guardá un backup y verificá su restauración en una base aislada antes
          de actualizar.
        </li>
      </ol>
      <p>
        El menú se puede reordenar con arrastre o flechas; Guardar persiste por
        usuario en este navegador. Cancelar descarta el borrador y Restaurar
        vuelve al orden inicial. No cambia permisos.
      </p>
      <p>
        Repetir la inicialización exige autorización explícita y puede cambiar
        la contraseña del dueño e invalidar sus sesiones. La recuperación de
        contraseña y el correo transaccional necesitan una implementación y un
        proveedor propios.
      </p>
    </section>
  );
}
