import { t } from "@/i18n";
import { prepararImagenParaSubir, yaPreparada } from "@/lib/preparar-imagen";

/**
 * Prepara en el navegador la foto del campo `file` de un formulario del panel
 * (`src/lib/preparar-imagen.ts`) antes de mandarlo a la acción. Devuelve el
 * mensaje de error para mostrar, o `null` si quedó lista.
 *
 * La usan todas las subidas de fotos del panel: producto, categoría,
 * portada, logo, favicon y QR del banco.
 */
export async function prepararFoto(data: FormData): Promise<string | null> {
  if (yaPreparada(data)) return null;
  try {
    await prepararImagenParaSubir(data, {
      mensajes: {
        elegi: t("panel.foto.preparar.elegi"),
        noSePudoLeer: t("panel.foto.preparar.noSePudoLeer"),
        demasiadoGrande: t("panel.foto.preparar.demasiadoGrande"),
        sinWebp: t("panel.foto.preparar.sinWebp"),
        pesada: t("panel.foto.preparar.pesada"),
      },
    });
    return null;
  } catch (error) {
    return error instanceof Error && error.message
      ? error.message
      : t("panel.foto.preparar.noSePudoLeer");
  }
}
