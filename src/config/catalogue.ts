/** Store-owned definitions and public editorial content. No supplier records here. */
export type AttributeDefinition = {
  key: string;
  label: string;
  scope: "product" | "variant";
  filter?: boolean;
  compare?: boolean;
  requiredForCompleteness?: boolean;
  /** Only real schema.org variant dimensions may enable ProductGroup. */
  schemaProperty?: "color" | "size" | "material" | "pattern";
};
export type EditorialContent = {
  sections?: readonly { id: string; title: string; markdown: string }[];
  faq?: readonly { question: string; answer: string }[];
  guides?: readonly { title: string; href: string }[];
};
export const CATALOGUE: {
  attributes: readonly AttributeDefinition[];
  comparisonLimit: number;
  products: Readonly<Record<string, EditorialContent>>;
  categories: Readonly<Record<string, EditorialContent>>;
} = {
  attributes: [],
  comparisonLimit: 3,
  products: {},
  categories: {},
};
