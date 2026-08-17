"use client";

import type { FreeShippingProgress } from "@/domain/free-shipping";
import { formatGs } from "@/lib/money";

/**
 * "Te faltan ₲X para el envío gratis".
 *
 * El número lo calcula el servidor (`freeShippingForZone` /
 * `freeShippingWithoutZone`) contra `shipping_zones`; acá sólo se dibuja. La
 * regla que ordena todo el componente es que **no se muestra un número que
 * no se pueda sostener**: el umbral es nullable y por zona, así que antes de
 * que la compradora ponga su ciudad puede no existir ninguna respuesta
 * verdadera. Los cuatro estados están dibujados, incluido el de callarse.
 */
export function FreeShippingBar({
  progress,
  subtotalPyg,
}: {
  progress: FreeShippingProgress | null;
  subtotalPyg: number;
}) {
  // Sin datos todavía, o ninguna zona regala el envío: no hay nada honesto
  // que decir, así que no se dice nada.
  if (!progress || progress.kind === "sin_umbral") return null;

  if (progress.kind === "alcanzado") {
    return (
      <Bar percent={100} tone="listo">
        <span className="font-medium">¡Tenés envío gratis!</span>
      </Bar>
    );
  }

  const percent = Math.min(100, Math.round((subtotalPyg / progress.thresholdPyg) * 100));

  if (progress.kind === "falta") {
    return (
      <Bar percent={percent}>
        Te faltan <span className="font-medium tabular-nums">{formatGs(progress.missingPyg)}</span>{" "}
        para el envío gratis.
      </Bar>
    );
  }

  // `indefinido`: las zonas no coinciden y todavía no sabemos la suya. Se
  // nombra el umbral más bajo y se aclara que depende de la ciudad — decir
  // "te faltan ₲X" acá sería prometer un envío gratis que quizás no le toca.
  return (
    <Bar percent={percent} tone="tenue">
      {progress.missingPyg > 0 ? (
        <>
          En algunas zonas el envío es gratis desde{" "}
          <span className="font-medium tabular-nums">{formatGs(progress.thresholdPyg)}</span>. Poné
          tu ciudad en el checkout y te decimos la tuya.
        </>
      ) : (
        <>Puede que tengas envío gratis: depende de tu ciudad. Ponela en el checkout y te decimos.</>
      )}
    </Bar>
  );
}

function Bar({
  percent,
  tone = "normal",
  children,
}: {
  percent: number;
  tone?: "normal" | "listo" | "tenue";
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <p className={tone === "tenue" ? "text-muted-foreground text-xs" : "text-xs"}>{children}</p>
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={
            tone === "listo"
              ? "bg-foreground h-full rounded-full"
              : "bg-foreground/60 h-full rounded-full"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
