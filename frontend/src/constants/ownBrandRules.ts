export const ALL_OWN_BRANDS = ["EZARC", "TOLESA", "YPLUS"] as const;
export const OWN_BRANDS = ["EZARC", "TOLESA"] as const;

export const CATEGORY_OWN_BRANDS: Record<string, string[]> = {
  "Kids' Paint With Water Kits": ["YPLUS"],
};

export const PRODUCT_BRAND_OPTIONS = [...ALL_OWN_BRANDS];

export const getOwnBrandsForCategory = (category?: string | null) =>
  CATEGORY_OWN_BRANDS[String(category || "").trim()] || [...OWN_BRANDS];
