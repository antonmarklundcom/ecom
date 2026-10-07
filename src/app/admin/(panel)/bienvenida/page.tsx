import Link from "next/link";
import { requireCapabilityPage } from "@/lib/admin-guard";
export default async function AdminWelcome() {
  await requireCapabilityPage("usuarios");
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Tu tienda está inicializada</h1>
      <p>
        Revisá los datos y prepará tu catálogo real antes de comenzar a vender.
      </p>
      <Link className="underline" href="/admin/guia">
        Abrir la guía de primeros pasos
      </Link>
      <Link className="underline" href="/admin/productos">
        Preparar productos
      </Link>
    </section>
  );
}
