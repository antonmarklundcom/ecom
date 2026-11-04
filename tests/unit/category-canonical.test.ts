import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db/queries", () => ({
  getCategoryBySlug: async () => ({
    slug: "rings",
    name: "Rings",
    description: null,
  }),
  getCategories: async () => [],
  getBrands: async () => [],
  getCategoryProducts: vi.fn(),
  isCatalogSort: vi.fn(),
}));
import { generateMetadata } from "@/app/categoria/[slug]/page";
describe("category pagination canonicals", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    [{}, "https://store.example.test/categoria/rings", undefined],
    [
      { page: "2" },
      "https://store.example.test/categoria/rings?page=2",
      undefined,
    ],
    [{ page: "2x" }, "https://store.example.test/categoria/rings", undefined],
    [
      { page: "2", precio: "1-100" },
      "https://store.example.test/categoria/rings",
      { index: false, follow: true },
    ],
  ] as const)(
    "canonical and indexing for %j",
    async (query, canonical, robots) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://store.example.test");
      // Con parámetros, la página la renderiza la gemela `con-parametros/`,
      // que es la que pasa `conParametros` (ARCH.md §6, "Caché de la vidriera").
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: "rings" }),
        searchParams: Promise.resolve(query),
        conParametros: true,
      });
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.robots).toEqual(robots);
    }
  );

  it("la ruta cacheada ni mira los parámetros: es la URL limpia", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://store.example.test");
    let leidos = false;
    const searchParams = {
      then(resolve: (value: Record<string, string>) => void) {
        leidos = true;
        resolve({ page: "2", precio: "1-100" });
      },
    } as unknown as Promise<Record<string, string>>;
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "rings" }),
      searchParams,
    });
    expect(leidos).toBe(false);
    expect(metadata.alternates?.canonical).toBe(
      "https://store.example.test/categoria/rings"
    );
    expect(metadata.robots).toBeUndefined();
  });
});
