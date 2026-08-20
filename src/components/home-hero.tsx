import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Hero } from "@/config/tienda";
import { heroImageUrl } from "@/lib/images";

/**
 * Hero de la home, dibujado desde `TIENDA.hero` (PLAN.md FASE 2, PR O).
 *
 * **Es piel.** Cada tienda lo rediseña libremente; lo que está acá es el
 * mínimo para que una tienda nueva ponga su banner sin tocar código.
 *
 * Sin imagen —o sin cloud de Cloudinary configurado— se dibuja igual, con el
 * fondo neutro de siempre. Una tienda recién clonada tiene que verse entera
 * antes de tener una sola foto cargada.
 */
export function HomeHero({ hero }: { hero: Hero }) {
  const imagen = heroImageUrl(hero.imagenCloudinaryId);
  const cta = hero.ctaHref && hero.ctaTexto ? { href: hero.ctaHref, texto: hero.ctaTexto } : null;

  return (
    <section
      className={`relative overflow-hidden rounded-2xl ${
        imagen ? "" : "border-border bg-muted/30 border"
      }`}
    >
      {imagen ? (
        <>
          <Image
            src={imagen}
            // Vacío si la tienda no escribió el alt: un alt inventado
            // ("imagen del hero") es ruido para un lector de pantalla. El
            // hero es decorativo salvo que el comercio diga otra cosa.
            alt={hero.imagenAlt ?? ""}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1152px"
            className="object-cover"
          />
          {/* El texto va encima de una foto que no controlamos: sin este velo,
              un fondo claro deja el titular ilegible. */}
          <div className="absolute inset-0 bg-black/45" aria-hidden />
        </>
      ) : null}

      <div className={`relative p-6 sm:p-10 ${imagen ? "min-h-[280px] sm:min-h-[360px]" : ""}`}>
        <h1
          className={`max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl ${
            imagen ? "text-white" : ""
          }`}
        >
          {hero.titulo}
        </h1>

        {hero.subtitulo ? (
          <p
            className={`mt-3 max-w-xl text-sm sm:text-base ${
              imagen ? "text-white/90" : "text-muted-foreground"
            }`}
          >
            {hero.subtitulo}
          </p>
        ) : null}

        {cta ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" variant={imagen ? "secondary" : "default"}>
              <Link href={cta.href}>{cta.texto}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
