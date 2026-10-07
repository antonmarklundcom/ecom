/** Optional store-owned planning data. No analytics, rankings or supplier secrets. */
export const EDITORIAL_TOOLS: {
  enabled: boolean;
  keywords: readonly { term: string; plannedPath: string; covered: boolean }[];
} = { enabled: false, keywords: [] };
