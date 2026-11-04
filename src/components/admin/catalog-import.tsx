"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  applyCatalogImport,
  previewCatalogImport,
  type CatalogImportSummary,
} from "@/app/actions/admin-products";
import { t, tPlural } from "@/i18n";

/**
 * Carga masiva de productos por planilla, desde `/admin/productos`
 * (formato: docs/CATALOGO-CSV.md).
 *
 * Tres pasos: "Revisar" corre el ensayo (`previewCatalogImport`, no escribe
 * nada) y muestra cuentas, avisos y **posibles duplicados**; si hay
 * duplicados, hay que marcarlos como revisados; recién ahí "Confirmar e
 * importar" escribe. Es el mismo comportamiento de `pnpm importar:productos`
 * —ensayo por defecto, `--aplicar` (y `--revisado`) para escribir— con
 * botones en vez de flags.
 *
 * La confirmación pide los lotes **de a uno y en orden** (`applyCatalogImport`
 * con `lote`): cada lote es una transacción en el servidor, y esta pantalla
 * muestra cuáles entraron. Si la conexión se corta a mitad de un lote, no hay
 * forma de saber desde acá si ese lote llegó a guardarse: se dice así, con los
 * productos de los lotes confirmados, y se pide volver a Revisar antes de
 * reintentar (reimportar no duplica).
 *
 * El archivo elegido se guarda en `inputRef` y se manda de nuevo con cada
 * lote: el `<input type="file">` del navegador no pierde el `File` entre el
 * ensayo y la confirmación, y el servidor no guarda nada entre llamadas.
 */
export function CatalogImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pisarStock, setPisarStock] = useState(false);
  const [summary, setSummary] = useState<CatalogImportSummary | null>(null);
  const [revisados, setRevisados] = useState(false);
  const [errores, setErrores] = useState<string[] | null>(null);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [lotesListos, setLotesListos] = useState<string[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const limpiar = (): void => {
    setSummary(null);
    setRevisados(false);
    setErrores(null);
    setAdvertencias([]);
    setProgreso(null);
    setLotesListos([]);
    setFallo(null);
  };

  const buildFormData = (): FormData | null => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("adminError.elegiArchivo"));
      return null;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("pisarStock", pisarStock ? "true" : "false");
    return formData;
  };

  const revisar = (): void => {
    const formData = buildFormData();
    if (!formData) return;

    limpiar();
    startTransition(async () => {
      const result = await previewCatalogImport(formData);
      if (!result.ok) {
        setErrores(result.errores);
        setAdvertencias(result.advertencias ?? []);
        return;
      }
      setAdvertencias(result.advertencias);
      setSummary(result);
    });
  };

  const confirmar = (): void => {
    if (!summary) return;
    const revision = summary.revision;
    const lotes = summary.lotes;

    setErrores(null);
    setFallo(null);
    setLotesListos([]);
    startTransition(async () => {
      let productos = 0;
      let variantes = 0;
      let fotosSubidas = 0;
      let fotosOmitidas = 0;
      let fotosFallidas = 0;

      for (let lote = 0; lote < lotes; lote += 1) {
        const formData = buildFormData();
        if (!formData) return;
        formData.set("lote", String(lote));
        formData.set("revision", revision);
        formData.set("duplicadosRevisados", revisados ? "true" : "false");
        setProgreso(
          t("panel.productos.importar.progreso", { lote: lote + 1, lotes })
        );

        let result: Awaited<ReturnType<typeof applyCatalogImport>>;
        try {
          result = await applyCatalogImport(formData);
        } catch {
          // La respuesta no llegó: el lote pudo haber entrado o no.
          setProgreso(null);
          setSummary(null);
          setFallo(
            t("panel.productos.importar.conexionCortada", {
              lote: lote + 1,
              lotes,
              previos: productos,
            })
          );
          return;
        }
        if (!result.ok) {
          setProgreso(null);
          setSummary(null);
          setFallo(
            t("panel.productos.importar.loteFallo", {
              lote: lote + 1,
              lotes,
              previos: productos,
            })
          );
          setErrores(result.errores);
          return;
        }

        const listo = result;
        productos += listo.productos;
        variantes += listo.variantesEscritas;
        fotosSubidas += listo.fotosSubidas;
        fotosOmitidas += listo.fotosOmitidas;
        fotosFallidas += listo.fotosFallidas.length;
        setLotesListos((previos) => [
          ...previos,
          t("panel.productos.importar.loteListo", {
            lote: lote + 1,
            lotes,
            productos: listo.productos,
            variantes: listo.variantesEscritas,
          }),
        ]);
      }

      setProgreso(null);
      toast.success(
        fotosSubidas > 0
          ? t("panel.productos.importar.listoConFotos", {
              productos,
              variantes,
              fotos: fotosSubidas,
            })
          : t("panel.productos.importar.listo", { productos, variantes })
      );
      if (fotosOmitidas > 0) {
        toast.warning(
          t("panel.productos.importar.fotosOmitidas", { n: fotosOmitidas })
        );
      }
      if (fotosFallidas > 0) {
        toast.error(
          tPlural("panel.productos.importar.fotosFallidas", fotosFallidas)
        );
      }
      setSummary(null);
      setRevisados(false);
      setAdvertencias([]);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const faltaRevisar =
    summary !== null && summary.duplicados.length > 0 && !revisados;

  return (
    <div className="border-border rounded-xl border p-4">
      <h2 className="text-sm font-semibold">
        {t("panel.productos.importar.titulo")}
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        {t("panel.productos.importar.ayuda")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv"
          aria-label={t("panel.productos.importar.titulo")}
          disabled={isPending}
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? null);
            limpiar();
          }}
          className="text-sm"
        />
        <button
          type="button"
          onClick={revisar}
          disabled={isPending || !fileName}
          className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {t("panel.productos.importar.revisar")}
        </button>
      </div>

      <label className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={pisarStock}
          disabled={isPending}
          onChange={(event) => {
            setPisarStock(event.target.checked);
            setSummary(null);
            setRevisados(false);
          }}
        />
        {t("panel.productos.importar.pisarStock")}
      </label>

      {fallo ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive mt-3 rounded-lg border p-3 text-xs font-medium"
        >
          {fallo}
        </p>
      ) : null}

      {errores && errores.length > 0 ? (
        <ul className="border-destructive/40 bg-destructive/5 text-destructive mt-3 max-h-48 list-disc space-y-1 overflow-y-auto rounded-lg border p-3 pl-6 text-xs">
          {errores.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ) : null}

      {advertencias.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-400/60 p-3 text-xs">
          <p className="font-medium">
            {t("panel.productos.importar.advertencias")}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {advertencias.map((aviso, index) => (
              <li key={index}>{aviso}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lotesListos.length > 0 ? (
        <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
          {lotesListos.map((linea, index) => (
            <li key={index}>✓ {linea}</li>
          ))}
        </ul>
      ) : null}
      {progreso ? (
        <p role="status" className="mt-2 text-xs font-medium">
          {progreso}
        </p>
      ) : null}

      {summary ? (
        <div className="bg-muted/50 mt-3 rounded-lg p-3 text-xs">
          {summary.duplicados.length > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-400 p-3">
              <p className="font-medium">
                {t("panel.productos.importar.duplicados.titulo")}
              </p>
              <p className="text-muted-foreground mt-1">
                {t("panel.productos.importar.duplicados.ayuda")}
              </p>
              <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-4">
                {summary.duplicados.map((aviso, index) => (
                  <li key={index}>{aviso}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={revisados}
                  disabled={isPending}
                  onChange={(event) => setRevisados(event.target.checked)}
                />
                {t("panel.productos.importar.duplicados.revisados")}
              </label>
            </div>
          ) : null}
          <p>
            {tPlural(
              "panel.productos.importar.productosNuevos",
              summary.productosNuevos
            )}
            {" · "}
            {tPlural(
              "panel.productos.importar.productosActualizar",
              summary.productosActualizar
            )}
          </p>
          <p className="mt-1">
            {tPlural(
              "panel.productos.importar.variantesNuevas",
              summary.variantesNuevas
            )}
            {" · "}
            {tPlural(
              "panel.productos.importar.variantesActualizar",
              summary.variantesActualizar
            )}
            {summary.variantesActualizar > 0
              ? summary.pisaStock
                ? ` — ${t("panel.productos.importar.pisandoStock")}`
                : ` — ${t("panel.productos.importar.stockIntacto")}`
              : ""}
          </p>
          {summary.categoriasNuevas.length > 0 ? (
            <p className="mt-1">
              {t("panel.productos.importar.categoriasNuevas", {
                categorias: summary.categoriasNuevas.join(", "),
              })}
            </p>
          ) : null}
          {summary.fotosNuevas > 0 ? (
            <p className="mt-1">
              {tPlural(
                "panel.productos.importar.fotosNuevas",
                summary.fotosNuevas
              )}
            </p>
          ) : null}
          {summary.proveedores &&
          summary.ofertasNuevas + summary.ofertasActualizar > 0 ? (
            <p className="mt-1">
              {tPlural(
                "panel.productos.importar.ofertasNuevas",
                summary.ofertasNuevas
              )}
              {" · "}
              {tPlural(
                "panel.productos.importar.ofertasActualizar",
                summary.ofertasActualizar
              )}
            </p>
          ) : null}
          {summary.productosNuevos > 0 ? (
            <p className="mt-1">
              {t("panel.productos.importar.nuevosBorrador")}
            </p>
          ) : null}
          {summary.preciosCambian > 0 ? (
            <p className="mt-1">
              {tPlural(
                "panel.productos.importar.preciosCambian",
                summary.preciosCambian
              )}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-1">
            {tPlural("panel.productos.importar.lotes", summary.lotes, {
              tam: summary.tamLote,
            })}
          </p>
          {summary.requiereDuenio ? (
            <p role="alert" className="text-destructive mt-1 font-medium">
              {t("panel.productos.importar.requiereDuenio")}
            </p>
          ) : null}

          <button
            type="button"
            onClick={confirmar}
            disabled={isPending || summary.requiereDuenio || faltaRevisar}
            className="bg-primary text-primary-foreground mt-3 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {isPending
              ? t("panel.productos.importar.aplicando")
              : t("panel.productos.importar.confirmar")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
