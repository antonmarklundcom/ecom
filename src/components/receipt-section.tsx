import { ReceiptUpload } from "@/components/receipt-upload";
import { t } from "@/i18n";

/**
 * "Subí tu comprobante" en la página del pedido.
 *
 * Sin almacenamiento de comprobantes (Cloudinary en `/admin/integraciones` o
 * en el entorno) no se dibuja el formulario: la compradora elegía el
 * archivo, esperaba la subida y recibía un error genérico. En su lugar va el
 * camino que sí funciona —WhatsApp con el pedido ya escrito, si la tienda
 * tiene número público— o, si tampoco hay eso, a dónde escribirle
 * (docs/TEMPLATE-IMPROVEMENT-PLAN.md D3).
 */
export function ReceiptSection({
  orderNumber,
  token,
  remaining,
  storageReady,
  waHref,
}: {
  orderNumber: string;
  token: string;
  remaining: number;
  storageReady: boolean;
  waHref: string | null;
}) {
  return (
    <section className="border-border mt-6 rounded-xl border p-4">
      <h2 className="font-medium">{t("pedido.comprobante.titulo")}</h2>
      {storageReady ? (
        <div className="mt-3">
          <ReceiptUpload
            orderNumber={orderNumber}
            token={token}
            remaining={remaining}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm">
          {waHref
            ? t("pedido.comprobante.sinAlmacenamiento")
            : t("pedido.comprobante.sinAlmacenamientoNiWhatsApp")}
        </p>
      )}
      {waHref ? (
        <>
          {storageReady ? (
            <p className="text-muted-foreground mt-4 text-xs">
              {t("pedido.comprobante.waAyuda")}
            </p>
          ) : null}
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border mt-2 inline-flex rounded-lg border px-4 py-2 text-sm"
          >
            {t("pedido.comprobante.waBoton")}
          </a>
        </>
      ) : null}
    </section>
  );
}
