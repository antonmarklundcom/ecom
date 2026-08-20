import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Hero } from "@/config/tienda";
import { productImageUrl } from "@/lib/images";

/**
 * La portada de la home (PLAN.md FASE 2, PR O).
 *
 * Server Component sin estado: es un cartel, no una feature. La decisión de
 * si existe la toma `src/app/page.tsx` mirando `TIENDA.hero`; acá sólo se
 * dibuja lo que llegó.
 *
 * **Es piel** (NEW-STORE.md §5): cada tienda puede reescribir este archivo
 * entero sin tocar nada del dominio. Lo que no conviene es borrar el caso "sin
 * foto" — es el estado en el que arranca toda tienda recién clonada.
 */
export function HomeHero({ hero }: { hero: Hero }) {
  const imagen = hero.imagen ?? null;
  // `null` cuando falta `CLOUDINARY_CLOUD_NAME`: el hero se dibuja igual, con
  // el fondo de siempre, en vez de con un rectángulo roto.
  const src = productImageUrl(imagen?.cloudinaryId, "hero");

  return (
    <section className="border-border relative isolate overflow-hidden rounded-2xl border">
      {src ? (
        <>
          <Image
            src={src}
            alt={imagen?.alt ?? ""}
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            className="object-cover"
          />
          {/*
            El velo no es decoración: sin él, un título claro sobre una foto
            clara deja de leerse, y qué foto va a cargar la tienda es
            exactamente lo que no se puede saber desde acá. `aria-hidden`
            porque no aporta nada a quien no ve la foto.
          */}
          <div className="absolute inset-0 -z-0 bg-black/45" aria-hidden />
        </>
      ) : null}

      <div className={`relative p-6 sm:p-10 ${src ? "min-h-[280px] sm:min-h-[360px]" : "bg-muted/30"}`}>
        <h1
          className={`max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl ${
            src ? "text-white" : ""
          }`}
        >
          {hero.titulo}
        </h1>

        {hero.texto ? (
          <p
            className={`mt-3 max-w-xl text-sm sm:text-base ${
              src ? "text-white/90" : "text-muted-foreground"
            }`}
          >
            {hero.texto}
          </p>
        ) : null}

        {hero.cta ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" variant={src ? "secondary" : "default"}>
              <Link href={hero.cta.href}>{hero.cta.label}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
