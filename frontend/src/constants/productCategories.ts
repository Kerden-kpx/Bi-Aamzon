// Source: backend API  /api/categories  (动态加载，表 dim_bi_amazon_product_category)
export type ProductCategoryRow = {
  id: number;
  level1: string;
  level2: string;
  level3: string;
  level4?: string | null;
  sort_order: number;
};

type CascaderOption = {
  value: string;
  label: string;
  children?: CascaderOption[];
};

function buildCategoryTree(rows: ProductCategoryRow[]): CascaderOption[] {
  const level1Map = new Map<string, Map<string, Map<string, string[]>>>();
  rows.forEach(({ level1, level2, level3, level4 }) => {
    if (!level1Map.has(level1)) level1Map.set(level1, new Map<string, Map<string, string[]>>());
    const level2Map = level1Map.get(level1)!;
    if (!level2Map.has(level2)) level2Map.set(level2, new Map<string, string[]>());
    const level3Map = level2Map.get(level2)!;
    if (!level3Map.has(level3)) level3Map.set(level3, []);
    const level4List = level3Map.get(level3)!;
    const normalizedLevel4 = String(level4 || "").trim();
    if (normalizedLevel4 && !level4List.includes(normalizedLevel4)) {
      level4List.push(normalizedLevel4);
    }
  });
  return Array.from(level1Map.entries()).map(([level1, level2Map]) => ({
    value: level1,
    label: level1,
    children: Array.from(level2Map.entries()).map(([level2, level3Map]) => ({
      value: level2,
      label: level2,
      children: Array.from(level3Map.entries()).map(([level3, level4List]) => ({
        value: level3,
        label: level3,
        children: level4List.length > 0
          ? level4List.map((level4) => ({ value: level4, label: level4 }))
          : undefined,
      })),
    })),
  }));
}

// ----- 全局缓存（整个应用生命周期内只请求一次） -----
let _cache: CascaderOption[] | null = null;
let _rawCache: ProductCategoryRow[] | null = null;
let _fetchPromise: Promise<void> | null = null;

async function _ensureLoaded(): Promise<void> {
  if (_cache !== null) return;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = (async () => {
    try {
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? "";
      const res = await fetch(`${apiBase}/api/categories`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: ProductCategoryRow[] = Array.isArray(data?.items) ? data.items : [];
      _rawCache = rows;
      _cache = buildCategoryTree(rows);
    } catch {
      _cache = [];
      _rawCache = [];
    }
  })();
  return _fetchPromise;
}

/** 获取 Cascader tree options（异步，首次调用时请求后端）*/
export async function fetchCategoryTreeOptions(): Promise<CascaderOption[]> {
  await _ensureLoaded();
  return _cache!;
}

/** 获取原始行数据（用于管理 UI）*/
export async function fetchCategoryRows(): Promise<ProductCategoryRow[]> {
  await _ensureLoaded();
  return _rawCache!;
}

/** 清除缓存，下次调用 fetch* 时重新请求 */
export function invalidateCategoryCache(): void {
  _cache = null;
  _rawCache = null;
  _fetchPromise = null;
}

// ----- 辅助函数（保持与原来相同的签名，供各组件使用） -----

export function findCategoryPathByLeaf(
  category: string,
  rows?: ProductCategoryRow[]
): string[] | undefined {
  const target = String(category || "").trim();
  if (!target) return undefined;
  const source = rows ?? _rawCache ?? [];
  const row = source.find((item) => String(item.level4 || "").trim() === target)
    || source.find((item) => item.level3 === target && !String(item.level4 || "").trim());
  if (!row) return undefined;
  return String(row.level4 || "").trim()
    ? [row.level1, row.level2, row.level3, String(row.level4 || "").trim()]
    : [row.level1, row.level2, row.level3];
}

export function getCategoryLeafFromPath(path: string[] | undefined): string {
  if (!Array.isArray(path) || path.length === 0) return "";
  return String(path[path.length - 1] || "").trim();
}
