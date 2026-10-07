import { productCompleteness } from "@/lib/product-completeness";

export function ProductCompleteness({
  input,
}: {
  input: Parameters<typeof productCompleteness>[0];
}) {
  const result = productCompleteness(input);
  return (
    <section className="mt-6 rounded border p-4">
      <h2 className="font-semibold">Revisión del producto</h2>
      <p className="text-muted-foreground my-2 text-sm">{result.warning}</p>
      <ul className="grid gap-1 text-sm">
        {result.checks.map((check) => (
          <li key={check.id}>
            {check.complete ? "✓" : "Pendiente:"} {check.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
