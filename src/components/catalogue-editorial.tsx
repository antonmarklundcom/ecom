import Link from "next/link";
import type { EditorialContent } from "@/config/catalogue";
import { ProductDescription } from "@/components/product-description";

export function CatalogueEditorial({
  content,
}: {
  content?: EditorialContent;
}) {
  if (!content) return null;
  return (
    <div className="mt-8 grid gap-6">
      {content.sections?.map((section) => (
        <section
          key={section.id}
          id={
            /^[a-z][a-z0-9-]{0,79}$/.test(section.id) ? section.id : undefined
          }
        >
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <ProductDescription markdown={section.markdown} />
        </section>
      ))}
      {content.faq?.length ? (
        <section>
          <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
          {content.faq.map((item) => (
            <details key={item.question} className="mt-2 rounded border p-3">
              <summary>{item.question}</summary>
              <p className="mt-2 whitespace-pre-line">{item.answer}</p>
            </details>
          ))}
        </section>
      ) : null}
      {content.guides?.length ? (
        <nav aria-label="Guías relacionadas">
          <h2 className="font-semibold">Guías relacionadas</h2>
          <ul>
            {content.guides
              .filter((guide) => /^\/(?!\/)[a-z0-9/\-#]+$/i.test(guide.href))
              .map((guide) => (
                <li key={guide.href}>
                  <Link className="underline" href={guide.href}>
                    {guide.title}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
