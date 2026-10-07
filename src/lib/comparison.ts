export function comparisonLimit(configured: number): number {
  return Number.isFinite(configured)
    ? Math.min(4, Math.max(2, Math.floor(configured)))
    : 3;
}
export function comparisonSlugs(value: unknown, limit: number): string[] {
  if (typeof value !== "string" || value.length > 650) return [];
  return [
    ...new Set(
      value.split(",").filter((slug) => /^[a-z0-9][a-z0-9-]{0,159}$/.test(slug))
    ),
  ].slice(0, comparisonLimit(limit));
}
