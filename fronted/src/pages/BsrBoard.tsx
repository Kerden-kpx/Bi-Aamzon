import {
  ArrowRight,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  Funnel,
  MagnifyingGlass,
  SidebarSimple,
  Star,
  Sun,
  DownloadSimple,
  ArrowsClockwise,
  UploadSimple,
  WarningCircle,
  Info,
  X,
  Check,
  CornersOut,
} from "@phosphor-icons/react";
import * as echarts from "echarts";
import { memo, useCallback, useMemo, useState, useRef, useEffect, type ReactNode, type SetStateAction } from "react";

import { getStoredUser, getUserId, getUserName, getUserRole } from "../auth/user";
import { AppDatePicker } from "../components/AppDatePicker";
import { ConversionRateBadge } from "../components/ConversionRateBadge";
import { FormInput, FormSelect } from "../components/FormControls";
import { TagManagerModal } from "../components/TagManagerModal";
import { TagPillList, parseTagList } from "../components/TagSystem";
import { PRODUCT_STATUS_COLOR } from "../constants/productStatus";
import { mockConfig } from "../mock/data";
import {
  buildSalesSparklinePoints,
  buildSparklineGeometry,
  findNearestSparklineIndex,
} from "../utils/sparkline";
import {
  formatMoney as formatMoneyValue,
  formatMonthLabel as formatMonthLabelValue,
  formatNumber as formatNumberValue,
  formatSalesMoney as formatSalesMoneyValue,
  formatText as formatTextValue,
  formatTrafficShare as formatTrafficShareValue,
  toCount as toCountValue,
} from "../utils/valueFormat";

const parsePrice = (value: string) => Number.parseFloat(value.replace("$", ""));

type BsrItem = {
  asin: string;
  site?: string;
  type?: string | number | null;
  title?: string;
  image_url?: string;
  product_url?: string;
  brand?: string;
  parent_asin?: string;
  price?: string | number | null;
  list_price?: string | number | null;
  rating?: number | string | null;
  score?: number | string | null;
  reviews?: number | string | null;
  comment_count?: number | string | null;
  bsr_rank?: number | string | null;
  category_rank?: number | string | null;
  variation_count?: number | string | null;
  launch_date?: string | null;
  conversion_rate?: number | string | null;
  conversion_rate_period?: string | null;
  organic_traffic_count?: number | string | null;
  ad_traffic_count?: number | string | null;
  organic_search_terms?: number | string | null;
  ad_search_terms?: number | string | null;
  search_recommend_terms?: number | string | null;
  sales_volume?: number | string | null;
  sales?: number | string | null;
  tags?: string[] | null;
  yida_asin?: string | null;
  createtime?: string | null;
  status?: string | null;
  rank?: number | string | null;
  [key: string]: unknown;
};

type ProductLibraryItem = {
  asin: string;
  site?: string;
  product?: string;
  name?: string;
  brand?: string;
  sku?: string;
  status?: string;
  application_tags?: string | null;
  tooth_pattern_tags?: string | null;
  material_tags?: string | null;
  position_tags?: string | string[] | null;
  position_tags_raw?: string | null;
  spec_length?: string | null;
  spec_quantity?: number | string | null;
  spec_other?: string | null;
  tags?: string[] | null;
  bsr?: Partial<BsrItem> | null;
  [key: string]: unknown;
};

type StrategyTask = {
  id: string;
  title?: string;
  detail?: string;
  owner?: string;
  owner_userid?: string;
  review_date?: string;
  priority?: string;
  state?: string;
  brand?: string;
  yida_asin?: string;
  [key: string]: unknown;
};

type ProductFormState = {
  sku: string;
  asin: string;
  name: string;
  brand: string;
  status: string;
  application_tags: string;
  tooth_pattern_tags: string;
  material_tags: string;
  spec_length: string;
  spec_quantity?: number;
  spec_other: string;
  position_tags: string;
};

type BsrFormState = ReturnType<typeof createEmptyBsrForm>;

type BsrHistoryRow = {
  month?: string;
  date?: string;
  sales_volume?: number | string | null;
  sales?: number | string | null;
  price?: number | string | null;
  buybox_price?: number | string | null;
  prime_price?: number | string | null;
  coupon_price?: number | string | null;
  child_sales?: number | string | null;
  bsr_rank?: number | string | null;
  bsr_reciprocating_saw_blades?: number | string | null;
  [key: string]: unknown;
};

type LibraryHoverPayload = {
  item: ProductLibraryItem;
  rankText: string;
  categoryRankText: string;
  conversionText: ReactNode;
  organicText: string;
  adText: string;
  organicShareText: string;
  adShareText: string;
  totalTerms: number;
  organicTerms: number;
  adTerms: number;
  recommendTerms: number;
  specLengthText: string;
  specQuantityText: string | number;
  applicationTags: string[];
  toothTags: string[];
  materialTags: string[];
  positionTags: string[];
  customTags: string[];
};

const splitAsins = (value: unknown) =>
  String(value ?? "")
    .split(/[,，;|]/)
    .map((val) => val.trim())
    .filter(Boolean);

const firstAsin = (value: unknown) => splitAsins(value)[0] || "";

const createEmptyBsrForm = () => ({
  site: "US",
  parent_asin: "",
  title: "",
  image_url: "",
  product_url: "",
  brand: "",
  createtime: "",
  price: "",
  list_price: "",
  score: "",
  comment_count: "",
  bsr_rank: "",
  category_rank: "",
  variation_count: "",
  launch_date: "",
  conversion_rate: "",
  organic_traffic_count: "",
  ad_traffic_count: "",
  organic_search_terms: "",
  ad_search_terms: "",
  search_recommend_terms: "",
  sales_volume: "",
  sales: "",
  tags: "",
});

const normalizeTypeValue = (value: unknown) => String(value ?? "").trim().toLowerCase();

const resolveItemType = (item: BsrItem | null | undefined) => {
  const rawType = String(item?.type ?? "").trim();
  if (rawType === "1") {
    return "1";
  }
  if (rawType === "0") {
    return "0";
  }
  return "0";
};

const isOwnTypeValue = (value: unknown) => {
  const normalized = normalizeTypeValue(value);
  return normalized === "1";
};

const isOwnProduct = (item: BsrItem) => isOwnTypeValue(resolveItemType(item));

const statusColor = PRODUCT_STATUS_COLOR;

type FilterKey = "brand" | "price" | "rating" | "label" | "date" | "site";
type SidebarFilterKey = "brand" | "tag";
type MonthlyTrendPoint = {
  month: string;
  salesVolume: number;
  salesAmount: number | null;
};

export function BsrBoard({
  collapsed = false,
  onToggleCollapse,
  onViewAllProducts,
  onOpenAiInsights,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onViewAllProducts?: () => void;
  onOpenAiInsights?: () => void;
}) {
  const isDev = import.meta.env.DEV;
  const logApi = (...args: unknown[]) => {
    if (isDev) {
      console.info("[BSR]", ...args);
    }
  };
  const [authUser] = useState(() => getStoredUser());
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };
  const userRole = getUserRole(authUser);
  const isAdmin = userRole === "admin";
  const currentUserName = getUserName(authUser);
  const currentUserId = getUserId(authUser);
  const { bsr } = mockConfig;
  const ratingOptions = bsr.ratingOptions;
  const [items, setItems] = useState<BsrItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<ProductLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<ProductLibraryItem | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingLeft, setMappingLeft] = useState<BsrItem | null>(null);
  const [mappingRight, setMappingRight] = useState<BsrItem | null>(null);
  const [mappingRightMeta, setMappingRightMeta] = useState<ProductLibraryItem | null>(null);
  const [compareTargetAsin, setCompareTargetAsin] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingActionLoading, setMappingActionLoading] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalMode, setTagModalMode] = useState<"bsr" | "product">("bsr");
  const [tagEditItem, setTagEditItem] = useState<BsrItem | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);
  const [customLibraryTags, setCustomLibraryTags] = useState<string[]>([]);
  const [hiddenLibraryTagsState, setHiddenLibraryTagsState] = useState<string[]>([]);
  const [fieldTagModalOpen, setFieldTagModalOpen] = useState(false);
  const [activeFieldTag, setActiveFieldTag] = useState<
    "application_tags" | "tooth_pattern_tags" | "material_tags" | "position_tags" | null
  >(null);
  const [fieldCustomTags, setFieldCustomTags] = useState<Record<string, string[]>>({
    application_tags: [],
    tooth_pattern_tags: [],
    material_tags: [],
    position_tags: [],
  });
  const [fieldHiddenTags, setFieldHiddenTags] = useState<Record<string, string[]>>({
    application_tags: [],
    tooth_pattern_tags: [],
    material_tags: [],
    position_tags: [],
  });
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalSaving, setProductModalSaving] = useState(false);
  const [productModalError, setProductModalError] = useState<string | null>(null);
  const [productFormData, setProductFormData] = useState<ProductFormState>({
    sku: "",
    asin: "",
    name: "",
    brand: "",
    status: "在售",
    application_tags: "",
    tooth_pattern_tags: "",
    material_tags: "",
    spec_length: "",
    spec_quantity: undefined,
    spec_other: "",
    position_tags: "",
  });
  const [productBsrForm, setProductBsrForm] = useState<BsrFormState>(createEmptyBsrForm());
  const [productBsrImageError, setProductBsrImageError] = useState<string | null>(null);
  const [productBsrImageInputKey, setProductBsrImageInputKey] = useState(0);

  // Strategy Form States
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyTask | null>(null);
  const [strategyEdit, setStrategyEdit] = useState({
    yida_asin: "",
    title: "",
    detail: "",
    owner: "",
    owner_userid: "",
    review_date: "",
    priority: "中",
    state: "待开始",
  });
  const [strategyEditSaving, setStrategyEditSaving] = useState(false);
  const [strategyFilters, setStrategyFilters] = useState({
    owner: "全部",
    brand: "全部",
    priority: "全部",
    status: "全部",
  });
  const [strategyTasks, setStrategyTasks] = useState<StrategyTask[]>([]);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategyOwnerOptions, setStrategyOwnerOptions] = useState<SelectOption[]>([]);
  const [strategyOwnerLoading, setStrategyOwnerLoading] = useState(false);
  const [strategyFormData, setStrategyFormData] = useState({
    title: "",
    detail: "",
    owner: "",
    owner_userid: "",
    review_date: "",
    priority: "中",
  });
  const [strategySaving, setStrategySaving] = useState(false);

  useEffect(() => {
    if (!tagModalOpen && !fieldTagModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [tagModalOpen, fieldTagModalOpen]);

  const handleStrategyChange = (key: string, value: string) => {
    setStrategyFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleStrategyOwnerSelect = (userid: string) => {
    const selected = strategyOwnerOptions.find((opt) => opt.value === userid);
    setStrategyFormData((prev) => ({
      ...prev,
      owner_userid: userid,
      owner: selected?.label || "",
    }));
  };

  const handleStrategyEditOwnerSelect = (userid: string) => {
    const selected = strategyOwnerOptions.find((opt) => opt.value === userid);
    setStrategyEdit((prev) => ({
      ...prev,
      owner_userid: userid,
      owner: selected?.label || "",
    }));
  };

  const loadStrategies = async (competitorAsin?: string) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setStrategyLoading(true);
    setStrategyError(null);
    try {
      const payload: Record<string, unknown> = { limit: 500 };
      if (competitorAsin) {
        payload.competitor_asin = competitorAsin;
      }
      const res = await fetch(`${apiBase}/api/yida-strategy/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const data = await res.json();
          detail = data?.detail ? String(data.detail) : "";
        } catch { }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStrategyTasks(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setStrategyError("加载策略列表失败，请检查后端服务。");
    } finally {
      setStrategyLoading(false);
    }
  };

  const updateStrategyStatus = async (id: string, state: string) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    try {
      await fetch(`${apiBase}/api/yida-strategy/${id}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      });
      setStrategyTasks((prev) => prev.map((task) => (task.id === id ? { ...task, state } : task)));
    } catch (err) {
      showToast("更新策略状态失败。", "error");
    }
  };

  const openStrategyDetail = (task: StrategyTask) => {
    setSelectedStrategy(task);
    setStrategyEdit({
      yida_asin: task.yida_asin || "",
      title: task.title || "",
      detail: task.detail || "",
      owner: task.owner || "",
      owner_userid: task.owner_userid || "",
      review_date: task.review_date || "",
      priority: task.priority || "中",
      state: task.state || "待开始",
    });
  };

  const handleStrategyEditChange = (key: string, value: string) => {
    setStrategyEdit((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpdateStrategyDetail = async () => {
    if (!selectedStrategy) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setStrategyEditSaving(true);
    try {
      await fetch(`${apiBase}/api/yida-strategy/${selectedStrategy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yida_asin: strategyEdit.yida_asin,
          title: strategyEdit.title,
          detail: strategyEdit.detail,
          owner: strategyEdit.owner || null,
          owner_userid: isAdmin ? strategyEdit.owner_userid || null : currentUserId || null,
          review_date: strategyEdit.review_date || null,
          priority: strategyEdit.priority,
          state: strategyEdit.state,
        }),
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      });

      setStrategyTasks((prev) =>
        prev.map((task) =>
          task.id === selectedStrategy.id
            ? { ...task, ...strategyEdit }
            : task
        )
      );
      setSelectedStrategy((prev) => (prev ? { ...prev, ...strategyEdit } : prev));
      showToast("策略已更新！");
    } catch (err) {
      showToast("更新策略失败，请稍后重试。", "error");
    } finally {
      setStrategyEditSaving(false);
    }
  };

  const handleDeleteStrategy = () => {
    if (!selectedStrategy) return;
    showConfirm(
      "删除策略",
      `确认删除策略「${selectedStrategy.title}」吗？`,
      async () => {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        try {
          await fetch(`${apiBase}/api/yida-strategy/${selectedStrategy.id}`, {
            method: "DELETE",
          }).then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
          });
          setStrategyTasks((prev) => prev.filter((task) => task.id !== selectedStrategy.id));
          setSelectedStrategy(null);
          showToast("策略已删除！");
        } catch (err) {
          showToast("删除失败，请稍后重试。", "error");
        }
      }
    );
  };

  const handleSaveStrategy = async () => {
    if (!mappingLeft || !mappingRightMeta) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setStrategySaving(true);
    try {
      const ownerName = isAdmin ? strategyFormData.owner : currentUserName;
      const response = await fetch(`${apiBase}/api/yida-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor_asin: mappingLeft.asin,
          yida_asin: mappingRightMeta.asin,
          created_at: new Date().toISOString().split("T")[0],
          title: strategyFormData.title,
          detail: strategyFormData.detail,
          owner: ownerName || null,
          owner_userid: isAdmin ? strategyFormData.owner_userid || null : currentUserId || null,
          review_date: strategyFormData.review_date || null,
          priority: strategyFormData.priority,
          state: "待开始",
        }),
      });

      if (!response.ok) throw new Error("保存失败");

      showToast("策略已保存成功！");
      await loadStrategies(mappingLeft.asin);
    } catch (err) {
      showToast("保存策略失败，请稍后重试。", "error");
    } finally {
      setStrategySaving(false);
    }
  };

  // Custom Notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmConfig({ title, message, onConfirm });
  };

  // Auto clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (mappingModalOpen && mappingLeft?.asin) {
      loadStrategies(mappingLeft.asin);
    }
  }, [mappingModalOpen, mappingLeft?.asin]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setStrategyOwnerLoading(true);
    fetch(`${apiBase}/api/users/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 2000 }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items)
          ? (data.items as Array<{ status?: string; dingtalk_userid?: string; dingtalk_username?: string }>)
          : [];
        const options = items
          .filter((item) => (item.status || "active") !== "disabled")
          .map((item) => ({
            value: item.dingtalk_userid || "",
            label: item.dingtalk_username || item.dingtalk_userid || "",
          }))
          .filter((opt) => opt.value && opt.label);
        setStrategyOwnerOptions(options);
      })
      .catch(() => {
        setStrategyOwnerOptions([]);
      })
      .finally(() => {
        setStrategyOwnerLoading(false);
      });

    return () => controller.abort();
  }, [isAdmin]);

  useEffect(() => {
    if (mappingModalOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [mappingModalOpen]);

  const baseLibraryTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => {
          const normalized = String(tag).trim();
          if (normalized) {
            set.add(normalized);
          }
        });
      }
    });
    return Array.from(set);
  }, [items]);

  const fieldLibraryTags = useMemo(() => {
    const build = (key: string) => {
      const set = new Set<string>();
      libraryItems.forEach((item) => {
        const raw = item?.[key];
        if (Array.isArray(raw)) {
          raw.forEach((tag) => tag && set.add(String(tag).trim()));
        } else if (raw) {
          parseTagList(raw).forEach((tag) => set.add(tag));
        }
      });
      return Array.from(set);
    };
    return {
      application_tags: build("application_tags"),
      tooth_pattern_tags: build("tooth_pattern_tags"),
      material_tags: build("material_tags"),
      position_tags: build("position_tags"),
    };
  }, [libraryItems]);

  const fieldLabelMap: Record<string, string> = {
    application_tags: "应用标签",
    tooth_pattern_tags: "齿形标签",
    material_tags: "材质标签",
    position_tags: "定位标签",
  };

  const tagModalSelected = useMemo(() => {
    if (tagModalMode === "product") {
      return parseTagList(productBsrForm.tags);
    }
    const rawTags = tagEditItem?.tags;
    if (Array.isArray(rawTags)) {
      return rawTags;
    }
    return parseTagList(rawTags);
  }, [tagModalMode, productBsrForm.tags, tagEditItem]);

  const brandOptions = useMemo(() => {
    if (items.length === 0) {
      return bsr.brandOptions;
    }
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.brand) {
        set.add(item.brand);
      }
    });
    return ["All Brands", ...Array.from(set)];
  }, [items, bsr.brandOptions]);

  const labelOptions = useMemo(() => {
    if (items.length === 0) {
      return bsr.labelOptions;
    }
    const set = new Set<string>();
    items.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => set.add(tag));
      }
    });
    return ["All Tags", ...Array.from(set)];
  }, [items, bsr.labelOptions]);

  // sidebar filter states (multi-select)
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sidebarOpenDropdown, setSidebarOpenDropdown] = useState<SidebarFilterKey | null>(null);

  const sidebarBrandOptions = useMemo(() => {
    const set = new Set<string>();
    libraryItems.forEach((p) => {
      if (p.brand) {
        set.add(p.brand);
      }
    });
    return Array.from(set);
  }, [libraryItems]);

  const sidebarTagOptions = useMemo(() => {
    const set = new Set<string>();
    libraryItems.forEach((p) => {
      (p.tags || []).forEach((t: string) => set.add(t));
    });
    return Array.from(set);
  }, [libraryItems]);

  const filteredSidebarProducts = useMemo(() => {
    return libraryItems.filter((p) => {
      const keyword = sidebarSearch.toLowerCase();
      const matchesSearch =
        !keyword ||
        String(p.product || "").toLowerCase().includes(keyword) ||
        String(p.asin || "").toLowerCase().includes(keyword);

      const productBrand = String(p.brand || "");
      const matchesBrand = selectedBrands.length === 0 || (productBrand !== "" && selectedBrands.includes(productBrand));
      const matchesTag =
        selectedTags.length === 0 ||
        (Array.isArray(p.tags) ? p.tags : []).some((t: string) => selectedTags.includes(t));

      return matchesSearch && matchesBrand && matchesTag;
    });
  }, [libraryItems, sidebarSearch, selectedBrands, selectedTags]);

  const [search, setSearch] = useState("");
  // key filter states
  const [filterState, setFilterState] = useState({
    brands: [] as string[],
    prices: [] as string[],
    ratings: [] as string[],
    labels: [] as string[],
  });
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [siteFilter, setSiteFilter] = useState("US");
  const siteOptions = ["US", "CA", "UK", "DE"];
  const [dateFilter, setDateFilter] = useState("");
  const [dateOptions, setDateOptions] = useState<string[]>([]);
  const [prevDate, setPrevDate] = useState("");
  const [prevItemsMap, setPrevItemsMap] = useState<Record<string, BsrItem>>({});
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [dateLoaded, setDateLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sellerImportFile, setSellerImportFile] = useState<File | null>(null);
  const [jimuImportFile, setJimuImportFile] = useState<File | null>(null);
  const [sellerImportFileNext, setSellerImportFileNext] = useState<File | null>(null);
  const [jimuImportFileNext, setJimuImportFileNext] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [fetchDailyLoading, setFetchDailyLoading] = useState(false);
  const [fetchDailyJobId, setFetchDailyJobId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sellerImportDragging, setSellerImportDragging] = useState(false);
  const [jimuImportDragging, setJimuImportDragging] = useState(false);
  const [sellerImportDraggingNext, setSellerImportDraggingNext] = useState(false);
  const [jimuImportDraggingNext, setJimuImportDraggingNext] = useState(false);
  const [importSite, setImportSite] = useState("US");
  const [historyPopover, setHistoryPopover] = useState<{ asin: string; site: string } | null>(null);
  const [historyMonthData, setHistoryMonthData] = useState<BsrHistoryRow[]>([]);
  const [historyChildData, setHistoryChildData] = useState<BsrHistoryRow[]>([]);
  const [historyMonthLoading, setHistoryMonthLoading] = useState(false);
  const [historyChildLoading, setHistoryChildLoading] = useState(false);
  const [historyMonthError, setHistoryMonthError] = useState<string | null>(null);
  const [historyChildError, setHistoryChildError] = useState<string | null>(null);
  const [historyKeepaData, setHistoryKeepaData] = useState<BsrHistoryRow[]>([]);
  const [historyKeepaLoading, setHistoryKeepaLoading] = useState(false);
  const [historyKeepaError, setHistoryKeepaError] = useState<string | null>(null);
  const [historyKeepaRange, setHistoryKeepaRange] = useState<"7d" | "1m" | "3m" | "6m">("3m");
  const [aiInsightSubmitting, setAiInsightSubmitting] = useState(false);
  const [aiInsightJobId, setAiInsightJobId] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"month" | "child" | "price" | "keepa">("month");
  const [monthlySalesTrendMap, setMonthlySalesTrendMap] = useState<Record<string, MonthlyTrendPoint[]>>({});
  const monthlySalesTrendMapRef = useRef<Record<string, MonthlyTrendPoint[]>>({});
  const monthlySalesTrendLoadingRef = useRef<Set<string>>(new Set());
  const historyChartRef = useRef<HTMLDivElement>(null);
  const [libraryHover, setLibraryHover] = useState<{
    rect: DOMRect;
    payload: LibraryHoverPayload;
  } | null>(null);
  const [librarySparklineHover, setLibrarySparklineHover] = useState<{ asin: string; index: number } | null>(null);
  const libraryHoverTimer = useRef<number | null>(null);

  const [openDropdown, setOpenDropdown] = useState<FilterKey | null>(null);
  const dropdownRefs = useRef<Record<FilterKey, HTMLDivElement | null>>(
    {} as Record<FilterKey, HTMLDivElement | null>
  );

  useEffect(() => {
    if (!historyPopover) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [historyPopover]);

  const getMonthlyTrendKey = useCallback((asin: unknown, site: unknown) => {
    const normalizedAsin = String(asin || "").trim().toUpperCase();
    const normalizedSite = String(site || "US").trim().toUpperCase() || "US";
    return `${normalizedSite}|${normalizedAsin}`;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDateLoading(true);
    setDateLoaded(false);
    setDateError(null);
    logApi("load dates", `${apiBase}/api/bsr/dates`, { site: siteFilter });
    fetch(`${apiBase}/api/bsr/dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: siteFilter }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          logApi("dates response not ok", res.status);
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        setDateOptions(items);
        setDateFilter(items[0] || "");
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          logApi("dates fetch error", err);
          setDateError("日期列表加载失败");
        }
      })
      .finally(() => {
        setDateLoading(false);
        setDateLoaded(true);
      });

    return () => controller.abort();
  }, [siteFilter]);

  useEffect(() => {
    if (!dateFilter || dateOptions.length === 0) {
      setPrevDate("");
      return;
    }
    const idx = dateOptions.indexOf(dateFilter);
    if (idx >= 0 && idx + 1 < dateOptions.length) {
      setPrevDate(dateOptions[idx + 1]);
    } else {
      setPrevDate("");
    }
  }, [dateFilter, dateOptions]);

  useEffect(() => {
    if (!prevDate) {
      setPrevItemsMap({});
      return;
    }
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const payload: Record<string, unknown> = { limit: 2000, createtime: prevDate, site: siteFilter };
    fetch(`${apiBase}/api/bsr/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items) ? (data.items as BsrItem[]) : [];
        const map: Record<string, BsrItem> = {};
        items.forEach((row) => {
          if (row?.asin) map[String(row.asin)] = row;
        });
        setPrevItemsMap(map);
      })
      .catch(() => {
        setPrevItemsMap({});
      });

    return () => controller.abort();
  }, [prevDate, siteFilter]);

  const openTagModal = (item: BsrItem) => {
    setTagModalMode("bsr");
    setTagEditItem(item);
    setTagSaveError(null);
    setTagModalOpen(true);
  };

  const closeTagModal = () => {
    setTagModalOpen(false);
    setTagEditItem(null);
    setTagModalMode("bsr");
    setTagSaveError(null);
  };

  const openProductTagModal = () => {
    setTagModalMode("product");
    setTagEditItem(null);
    setTagSaveError(null);
    setTagModalOpen(true);
  };

  const openFieldTagModal = (
    field: "application_tags" | "tooth_pattern_tags" | "material_tags" | "position_tags"
  ) => {
    setActiveFieldTag(field);
    setFieldTagModalOpen(true);
  };

  const closeFieldTagModal = () => {
    setFieldTagModalOpen(false);
    setActiveFieldTag(null);
  };

  const setActiveFieldCustomTags = (updater: SetStateAction<string[]>) => {
    if (!activeFieldTag) return;
    setFieldCustomTags((prev) => {
      const current = prev[activeFieldTag] || [];
      const next = typeof updater === "function" ? (updater as (prev: string[]) => string[])(current) : updater;
      return { ...prev, [activeFieldTag]: next };
    });
  };

  const setActiveFieldHiddenTags = (updater: SetStateAction<string[]>) => {
    if (!activeFieldTag) return;
    setFieldHiddenTags((prev) => {
      const current = prev[activeFieldTag] || [];
      const next = typeof updater === "function" ? (updater as (prev: string[]) => string[])(current) : updater;
      return { ...prev, [activeFieldTag]: next };
    });
  };

  const saveTags = (tags: string[]) => {
    if (tagModalMode === "product") {
      setProductBsrForm((prev) => ({
        ...prev,
        tags: tags.join(","),
      }));
      closeTagModal();
      return;
    }
    if (!tagEditItem) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setTagSaving(true);
    setTagSaveError(null);
    fetch(`${apiBase}/api/bsr/${tagEditItem.asin}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags,
        createtime: tagEditItem.createtime || null,
        site: tagEditItem.site || siteFilter,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(() => {
        setItems((prev) =>
          prev.map((item) =>
            item.asin === tagEditItem.asin &&
              item.createtime === tagEditItem.createtime
              ? { ...item, tags }
              : item
          )
        );
        closeTagModal();
      })
      .catch(() => {
        setTagSaveError("保存失败，请检查后端服务。");
      })
      .finally(() => {
        setTagSaving(false);
      });
  };

  const openProductModal = useCallback((product: ProductLibraryItem) => {
    const bsr = product?.bsr || {};
    const normalizeMoney = (value: unknown) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "string") return value.replace(/[^0-9.]/g, "");
      return String(value);
    };
    const normalizeValue = (value: unknown) => {
      if (value === null || value === undefined) return "";
      return String(value);
    };
    const normalizePercentValue = (value: unknown) => {
      if (value === null || value === undefined || value === "") return "";
      const num = Number(value);
      if (Number.isNaN(num)) return "";
      const percent = num > 1 ? num : num * 100;
      return String(Number.isInteger(percent) ? percent : Number(percent.toFixed(2)));
    };
    setProductFormData({
      sku: product?.sku || "",
      asin: product?.asin || "",
      name: product?.name || product?.product || "",
      brand: product?.brand || "",
      status: product?.status || "在售",
      application_tags: product?.application_tags || "",
      tooth_pattern_tags: product?.tooth_pattern_tags || "",
      material_tags: product?.material_tags || "",
      spec_length: product?.spec_length || "",
      spec_quantity: product?.spec_quantity ?? undefined,
      spec_other: product?.spec_other || "",
      position_tags:
        product?.position_tags_raw ||
        (Array.isArray(product?.position_tags) ? product.position_tags.join(",") : product?.position_tags || ""),
    });
    setProductBsrForm({
      site: String(bsr?.site || product?.site || siteFilter || "US").toUpperCase(),
      parent_asin: bsr?.parent_asin ?? "",
      title: bsr?.title ?? "",
      image_url: bsr?.image_url ?? "",
      product_url: bsr?.product_url ?? "",
      brand: product?.brand || "",
      createtime: bsr?.createtime ?? "",
      price: normalizeMoney(bsr?.price),
      list_price: normalizeMoney(bsr?.list_price),
      score: normalizeValue(bsr?.score),
      comment_count: normalizeValue(bsr?.comment_count),
      bsr_rank: normalizeValue(bsr?.bsr_rank),
      category_rank: normalizeValue(bsr?.category_rank),
      variation_count: normalizeValue(bsr?.variation_count),
      launch_date: bsr?.launch_date ?? "",
      conversion_rate: normalizePercentValue(bsr?.conversion_rate),
      organic_traffic_count: normalizeValue(bsr?.organic_traffic_count),
      ad_traffic_count: normalizeValue(bsr?.ad_traffic_count),
      organic_search_terms: normalizeValue(bsr?.organic_search_terms),
      ad_search_terms: normalizeValue(bsr?.ad_search_terms),
      search_recommend_terms: normalizeValue(bsr?.search_recommend_terms),
      sales_volume: normalizeValue(bsr?.sales_volume),
      sales: normalizeValue(bsr?.sales),
      tags: Array.isArray(bsr?.tags) ? bsr.tags.join(",") : (bsr?.tags ?? ""),
    });
    setProductBsrImageError(null);
    setProductBsrImageInputKey((prev) => prev + 1);
    setProductModalError(null);
    setProductModalOpen(true);
  }, [siteFilter]);

  const closeProductModal = () => {
    setProductModalOpen(false);
    setProductModalError(null);
  };

  const handleProductBsrImageUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProductBsrImageError("仅支持图片文件。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setProductBsrImageError("读取图片失败，请重试。");
        return;
      }
      setProductBsrForm((prev) => ({ ...prev, image_url: result }));
      setProductBsrImageError(null);
    };
    reader.onerror = () => {
      setProductBsrImageError("读取图片失败，请重试。");
    };
    reader.readAsDataURL(file);
  };

  const buildProductBsrPayload = () => {
    const toNumberOrNull = (value: unknown, integer = false) => {
      if (value === "" || value === null || value === undefined) return null;
      const num = integer ? Number.parseInt(String(value), 10) : Number(value);
      return Number.isNaN(num) ? null : num;
    };
    const payload = {
      parent_asin: productBsrForm.parent_asin?.trim() || null,
      title: productBsrForm.title?.trim() || null,
      image_url: productBsrForm.image_url?.trim() || null,
      product_url: productBsrForm.product_url?.trim() || null,
      brand: productFormData.brand?.trim() || null,
      createtime: productBsrForm.createtime?.trim() || null,
      price: toNumberOrNull(productBsrForm.price),
      list_price: toNumberOrNull(productBsrForm.list_price),
      score: toNumberOrNull(productBsrForm.score),
      comment_count: toNumberOrNull(productBsrForm.comment_count, true),
      bsr_rank: toNumberOrNull(productBsrForm.bsr_rank, true),
      category_rank: toNumberOrNull(productBsrForm.category_rank, true),
      variation_count: toNumberOrNull(productBsrForm.variation_count, true),
      launch_date: productBsrForm.launch_date?.trim() || null,
      conversion_rate: toNumberOrNull(productBsrForm.conversion_rate),
      organic_traffic_count: toNumberOrNull(productBsrForm.organic_traffic_count),
      ad_traffic_count: toNumberOrNull(productBsrForm.ad_traffic_count),
      organic_search_terms: toNumberOrNull(productBsrForm.organic_search_terms, true),
      ad_search_terms: toNumberOrNull(productBsrForm.ad_search_terms, true),
      search_recommend_terms: toNumberOrNull(productBsrForm.search_recommend_terms, true),
      sales_volume: toNumberOrNull(productBsrForm.sales_volume, true),
      sales: toNumberOrNull(productBsrForm.sales),
      tags: productBsrForm.tags?.trim() || null,
    };
    const hasValue = Object.values(payload).some((value) => value !== null && value !== "");
    return hasValue
      ? { ...payload, site: String(productBsrForm.site || "US").trim().toUpperCase() || "US" }
      : null;
  };

  const buildProductPayload = () => ({
    asin: String(productFormData.asin || "").trim(),
    site: String(productBsrForm.site || siteFilter || "US").trim().toUpperCase() || "US",
    sku: String(productFormData.sku || "").trim(),
    brand: String(productFormData.brand || "").trim(),
    product: String(productFormData.name || "").trim(),
    application_tags: productFormData.application_tags?.trim() || null,
    tooth_pattern_tags: productFormData.tooth_pattern_tags?.trim() || null,
    material_tags: productFormData.material_tags?.trim() || null,
    spec_length: productFormData.spec_length?.trim() || null,
    spec_quantity: productFormData.spec_quantity !== undefined && productFormData.spec_quantity !== null
      ? Number(productFormData.spec_quantity)
      : null,
    spec_other: productFormData.spec_other?.trim() || null,
    position_tags: (() => {
      if (Array.isArray(productFormData.position_tags)) {
        return productFormData.position_tags.join(",");
      }
      if (typeof productFormData.position_tags === "string") {
        const value = productFormData.position_tags.trim();
        return value ? value : null;
      }
      return null;
    })(),
    status: productFormData.status || "在售",
    bsr: buildProductBsrPayload(),
  });

  const refreshLibraryItems = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const res = await fetch(`${apiBase}/api/yida-products/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200, site: siteFilter }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setLibraryItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setLibraryItems([]);
      setLibraryError("加载产品库失败，请检查后端服务。");
    } finally {
      setLibraryLoading(false);
    }
  };

  const reloadDates = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDateLoading(true);
    setDateError(null);
    try {
      const res = await fetch(`${apiBase}/api/bsr/dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: siteFilter }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setDateOptions(items);
      const nextDate = items[0] || "";
      setDateFilter(nextDate);
      return { items, nextDate };
    } catch (err) {
      setDateError("日期列表加载失败");
      return { items: [], nextDate: dateFilter };
    } finally {
      setDateLoading(false);
      setDateLoaded(true);
    }
  };

  const reloadBsrItems = async (targetDate?: string) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLoading(true);
    setError(null);
    const payload: Record<string, unknown> = { limit: 500, site: siteFilter };
    const dateValue = targetDate || dateFilter;
    if (dateValue) {
      payload.createtime = dateValue;
    }
    try {
      const res = await fetch(`${apiBase}/api/bsr/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError("加载 BSR 数据失败，请检查后端服务。");
    } finally {
      setLoading(false);
    }
  };

  const handleImportSubmit = async () => {
    const hasDetail = !!sellerImportFileNext;
    const hasBundle = !!(sellerImportFile || jimuImportFile || jimuImportFileNext);
    const bundleReady = !!(sellerImportFile && jimuImportFile && jimuImportFileNext);
    if (!hasDetail && !bundleReady) {
      setImportError("请上传卖家精灵明细（销量、销售额）或完整明细三件套。");
      return;
    }
    if (hasBundle && !bundleReady) {
      setImportError("明细导入需要三件套：卖家精灵明细 + 极木与西柚#1-50 + 极木与西柚#51-100。");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const formData = new FormData();
      formData.append("site", importSite);
      if (hasDetail && sellerImportFileNext) {
        formData.append("seller_file_detail", sellerImportFileNext);
      }
      if (bundleReady) {
        formData.append("seller_file", sellerImportFile);
        formData.append("jimu_file", jimuImportFile);
        formData.append("jimu_file_51_100", jimuImportFileNext);
      }
      const res = await fetch(`${apiBase}/api/bsr/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const rows = typeof data.rows === "number" ? data.rows : null;
      const monthlyRows = typeof data.monthly_rows === "number" ? data.monthly_rows : null;
      const parts: string[] = [];
      if (rows !== null) {
        parts.push(`BSR ${rows}条`);
      }
      if (monthlyRows !== null) {
        parts.push(`月度明细 ${monthlyRows}条`);
      }
      const detailText = parts.length > 0 ? `，${parts.join("，")}` : "";
      showToast(`导入成功${detailText}`, "success");
      resetImportModalState();
      const { nextDate } = await reloadDates();
      await reloadBsrItems(nextDate);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "导入失败，请检查文件或后端服务。";
      setImportError(message);
      showToast(message, "error");
    } finally {
      setImportLoading(false);
    }
  };

  const submitFetchDaily = async () => {
    if (fetchDailyLoading) return;
    setFetchDailyLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${apiBase}/api/bsr/fetch-daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: siteFilter }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const jobId = String(data?.job_id || "").trim();
      if (!jobId) {
        throw new Error("抓取任务提交失败：缺少任务ID");
      }
      setFetchDailyJobId(jobId);
      showToast("抓取任务已提交，后台执行中。", "info");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "抓取失败，请检查后端服务。";
      showToast(message, "error");
      setFetchDailyJobId(null);
      setFetchDailyLoading(false);
    }
  };

  const handleFetchDaily = () => {
    if (fetchDailyLoading) return;
    showConfirm(
      "确认抓取数据",
      `将按站点 ${siteFilter} 的最新批次开始抓取，是否继续？`,
      () => {
        void submitFetchDaily();
      }
    );
  };

  useEffect(() => {
    if (!fetchDailyJobId) return;
    let cancelled = false;
    let failedPollCount = 0;
    const pollStartedAt = Date.now();
    let timer: number | null = null;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const getNextPollDelay = () => (Date.now() - pollStartedAt < 60_000 ? 3_000 : 8_000);
    const scheduleNextPoll = () => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void poll();
      }, getNextPollDelay());
    };

    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/bsr/fetch-daily/jobs/${fetchDailyJobId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
          throw new Error(message);
        }
        failedPollCount = 0;
        const status = String(data?.status || "").toLowerCase();
        if (status === "pending" || status === "running") {
          scheduleNextPoll();
          return;
        }
        if (cancelled) {
          return;
        }
        setFetchDailyJobId(null);
        setFetchDailyLoading(false);
        if (status === "success") {
          showToast("抓取完成", "success");
          const { nextDate } = await reloadDates();
          await reloadBsrItems(nextDate);
          return;
        }
        const failMessage = String(data?.error_message || "").trim() || "抓取失败";
        showToast(failMessage, "error");
      } catch (err) {
        if (cancelled) {
          return;
        }
        failedPollCount += 1;
        if (failedPollCount >= 3) {
          const message = err instanceof Error && err.message ? err.message : "任务状态查询失败";
          showToast(message, "error");
          setFetchDailyJobId(null);
          setFetchDailyLoading(false);
          return;
        }
        scheduleNextPoll();
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [fetchDailyJobId]);

  useEffect(() => {
    if (!fetchDailyJobId && fetchDailyLoading) {
      setFetchDailyLoading(false);
    }
  }, [fetchDailyJobId, fetchDailyLoading]);

  useEffect(() => {
    if (!aiInsightJobId) return;
    let cancelled = false;
    let timer: number | null = null;
    let failedPollCount = 0;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";

    const scheduleNextPoll = () => {
      if (cancelled) return;
      timer = window.setTimeout(poll, 6000);
    };

    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/ai-insights/jobs/${encodeURIComponent(aiInsightJobId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
          throw new Error(message);
        }
        failedPollCount = 0;
        const item = (data?.item || data?.data?.item || data?.data || null) as { status?: string } | null;
        const status = String(item?.status || "").trim().toLowerCase();
        if (status === "pending" || status === "running") {
          scheduleNextPoll();
          return;
        }
        setAiInsightJobId(null);
        if (status === "success") {
          showConfirm("分析完成", "分析已完成，请到 AI Insights 页面查看。", () => onOpenAiInsights?.());
          return;
        }
        showToast("AI分析失败", "error");
      } catch (err) {
        if (cancelled) return;
        failedPollCount += 1;
        if (failedPollCount >= 3) {
          const message = err instanceof Error && err.message ? err.message : "AI任务状态查询失败";
          showToast(message, "error");
          setAiInsightJobId(null);
          return;
        }
        scheduleNextPoll();
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [aiInsightJobId, onOpenAiInsights]);

  const loadHistoryData = async (target: Pick<BsrItem, "asin" | "site">, options?: { isChild?: boolean }) => {
    if (!target?.asin) return;
    const isChild = !!options?.isChild;
    if (isChild) {
      setHistoryChildLoading(true);
      setHistoryChildError(null);
    } else {
      setHistoryMonthLoading(true);
      setHistoryMonthError(null);
    }
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const site = target.site || "US";
      const payload: Record<string, unknown> = { asin: target.asin, site };
      payload.is_child = isChild ? 1 : 0;
      const res = await fetch(`${apiBase}/api/bsr/monthly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const items = Array.isArray(data.items) ? (data.items as BsrHistoryRow[]) : [];
      if (isChild) {
        setHistoryChildData(items);
      } else {
        setHistoryMonthData(items);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "加载历史数据失败";
      if (isChild) {
        setHistoryChildError(message);
      } else {
        setHistoryMonthError(message);
      }
    } finally {
      if (isChild) {
        setHistoryChildLoading(false);
      } else {
        setHistoryMonthLoading(false);
      }
    }
  };

  const loadHistoryKeepaData = async (target: Pick<BsrItem, "asin" | "site">) => {
    if (!target?.asin) return;
    setHistoryKeepaLoading(true);
    setHistoryKeepaError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const site = target.site || "US";
      const res = await fetch(`${apiBase}/api/bsr/daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin: target.asin, site }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const items = Array.isArray(data.items) ? (data.items as BsrHistoryRow[]) : [];
      setHistoryKeepaData(items);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "加载 Keepa 插件替代数据失败";
      setHistoryKeepaError(message);
    } finally {
      setHistoryKeepaLoading(false);
    }
  };

  const loadCardMonthlySalesTrend = useCallback(async (target: Pick<BsrItem, "asin" | "site">) => {
    const asin = String(target?.asin || "").trim().toUpperCase();
    if (!asin) return;
    const site = String(target?.site || "US").trim().toUpperCase() || "US";
    const key = getMonthlyTrendKey(asin, site);
    if (
      Object.prototype.hasOwnProperty.call(monthlySalesTrendMapRef.current, key) ||
      monthlySalesTrendLoadingRef.current.has(key)
    ) {
      return;
    }
    monthlySalesTrendLoadingRef.current.add(key);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${apiBase}/api/bsr/monthly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin, site, is_child: 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(data.items) ? (data.items as BsrHistoryRow[]) : [];
      const trendValues = rows
        .map((row) => {
          const salesVolume = Number(row?.sales_volume);
          if (!Number.isFinite(salesVolume) || salesVolume < 0) return null;
          const salesAmountRaw = Number(row?.sales);
          const salesAmount = Number.isFinite(salesAmountRaw) ? salesAmountRaw : null;
          return {
            month: String(row?.month || ""),
            salesVolume,
            salesAmount,
          } as MonthlyTrendPoint;
        })
        .filter(Boolean)
        .slice(-12) as MonthlyTrendPoint[];
      setMonthlySalesTrendMap((prev) => ({ ...prev, [key]: trendValues }));
    } catch {
      setMonthlySalesTrendMap((prev) => ({ ...prev, [key]: [] }));
    } finally {
      monthlySalesTrendLoadingRef.current.delete(key);
    }
  }, [getMonthlyTrendKey]);

  useEffect(() => {
    monthlySalesTrendMapRef.current = monthlySalesTrendMap;
  }, [monthlySalesTrendMap]);

  useEffect(() => {
    setMonthlySalesTrendMap({});
    monthlySalesTrendMapRef.current = {};
    monthlySalesTrendLoadingRef.current.clear();
  }, [siteFilter]);

  const resolveKeepaRangeDays = (range: "7d" | "1m" | "3m" | "6m") => {
    if (range === "7d") return 7;
    if (range === "1m") return 30;
    if (range === "6m") return 180;
    return 90;
  };

  const submitAiInsightJob = async () => {
    if (!historyPopover?.asin) {
      showToast("请先选择一个ASIN。", "info");
      return;
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const asin = String(historyPopover.asin || "").trim().toUpperCase();
    const site = String(historyPopover.site || "US").trim().toUpperCase() || "US";
    const rangeDays = resolveKeepaRangeDays(historyKeepaRange);
    setAiInsightSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/ai-insights/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin,
          site,
          range_days: rangeDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const job = (data?.item || data?.data?.item || data?.data || null) as { job_id?: string } | null;
      const jobId = String(job?.job_id || "").trim();
      if (!jobId) {
        throw new Error("任务提交成功但未返回 job_id");
      }
      setAiInsightJobId(jobId);
      showToast("分析任务已提交，预计需要1-3分钟。", "info");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "AI分析失败";
      showToast(message, "error");
    } finally {
      setAiInsightSubmitting(false);
    }
  };

  const handleAiInsightAnalyzeClick = () => {
    showConfirm(
      "开始AI分析",
      "开始分析预计需要1-3分钟，是否继续？",
      () => {
        void submitAiInsightJob();
      }
    );
  };

  const historyKeepaFilteredData = useMemo(() => {
    if (!historyKeepaData.length) return [];
    const parsed = historyKeepaData
      .map((item) => {
        const raw = String(item?.date || "").trim();
        if (!raw) return null;
        const ts = new Date(raw).getTime();
        if (!Number.isFinite(ts)) return null;
        return { ...item, __ts: ts };
      })
      .filter(Boolean) as Array<BsrHistoryRow & { __ts: number }>;
    if (!parsed.length) return [];
    const latestTs = parsed.reduce((acc, cur) => (cur.__ts > acc ? cur.__ts : acc), parsed[0].__ts);
    const days = historyKeepaRange === "7d" ? 7 : historyKeepaRange === "1m" ? 30 : historyKeepaRange === "3m" ? 90 : 180;
    const fromTs = latestTs - (days - 1) * 24 * 60 * 60 * 1000;
    return parsed
      .filter((item) => item.__ts >= fromTs)
      .sort((a, b) => a.__ts - b.__ts)
      .map(({ __ts, ...rest }) => rest);
  }, [historyKeepaData, historyKeepaRange]);

  const openHistoryPopover = (target: BsrItem, initialTab: "month" | "child" | "price" | "keepa" = "month") => {
    if (historyPopover?.asin === target?.asin) {
      setHistoryTab(initialTab);
      if (initialTab === "child" && historyChildData.length === 0 && !historyChildLoading) {
        loadHistoryData(historyPopover, { isChild: true });
      }
      if ((initialTab === "month" || initialTab === "price") && historyMonthData.length === 0 && !historyMonthLoading) {
        loadHistoryData(historyPopover);
      }
      if (initialTab === "keepa" && historyKeepaData.length === 0 && !historyKeepaLoading) {
        loadHistoryKeepaData(historyPopover);
      }
      return;
    }
    setHistoryTab(initialTab);
    setHistoryPopover({ asin: target?.asin, site: target?.site || "US" });
    setHistoryMonthData([]);
    setHistoryChildData([]);
    setHistoryKeepaData([]);
    setHistoryMonthError(null);
    setHistoryChildError(null);
    setHistoryKeepaError(null);
    setHistoryKeepaRange("3m");
    setHistoryMonthLoading(false);
    setHistoryChildLoading(false);
    setHistoryKeepaLoading(false);
    if (initialTab === "child") {
      loadHistoryData(target, { isChild: true });
    } else if (initialTab === "keepa") {
      loadHistoryKeepaData(target);
    } else {
      loadHistoryData(target);
    }
  };

  const closeHistoryModal = () => {
    setHistoryPopover(null);
    setHistoryMonthData([]);
    setHistoryChildData([]);
    setHistoryKeepaData([]);
    setHistoryMonthError(null);
    setHistoryChildError(null);
    setHistoryKeepaError(null);
    setHistoryKeepaRange("3m");
    setHistoryMonthLoading(false);
    setHistoryChildLoading(false);
    setHistoryKeepaLoading(false);
  };

  const handleHistoryTabChange = (tab: "month" | "child" | "price" | "keepa") => {
    setHistoryTab(tab);
    if (!historyPopover) return;
    if (tab === "child" && historyChildData.length === 0 && !historyChildLoading) {
      loadHistoryData(historyPopover, { isChild: true });
    }
    if (tab === "price" && historyMonthData.length === 0 && !historyMonthLoading) {
      loadHistoryData(historyPopover);
    }
    if (tab === "month" && historyMonthData.length === 0 && !historyMonthLoading) {
      loadHistoryData(historyPopover);
    }
    if (tab === "keepa" && historyKeepaData.length === 0 && !historyKeepaLoading) {
      loadHistoryKeepaData(historyPopover);
    }
  };

  useEffect(() => {
    const activeData =
      historyTab === "child"
        ? historyChildData
        : historyTab === "keepa"
          ? historyKeepaFilteredData
          : historyMonthData;
    if (!historyPopover || !historyChartRef.current) return;
    if (activeData.length === 0) return;
    const chart = echarts.init(historyChartRef.current);
    const months = activeData.map((d) => d.month);
    const volumes = activeData.map((d) => (d.sales_volume ?? 0));
    const sales = activeData.map((d) => (d.sales ?? 0));
    const prices = activeData.map((d) => (d.price ?? 0));
    const isPriceTab = historyTab === "price";
    const isKeepaTab = historyTab === "keepa";
    const keepaDates = activeData.map((d) => d.date);
    const keepaBuyboxPrice = activeData.map((d) => Number(d.buybox_price ?? 0));
    const keepaPrice = activeData.map((d) => Number(d.price ?? 0));
    const keepaPrimePrice = activeData.map((d) => Number(d.prime_price ?? 0));
    const keepaCouponPrice = activeData.map((d) => Number(d.coupon_price ?? 0));
    const keepaChildSales = activeData.map((d) => Number(d.child_sales ?? 0));
    const keepaMainBsr = activeData.map((d) => {
      const value = Number(d.bsr_rank);
      return Number.isFinite(value) && value > 0 ? value : null;
    });
    const keepaSubBsr = activeData.map((d) => {
      const value = Number(d.bsr_reciprocating_saw_blades);
      return Number.isFinite(value) && value > 0 ? value : null;
    });
    chart.setOption({
      grid: isKeepaTab
        ? { left: 66, right: 56, top: 84, bottom: 58 }
        : { left: 52, right: 56, top: 46, bottom: 60 },
      tooltip: isKeepaTab
        ? {
          trigger: "axis",
          backgroundColor: "rgba(45, 47, 54, 0.92)",
          borderWidth: 0,
          padding: 10,
          textStyle: { color: "#FFFFFF", fontSize: 13 },
          extraCssText: "box-shadow: 0 10px 24px rgba(0,0,0,0.28); border-radius: 10px;",
          formatter: (rawParams: unknown) => {
            const params = (Array.isArray(rawParams) ? rawParams : [rawParams]) as Array<{
              axisValueLabel?: string;
              name?: string;
              seriesName?: string;
              color?: string;
              value?: unknown;
            }>;
            if (!params.length) return "";
            const title = String(params[0]?.axisValueLabel || params[0]?.name || "");
            const colorMap: Record<string, string> = {
              Buybox价格: "#35B96F",
              价格: "#8CCB66",
              Prime价格: "#B1C95A",
              Coupon价格: "#DA0B4D",
              子体销量: "#7C86FF",
              大类BSR: "#F97316",
              小类BSR: "#FB923C",
            };
            const formatValue = (name: string, val: unknown) => {
              const num = Number(val);
              if (!Number.isFinite(num)) return "-";
              if (name.includes("价格")) return `$${num.toFixed(2)}`;
              if (name.includes("BSR")) return `#${Math.round(num).toLocaleString()}`;
              return num.toLocaleString();
            };
            const lines = params
              .filter((p) => p?.seriesName)
              .map((p) => {
                const name = String(p.seriesName);
                const color = colorMap[name] || String(p.color || "#FFFFFF");
                const value = formatValue(name, p.value);
                return (
                  `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:240px;line-height:1.45;">` +
                  `<div style="display:flex;align-items:center;gap:7px;color:#E5E7EB;">` +
                  `<span style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block;"></span>` +
                  `<span>${name}</span>` +
                  `</div>` +
                  `<span style="margin-left:16px;color:#FFFFFF;font-weight:700;">${value}</span>` +
                  `</div>`
                );
              })
              .join("");
            return (
              `<div style="min-width:260px;">` +
              `<div style="font-size:14px;font-weight:700;color:#FFFFFF;margin-bottom:6px;">${title}</div>` +
              `${lines}` +
              `</div>`
            );
          },
        }
        : { trigger: "axis" },
      legend: {
        data: isKeepaTab
          ? ["Buybox价格", "价格", "Prime价格", "Coupon价格", "子体销量", "大类BSR", "小类BSR"]
          : isPriceTab
            ? ["价格"]
            : ["月销量", "月销售额"],
        top: 0,
        orient: "horizontal",
        left: isKeepaTab ? 10 : "center",
        right: isKeepaTab ? 220 : undefined,
        textStyle: { color: "#6B7280" },
      },
      xAxis: {
        type: "category",
        data: isKeepaTab ? keepaDates : months,
        axisLine: { lineStyle: { color: "#E5E7EB" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#94A3B8",
          rotate: isKeepaTab ? 0 : 55,
          margin: 10,
          fontSize: 11,
        },
        splitLine: { show: false },
        splitArea: { show: false },
      },
      yAxis: isKeepaTab
        ? [
          {
            type: "value",
            name: "价格($)",
            nameTextStyle: { color: "#6B7280", fontWeight: 600 },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: "#6B7280", fontWeight: 600 },
          },
          {
            type: "value",
            name: "BSR排名/子体销量",
            nameTextStyle: { color: "#6B7280", fontWeight: 600 },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: {
              color: "#6B7280",
              fontWeight: 600,
              formatter: (value: number) => Number(value || 0).toLocaleString(),
            },
          },
        ]
        : isPriceTab
        ? [
          {
            type: "value",
            name: "",
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: "#E5E7EB", type: "dashed" } },
            axisLabel: { color: "#F59E0B", fontWeight: 600 },
          },
        ]
        : [
          {
            type: "value",
            name: "",
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: "#F59E0B", fontWeight: 600 },
          },
          {
            type: "value",
            name: "",
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: "#22C55E", fontWeight: 600 },
          },
        ],
      series: isKeepaTab
        ? [
          {
            name: "Buybox价格",
            type: "line",
            data: keepaBuyboxPrice,
            smooth: false,
            lineStyle: { color: "#35B96F", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#35B96F", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "价格",
            type: "line",
            data: keepaPrice,
            smooth: false,
            step: "end",
            lineStyle: { color: "#8CCB66", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#8CCB66", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "Prime价格",
            type: "line",
            data: keepaPrimePrice,
            smooth: false,
            step: "end",
            lineStyle: { color: "#B1C95A", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#B1C95A", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "Coupon价格",
            type: "line",
            data: keepaCouponPrice,
            smooth: false,
            lineStyle: { color: "#DA0B4D", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#DA0B4D", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "子体销量",
            type: "line",
            yAxisIndex: 1,
            data: keepaChildSales,
            smooth: false,
            lineStyle: { color: "#7C86FF", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#7C86FF", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "大类BSR",
            type: "line",
            yAxisIndex: 1,
            data: keepaMainBsr,
            smooth: false,
            step: "end",
            lineStyle: { color: "#F97316", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#F97316", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
          {
            name: "小类BSR",
            type: "line",
            yAxisIndex: 1,
            data: keepaSubBsr,
            smooth: false,
            step: "end",
            lineStyle: { color: "#FB923C", width: 2.2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#FB923C", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 6,
            showSymbol: false,
            connectNulls: true,
          },
        ]
        : isPriceTab
        ? [
          {
            name: "价格",
            type: "line",
            data: prices,
            smooth: false,
            step: "end",
            lineStyle: { color: "#F59E0B", width: 2 },
            itemStyle: { color: "#F59E0B" },
            symbol: "none",
          },
        ]
        : [
          {
            name: "月销量",
            type: "bar",
            data: volumes,
            itemStyle: { color: "#F59E0B" },
            barWidth: 8,
            barCategoryGap: "65%",
          },
          {
            name: "月销售额",
            type: "line",
            yAxisIndex: 1,
            data: sales,
            smooth: true,
            lineStyle: { color: "#22C55E", width: 2 },
            itemStyle: { color: "#FFFFFF", borderColor: "#22C55E", borderWidth: 2 },
            symbol: "circle",
            symbolSize: 7,
          },
        ],
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [historyPopover, historyMonthData, historyChildData, historyKeepaFilteredData, historyTab]);

  const activeHistoryData =
    historyTab === "child" ? historyChildData : historyTab === "keepa" ? historyKeepaFilteredData : historyMonthData;
  const activeHistoryLoading =
    historyTab === "child" ? historyChildLoading : historyTab === "keepa" ? historyKeepaLoading : historyMonthLoading;
  const activeHistoryError =
    historyTab === "child" ? historyChildError : historyTab === "keepa" ? historyKeepaError : historyMonthError;

  const saveProductModal = async () => {
    const asin = String(productFormData.asin || "").trim();
    if (!asin) {
      setProductModalError("ASIN 为必填项。");
      return;
    }
    setProductModalSaving(true);
    setProductModalError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const payload = buildProductPayload();
      const targetSite =
        String(productBsrForm.site || payload.site || siteFilter || "US").trim().toUpperCase() || "US";
      const res = await fetch(
        `${apiBase}/api/yida-products/${encodeURIComponent(asin)}?site=${encodeURIComponent(targetSite)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await refreshLibraryItems();
      setProductModalOpen(false);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "保存失败，请检查后端服务或数据格式。";
      setProductModalError(message === "保存失败，请检查后端服务或数据格式。" ? message : `保存失败：${message}`);
    } finally {
      setProductModalSaving(false);
    }
  };

  const sidebarDropdownRefs = useRef<Record<SidebarFilterKey, HTMLDivElement | null>>(
    {} as Record<SidebarFilterKey, HTMLDivElement | null>
  );

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    if (!dateLoaded) {
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    const payload: Record<string, unknown> = { limit: 500 };
    if (dateFilter) {
      payload.createtime = dateFilter;
    }
    payload.site = siteFilter;
    logApi("load bsr list", `${apiBase}/api/bsr/query`, payload);
    fetch(`${apiBase}/api/bsr/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          logApi("bsr query response not ok", res.status);
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          logApi("bsr query error", err);
          setError("加载 BSR 数据失败，请检查后端服务。");
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [dateFilter, dateOptions.length, siteFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLibraryLoading(true);
    setLibraryError(null);
    fetch(`${apiBase}/api/yida-products/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 200, site: siteFilter }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setLibraryItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Failed to load product library:", err);
          setLibraryItems([]);
          setLibraryError(null);
        }
      })
      .finally(() => {
        setLibraryLoading(false);
      });

    return () => controller.abort();
  }, [siteFilter]);

  const activeBrands = filterState.brands;
  const activeRatings = filterState.ratings;
  const activeLabels = filterState.labels;

  const selectFilter = (key: FilterKey, value: string) => {
    const pluralKey = `${key}s` as keyof typeof filterState;
    const isAllOption = value.startsWith("All ");

    setFilterState((prev) => {
      const current = prev[pluralKey] as string[];
      if (isAllOption) {
        return { ...prev, [pluralKey]: [] };
      }

      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      return { ...prev, [pluralKey]: next };
    });
  };

  const toggleSidebarDropdown = (key: SidebarFilterKey) => {
    setSidebarOpenDropdown(sidebarOpenDropdown === key ? null : key);
  };

  const toggleSidebarBrand = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const toggleSidebarTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const closeMappingModal = () => {
    setMappingModalOpen(false);
    setMappingLeft(null);
    setMappingRight(null);
    setMappingRightMeta(null);
    setMappingError(null);
    setStrategyOpen(false);
    setSelectedStrategy(null);
  };

  const parseMoney = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseDate = (value: unknown) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatValue = (type: string, value: unknown) => {
    if (value === null || value === undefined) return "-";
    if (type === "currency") return `$${Number(value).toFixed(2)}`;
    if (type === "percent") return `${(Number(value) * 100).toFixed(2)}%`;
    if (type === "rank") return `#${Number(value).toLocaleString()}`;
    if (type === "int") return Number(value).toLocaleString();
    if (type === "date") return String(value);
    return String(value);
  };

  const buildMetricRows = (left: Partial<BsrItem> | null | undefined, right: Partial<BsrItem> | null | undefined) => {
    const rows = [
      { key: "price", label: "价格", type: "currency", better: "lower", left: parseMoney(left?.price), right: parseMoney(right?.price) },
      { key: "bsr_rank", label: "BSR排名(类目)", type: "rank", better: "lower", left: parseNumber(left?.bsr_rank), right: parseNumber(right?.bsr_rank) },
      { key: "category_rank", label: "BSR排名(大类)", type: "rank", better: "lower", left: parseNumber(left?.category_rank), right: parseNumber(right?.category_rank) },
      { key: "rating", label: "星级", type: "number", better: "higher", left: parseNumber(left?.rating ?? left?.score), right: parseNumber(right?.rating ?? right?.score) },
      { key: "reviews", label: "评论数", type: "int", better: "higher", left: parseNumber(left?.reviews ?? left?.comment_count), right: parseNumber(right?.reviews ?? right?.comment_count) },
      { key: "sales_volume", label: "估算销量", type: "int", better: "higher", left: parseNumber(left?.sales_volume), right: parseNumber(right?.sales_volume) },
      { key: "sales", label: "估算销售额", type: "currency", better: "higher", left: parseMoney(left?.sales), right: parseMoney(right?.sales) },
      { key: "conversion_rate", label: "综合转化率", type: "percent", better: "higher", left: parseNumber(left?.conversion_rate), right: parseNumber(right?.conversion_rate) },
      { key: "organic_traffic_count", label: "7天自然流量占比", type: "int", better: "higher", left: parseNumber(left?.organic_traffic_count), right: parseNumber(right?.organic_traffic_count) },
      { key: "ad_traffic_count", label: "7天广告流量占比", type: "int", better: "higher", left: parseNumber(left?.ad_traffic_count), right: parseNumber(right?.ad_traffic_count) },
      { key: "launch_date", label: "上架时间", type: "date", better: "earlier", left: left?.launch_date || null, right: right?.launch_date || null },
      { key: "variation_count", label: "变体数", type: "int", better: "higher", left: parseNumber(left?.variation_count), right: parseNumber(right?.variation_count) },
    ];

    return rows.map((row) => {
      let diffText = "-";
      let diffClass = "text-gray-400";
      if (row.type === "date") {
        const leftDate = parseDate(row.left);
        const rightDate = parseDate(row.right);
        if (leftDate && rightDate) {
          const diffDays = Math.round((rightDate.getTime() - leftDate.getTime()) / 86400000);
          diffText = `${diffDays >= 0 ? "+" : ""}${diffDays}天`;
          if (row.better === "earlier") {
            diffClass = rightDate < leftDate ? "text-green-600" : "text-red-500";
          }
        }
      } else if (row.left !== null && row.right !== null) {
        const diff = Number(row.right) - Number(row.left);
        if (row.type === "percent") {
          diffText = `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(2)}%`;
        } else if (row.type === "currency") {
          diffText = `${diff >= 0 ? "+" : ""}$${Math.abs(diff).toFixed(2)}`;
        } else {
          diffText = `${diff >= 0 ? "+" : ""}${diff.toFixed(2).replace(/\.00$/, "")}`;
        }
        if (row.better === "lower") {
          diffClass = Number(row.right) < Number(row.left) ? "text-green-600" : "text-red-500";
        } else if (row.better === "higher") {
          diffClass = Number(row.right) > Number(row.left) ? "text-green-600" : "text-red-500";
        }
      }
      return {
        ...row,
        leftDisplay: formatValue(row.type, row.left),
        rightDisplay: formatValue(row.type, row.right),
        diffText,
        diffClass,
      };
    });
  };

  const openMappingCompare = async (item: BsrItem, yidaAsin: string, meta?: ProductLibraryItem) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    let rightItem = items.find((row) => row.asin === yidaAsin) || null;
    if (!rightItem) {
      const lookupPayload: Record<string, unknown> = { asin: yidaAsin };
      if (item?.createtime || dateFilter) {
        lookupPayload.createtime = item?.createtime || dateFilter;
      }
      lookupPayload.site = item?.site || siteFilter;
      const lookup = await fetch(`${apiBase}/api/bsr/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lookupPayload),
      });
      if (lookup.ok) {
        const data = await lookup.json();
        rightItem = data.item || null;
      }
    }

    const rightMeta =
      meta || libraryItems.find((p) => p.asin === yidaAsin) || { asin: yidaAsin, product: "-" };

    setMappingLeft(item);
    setMappingRight(rightItem);
    setMappingRightMeta(rightMeta);
    setCompareTargetAsin(yidaAsin);
    setStrategyOpen(false);
    setMappingModalOpen(true);
  };

  const strategyOwners = useMemo(() => {
    const set = new Set<string>();
    strategyTasks.forEach((task) => task.owner && set.add(task.owner));
    return ["全部", ...Array.from(set)];
  }, [strategyTasks]);

  const strategyOwnerSelectOptions = useMemo<SelectOption[]>(() => {
    const placeholder = strategyOwnerLoading ? "加载中..." : "选择团队成员";
    return [{ value: "", label: placeholder }, ...strategyOwnerOptions];
  }, [strategyOwnerOptions, strategyOwnerLoading]);

  const strategyBrands = useMemo(() => {
    const set = new Set<string>();
    strategyTasks.forEach((task) => task.brand && set.add(task.brand));
    return ["全部", ...Array.from(set)];
  }, [strategyTasks]);

  const strategyPriorities = useMemo(() => {
    const set = new Set<string>();
    strategyTasks.forEach((task) => task.priority && set.add(task.priority));
    return ["全部", ...Array.from(set)];
  }, [strategyTasks]);

  const strategyStatuses = useMemo(() => {
    return ["全部", "待开始", "进行中", "已完成", "搁置"];
  }, []);

  const strategyStateTone: Record<string, string> = {
    "待开始": "bg-gray-50",
    "进行中": "bg-blue-50",
    "已完成": "bg-green-50",
    "搁置": "bg-yellow-50",
  };

  const strategyStateBadge: Record<string, string> = {
    "待开始": "bg-gray-900 text-white",
    "进行中": "bg-blue-600 text-white",
    "已完成": "bg-green-500 text-white",
    "搁置": "bg-yellow-200 text-yellow-700",
  };

  const activeStrategyAsin = compareTargetAsin || mappingRightMeta?.asin || "";

  const filteredStrategyTasks = useMemo(() => {
    return strategyTasks.filter((task) => {
      const ownerOk = strategyFilters.owner === "全部" || task.owner === strategyFilters.owner;
      const brandOk = strategyFilters.brand === "全部" || task.brand === strategyFilters.brand;
      const priorityOk = strategyFilters.priority === "全部" || task.priority === strategyFilters.priority;
      const statusOk = strategyFilters.status === "全部" || task.state === strategyFilters.status;
      const asinOk = !activeStrategyAsin || task.yida_asin === activeStrategyAsin;
      return ownerOk && brandOk && priorityOk && statusOk && asinOk;
    });
  }, [strategyTasks, strategyFilters, activeStrategyAsin]);

  const compareOptions = useMemo(() => {
    const mappedAsins = splitAsins(mappingLeft?.yida_asin);
    const baseList = mappedAsins.length > 0 ? mappedAsins : libraryItems.map((p) => p.asin);
    const selectedAsin = compareTargetAsin || mappingRightMeta?.asin || "";
    if (selectedAsin && !baseList.includes(selectedAsin)) {
      baseList.unshift(selectedAsin);
    }
    const uniqueList = Array.from(new Set(baseList));
    return uniqueList.map((asin) => {
      const meta = libraryItems.find((p) => p.asin === asin);
      return {
        asin,
        name: meta?.product || meta?.name || asin,
      };
    });
  }, [mappingLeft?.yida_asin, libraryItems, compareTargetAsin, mappingRightMeta?.asin]);

  const strategyGridTemplate =
    "minmax(180px,1.6fr) 110px 90px 90px 80px 110px 96px 64px";

  const handleMapClick = async (item: BsrItem) => {
    if (!selectedLibraryItem) {
      showToast("请先在产品库中选择产品。", "error");
      return;
    }
    const existingAsins = splitAsins(item.yida_asin);
    const targetAsin = selectedLibraryItem.asin;
    if (
      String(targetAsin || "").trim().toLowerCase() ===
      String(item.asin || "").trim().toLowerCase()
    ) {
      showToast("不能映射相同 ASIN。", "info");
      return;
    }
    if (existingAsins.includes(targetAsin)) {
      showToast("该ASIN已在映射列表中。", "info");
      return;
    }
    const updatedAsins = [...existingAsins, targetAsin].filter(Boolean);
    const updatedAsinValue = updatedAsins.join(",");
    const confirmTitle = existingAsins.length > 0 ? "确认追加映射" : "确认映射";
    const confirmMessage =
      existingAsins.length > 0
        ? `ASIN ${item.asin} → 追加映射 ${targetAsin}`
        : `ASIN ${item.asin} → ASIN ${targetAsin}`;
    showConfirm(
      confirmTitle,
      confirmMessage,
      async () => {
        setMappingLoading(true);
        setMappingError(null);
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || "";
          const payload = {
            yida_asin: updatedAsinValue,
            createtime: item.createtime || dateFilter || null,
            site: item.site || siteFilter,
          };
          const res = await fetch(`${apiBase}/api/bsr/${item.asin}/mapping`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          setItems((prev) =>
            prev.map((row) => {
              const sameAsin = row.asin === item.asin;
              const sameTime = !payload.createtime || row.createtime === payload.createtime;
              if (!sameAsin || !sameTime) return row;
              return { ...row, yida_asin: updatedAsinValue };
            })
          );
          showToast(existingAsins.length > 0 ? "映射已更新。" : "映射成功。", "success");
        } catch (err) {
          setMappingError("映射失败，请检查后端服务。");
          showToast("映射失败，请检查后端服务。", "error");
        } finally {
          setMappingLoading(false);
        }
      }
    );
  };

  const handleCompareClick = async (item: BsrItem) => {
    if (isOwnProduct(item)) {
      showToast("自家产品无需对比。", "info");
      return;
    }
    const mappedAsin = firstAsin(item.yida_asin);
    if (mappedAsin) {
      setMappingLoading(true);
      setMappingError(null);
      try {
        const meta = libraryItems.find((p) => p.asin === mappedAsin) || {
          asin: mappedAsin,
          product: "-",
        };
        await openMappingCompare(item, mappedAsin, meta);
      } catch (err) {
        setMappingError("获取对比数据失败，请检查后端服务。");
        showToast("获取对比数据失败，请检查后端服务。", "error");
      } finally {
        setMappingLoading(false);
      }
      return;
    }
    if (!selectedLibraryItem) {
      showToast("请先在产品库中选择产品。", "error");
      return;
    }
    setMappingLoading(true);
    setMappingError(null);
    try {
      await openMappingCompare(item, selectedLibraryItem.asin, selectedLibraryItem);
    } catch (err) {
      setMappingError("获取对比数据失败，请检查后端服务。");
      showToast("获取对比数据失败，请检查后端服务。", "error");
    } finally {
      setMappingLoading(false);
    }
  };

  const handleCompareSelect = async (asin: string) => {
    if (!mappingLeft || !asin) return;
    setMappingLoading(true);
    setMappingError(null);
    try {
      const meta = libraryItems.find((p) => p.asin === asin) || {
        asin,
        product: "-",
      };
      await openMappingCompare(mappingLeft, asin, meta);
    } catch (err) {
      setMappingError("获取对比数据失败，请检查后端服务。");
      showToast("获取对比数据失败，请检查后端服务。", "error");
    } finally {
      setMappingLoading(false);
    }
  };

  const handleCancelMapping = async () => {
    if (!mappingLeft) return;
    const existingAsins = splitAsins(mappingLeft.yida_asin);
    const targetAsin =
      compareTargetAsin || mappingRightMeta?.asin || existingAsins[0] || "";
    if (!targetAsin) {
      showToast("暂无可取消的映射ASIN。", "info");
      return;
    }
    if (!existingAsins.includes(targetAsin)) {
      showToast("该ASIN未在映射列表中。", "info");
      return;
    }
    const remainingAsins = existingAsins.filter((asin) => asin !== targetAsin);
    const updatedAsinValue = remainingAsins.join(",");
    showConfirm(
      "确认取消映射",
      `ASIN ${mappingLeft.asin} → 取消映射，自家ASIN：${targetAsin}`,
      async () => {
        setMappingActionLoading(true);
        setMappingError(null);
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || "";
          const payload = {
            yida_asin: remainingAsins.length > 0 ? updatedAsinValue : null,
            createtime: mappingLeft.createtime || dateFilter || null,
            site: mappingLeft.site || siteFilter,
          };
          const res = await fetch(`${apiBase}/api/bsr/${mappingLeft.asin}/mapping`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          setItems((prev) =>
            prev.map((item) => {
              const sameAsin = item.asin === mappingLeft.asin;
              const sameTime =
                !payload.createtime || item.createtime === payload.createtime;
              if (!sameAsin || !sameTime) return item;
              return { ...item, yida_asin: updatedAsinValue };
            })
          );
          const updatedLeft = { ...mappingLeft, yida_asin: updatedAsinValue };
          setMappingLeft(updatedLeft);
          if (remainingAsins.length > 0) {
            const nextAsin = remainingAsins[0];
            const meta = libraryItems.find((p) => p.asin === nextAsin) || {
              asin: nextAsin,
              product: "-",
            };
            setCompareTargetAsin(nextAsin);
            setMappingRightMeta(meta);
            await openMappingCompare(updatedLeft, nextAsin, meta);
          } else {
            setCompareTargetAsin("");
            setMappingRight(null);
            setMappingRightMeta(null);
          }
          showToast("已取消映射。");
        } catch (err) {
          setMappingError("取消映射失败，请检查后端服务。");
          showToast("取消映射失败，请检查后端服务。", "error");
        } finally {
          setMappingActionLoading(false);
        }
      }
    );
  };

  const leftCompareItem = mappingLeft;
  const rightCompareItem = mappingRight;

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown] && !dropdownRefs.current[openDropdown]?.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
      if (sidebarOpenDropdown && sidebarDropdownRefs.current[sidebarOpenDropdown] && !sidebarDropdownRefs.current[sidebarOpenDropdown]?.contains(event.target as Node)) {
        setSidebarOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown, sidebarOpenDropdown]);


  const toggleDropdown = (key: FilterKey) => {
    setOpenDropdown(openDropdown === key ? null : key);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const priceValue = parsePrice(item.price);
      const keyword = search.trim().toLowerCase();

      const matchesKeyword =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.asin.toLowerCase().includes(keyword);

      const matchesBrand = activeBrands.length === 0 || activeBrands.includes(item.brand);

      const matchesRating = activeRatings.length === 0 || activeRatings.some(r => {
        const minRating = Number.parseFloat(r.replace("+", ""));
        return item.rating >= minRating;
      });

      const minValue = priceMin.trim() === "" ? null : Number(priceMin);
      const maxValue = priceMax.trim() === "" ? null : Number(priceMax);
      const hasMin = minValue !== null && !Number.isNaN(minValue);
      const hasMax = maxValue !== null && !Number.isNaN(maxValue);
      const matchesPrice = (!hasMin && !hasMax)
        ? true
        : (hasMin ? priceValue >= (minValue as number) : true) && (hasMax ? priceValue <= (maxValue as number) : true);

      const matchesLabel = activeLabels.length === 0 || (item.tags && item.tags.some((tag: string) => activeLabels.includes(tag)));

      return (
        matchesKeyword &&
        matchesBrand &&
        matchesRating &&
        matchesPrice &&
        matchesLabel
      );
    });
  }, [items, search, activeBrands, activeRatings, activeLabels, priceMin, priceMax]);

  const isInitialLoad = items.length === 0 && loading;

  const clearImportError = useCallback(() => {
    setImportError(null);
  }, []);

  const resetImportModalState = useCallback(() => {
    setImportOpen(false);
    setSellerImportFile(null);
    setJimuImportFile(null);
    setSellerImportFileNext(null);
    setJimuImportFileNext(null);
    setImportError(null);
    setImportLoading(false);
    setSellerImportDragging(false);
    setJimuImportDragging(false);
    setSellerImportDraggingNext(false);
    setJimuImportDraggingNext(false);
  }, []);

  const clearLibraryHoverTimer = useCallback(() => {
    if (libraryHoverTimer.current !== null) {
      window.clearTimeout(libraryHoverTimer.current);
      libraryHoverTimer.current = null;
    }
  }, []);

  const scheduleHideLibraryHover = useCallback(() => {
    clearLibraryHoverTimer();
    libraryHoverTimer.current = window.setTimeout(() => {
      setLibraryHover(null);
    }, 120);
  }, [clearLibraryHoverTimer]);

  const handleLibraryCardSelect = useCallback((item: ProductLibraryItem) => {
    setSelectedLibraryItem(item);
  }, []);

  const handleLibraryCardEdit = useCallback((item: ProductLibraryItem) => {
    setSelectedLibraryItem(item);
    openProductModal(item);
  }, [openProductModal]);

  const handleLibraryCardSparklineHover = useCallback((asin: string, index: number | null) => {
    setLibrarySparklineHover(index === null ? null : { asin, index });
  }, []);

  const handleLibraryCardHoverShow = useCallback((rect: DOMRect, payload: LibraryHoverPayload) => {
    clearLibraryHoverTimer();
    setLibraryHover({ rect, payload });
  }, [clearLibraryHoverTimer]);

  const handleLibraryCardHoverHide = useCallback((asin: string) => {
    scheduleHideLibraryHover();
    setLibrarySparklineHover((prev) => (prev?.asin === asin ? null : prev));
  }, [scheduleHideLibraryHover]);

  useEffect(() => {
    return () => clearLibraryHoverTimer();
  }, [clearLibraryHoverTimer]);

  return (
    <div className="flex-1 flex min-h-screen bg-[#F7F9FB] w-full">
      <div className={`flex-1 transition-all duration-300 ${collapsed ? "ml-20" : "ml-56"}`}>
        <header className="px-8 pt-8 pb-0 flex justify-between items-center">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <button
              type="button"
              onClick={handleToggleCollapse}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-800 transition"
              title={collapsed ? "展开菜单" : "收起菜单"}
            >
              <SidebarSimple className="text-xl" />
            </button>
            <Star className="text-xl text-gray-800" weight="fill" />
            <span className="text-gray-400">Dashboards</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">BSR</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">Site</span>
              <div className="relative w-24" ref={(el) => (dropdownRefs.current["site"] = el)}>
                <button
                  onClick={() => toggleDropdown("site")}
                  className="w-full flex justify-between items-center px-3 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition"
                >
                  <span className="truncate">{siteFilter}</span>
                  <CaretDown size={14} className={`text-gray-400 transition-transform ${openDropdown === "site" ? "rotate-180" : ""}`} />
                </button>
                {openDropdown === "site" && (
                  <div className="z-20 absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {siteOptions.map((site) => (
                        <button
                          key={site}
                          onClick={() => {
                            setSiteFilter(site);
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${siteFilter === site
                            ? "bg-blue-50 text-[#3B9DF8] font-bold"
                            : "text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                          {site}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">Date</span>
              <div className="relative w-40" ref={(el) => (dropdownRefs.current["date"] = el)}>
                <button
                  onClick={() => toggleDropdown("date")}
                  disabled={dateLoading || dateOptions.length === 0}
                  className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition disabled:opacity-50"
                >
                  <span className="truncate">
                    {dateFilter || (dateLoading ? "加载中..." : dateError ? "加载失败" : "选择日期")}
                  </span>
                  <CaretDown size={14} className={`text-gray-400 transition-transform ${openDropdown === "date" ? "rotate-180" : ""}`} />
                </button>

                {openDropdown === "date" && (
                  <div className="z-20 absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {dateOptions.map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            setDateFilter(date);
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${dateFilter === date
                            ? "bg-blue-50 text-[#3B9DF8] font-bold"
                            : "text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                          {date}
                        </button>
                      ))}
                      {dateOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-400">暂无日期</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative w-56">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 ASIN / 标题"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition outline-none focus:ring-2 focus:ring-[#3B9DF8]/30"
              />
            </div>
            <button
              type="button"
              onClick={handleFetchDaily}
              disabled={fetchDailyLoading}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
              title={fetchDailyLoading ? "抓取中..." : "抓取数据"}
            >
              {fetchDailyLoading ? (
                <ArrowsClockwise size={18} className="animate-spin" />
              ) : (
                <DownloadSimple size={18} />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportError(null);
              }}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
              title="导入数据"
            >
              <UploadSimple size={18} />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
              onClick={handleToggleFullscreen}
              title="全屏"
            >
              <CornersOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-8">
          <div className="flex flex-col xl:flex-row gap-8 xl:items-start w-full">
            {/* Left Column: Filters and Grid */}
            <div className="flex-1 min-w-0 xl:flex-[2]">
              {/* Filters */}
              <div className="bg-white p-5 rounded-3xl shadow-sm mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Funnel size={20} className="text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Filters</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { key: "brand", label: "Brand", options: brandOptions, selected: activeBrands },
                    { key: "rating", label: "Rating", options: ratingOptions, selected: activeRatings },
                    { key: "label", label: "Label", options: labelOptions, selected: activeLabels },
                  ].map((filter) => (
                    <div key={filter.key} className="relative" ref={(el) => (dropdownRefs.current[filter.key as FilterKey] = el)}>
                      <label className="block text-xs font-medium text-gray-400 mb-1 ml-1">{filter.label}</label>
                      <button
                        onClick={() => toggleDropdown(filter.key as FilterKey)}
                        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition"
                      >
                        <span className="truncate">
                          {filter.selected.length === 0
                            ? filter.options[0]
                            : filter.selected.length === 1
                              ? filter.selected[0]
                              : `${filter.label}: ${filter.selected.length}`}
                        </span>
                        <CaretDown size={14} className={`text-gray-400 transition-transform ${openDropdown === filter.key ? "rotate-180" : ""}`} />
                      </button>

                      {openDropdown === filter.key && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-30 max-h-64 overflow-y-auto w-full min-w-[160px]">
                          {filter.options.map((opt) => {
                            const isSelected = filter.selected.includes(opt) || (opt.startsWith("All ") && filter.selected.length === 0);
                            return (
                              <button
                                key={opt}
                                onClick={() => selectFilter(filter.key as FilterKey, opt)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ${isSelected
                                  ? "bg-blue-50 text-[#3B9DF8]"
                                  : "text-gray-600 hover:bg-gray-50"
                                  }`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected
                                  ? "bg-[#3B9DF8] border-[#3B9DF8]"
                                  : "border-gray-300"
                                  }`}>
                                  {isSelected && <Check size={10} weight="bold" className="text-white" />}
                                </div>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1 ml-1">Price</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={priceMin}
                        onChange={(e) => setPriceMin(e.target.value)}
                        placeholder="Min"
                        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition outline-none focus:ring-2 focus:ring-[#3B9DF8]/30"
                      />
                      <input
                        type="number"
                        value={priceMax}
                        onChange={(e) => setPriceMax(e.target.value)}
                        placeholder="Max"
                        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition outline-none focus:ring-2 focus:ring-[#3B9DF8]/30"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Product Grid */}
              <div className={`grid grid-cols-1 md:grid-cols-2 ${collapsed ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-6 min-h-[400px]`}>
                {isInitialLoad && (
                  <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Sun size={48} className="mx-auto mb-4 opacity-20" />
                    <p>正在加载 BSR 数据...</p>
                  </div>
                )}

                {!isInitialLoad && error && (
                  <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Sun size={48} className="mx-auto mb-4 opacity-20" />
                    <p>{error}</p>
                  </div>
                )}

                {filteredItems.map((item) => (
                  <ProductCard
                    key={`${String(item.site || "US").toUpperCase()}-${item.asin}`}
                    item={item}
                    prevItem={prevItemsMap[item.asin]}
                    onTag={openTagModal}
                    onMap={handleMapClick}
                    onCompare={handleCompareClick}
                    onHistory={openHistoryPopover}
                    monthlySalesTrend={monthlySalesTrendMap[
                      getMonthlyTrendKey(item.asin, item.site || siteFilter)
                    ]}
                    onRequestMonthlySalesTrend={loadCardMonthlySalesTrend}
                  />
                ))}

                {!loading && !error && filteredItems.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
                    <MagnifyingGlass size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No products found matching your filters.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Own Product Library */}
            <aside className="w-full xl:w-[400px] shrink-0">
              <div className="bg-white rounded-3xl shadow-sm p-5 flex flex-col">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <h3 className="font-bold text-gray-900">产品库</h3>
                </div>

                {/* Sidebar Search */}
                <div className="relative mb-4 shrink-0">
                  <MagnifyingGlass
                    className="absolute left-3 top-2.5 text-gray-400"
                    size={16}
                  />
                  <FormInput
                    size="sm"
                    type="text"
                    placeholder="搜索 产品名称, ASIN..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    className="pl-9 pr-4"
                  />
                </div>

                {/* Sidebar Filters */}
                <div className="grid grid-cols-2 gap-2 mb-6 shrink-0">
                  {/* Brand Filter */}
                  <div className="relative" ref={(el) => (sidebarDropdownRefs.current["brand"] = el)}>
                    <button
                      onClick={() => toggleSidebarDropdown("brand")}
                      className="w-full flex justify-between items-center px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-[10px] font-bold text-gray-700 transition"
                    >
                      <span className="truncate">{selectedBrands.length === 0 ? "All Brands" : `${selectedBrands.length} selected`}</span>
                      <CaretDown size={10} className={`text-gray-400 transition-transform ${sidebarOpenDropdown === "brand" ? "rotate-180" : ""}`} />
                    </button>

                    {sidebarOpenDropdown === "brand" && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-40 max-h-48 overflow-y-auto w-full min-w-[120px]">
                        {sidebarBrandOptions.map((brand) => (
                          <label
                            key={brand}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] cursor-pointer hover:bg-gray-50 transition"
                          >
                            <input
                              type="checkbox"
                              checked={selectedBrands.includes(brand)}
                              onChange={() => toggleSidebarBrand(brand)}
                              className="w-3 h-3 rounded border-gray-300 text-[#3B9DF8] focus:ring-[#3B9DF8]/20"
                            />
                            <span className={selectedBrands.includes(brand) ? "text-gray-900 font-bold" : "text-gray-600"}>{brand}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tag Filter */}
                  <div className="relative" ref={(el) => (sidebarDropdownRefs.current["tag"] = el)}>
                    <button
                      onClick={() => toggleSidebarDropdown("tag")}
                      className="w-full flex justify-between items-center px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-[10px] font-bold text-gray-700 transition"
                    >
                      <span className="truncate">{selectedTags.length === 0 ? "All Tags" : `${selectedTags.length} selected`}</span>
                      <CaretDown size={10} className={`text-gray-400 transition-transform ${sidebarOpenDropdown === "tag" ? "rotate-180" : ""}`} />
                    </button>

                    {sidebarOpenDropdown === "tag" && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-40 max-h-48 overflow-y-auto w-full min-w-[120px]">
                        {sidebarTagOptions.map((tag) => (
                          <label
                            key={tag}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] cursor-pointer hover:bg-gray-50 transition"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag)}
                              onChange={() => toggleSidebarTag(tag)}
                              className="w-3 h-3 rounded border-gray-300 text-[#3B9DF8] focus:ring-[#3B9DF8]/20"
                            />
                            <span className={selectedTags.includes(tag) ? "text-gray-900 font-bold" : "text-gray-600"}>{tag}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>


                <div className="space-y-4 pr-1 overflow-y-auto overflow-x-visible flex-1 custom-scrollbar">
                  {libraryLoading && (
                    <div className="p-6 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
                      正在加载产品库...
                    </div>
                  )}
                  {!libraryLoading && libraryError && (
                    <div className="p-6 text-center text-sm text-red-500 bg-red-50 rounded-2xl">
                      {libraryError}
                    </div>
                  )}
                  {!libraryLoading && !libraryError && filteredSidebarProducts.length === 0 && (
                    <div className="p-6 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
                      暂无产品库数据
                    </div>
                  )}
                  {!libraryLoading && !libraryError && filteredSidebarProducts.map((p) => {
                    const trendKey = getMonthlyTrendKey(p.asin, p.site || siteFilter);
                    return (
                      <LibraryProductCard
                        key={`${String(p.site || siteFilter || "US").toUpperCase()}-${p.asin}`}
                        product={p}
                        siteFilter={siteFilter}
                        selected={selectedLibraryItem?.asin === p.asin}
                        monthlySalesTrend={monthlySalesTrendMap[trendKey]}
                        activeSparklineIndex={librarySparklineHover?.asin === p.asin ? librarySparklineHover.index : null}
                        onSparklineHoverChange={handleLibraryCardSparklineHover}
                        onSelect={handleLibraryCardSelect}
                        onEdit={handleLibraryCardEdit}
                        onRequestMonthlySalesTrend={loadCardMonthlySalesTrend}
                        onHoverShow={handleLibraryCardHoverShow}
                        onHoverHide={handleLibraryCardHoverHide}
                      />
                    );
                  })}
                </div>

                <button
                  className="w-full mt-4 py-3 bg-gray-50 text-gray-500 text-sm font-semibold rounded-2xl hover:bg-gray-100 transition flex items-center justify-center gap-2 shrink-0"
                  onClick={onViewAllProducts}
                  type="button"
                >
                  查看全部产品 <ArrowRight size={14} />
                </button>
              </div>
            </aside>
          </div>
        </main>

        <LibraryHoverPopover
          hover={libraryHover}
          onMouseEnter={clearLibraryHoverTimer}
          onMouseLeave={scheduleHideLibraryHover}
        />

        {importOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">导入数据</h3>
                  <p className="text-xs text-gray-400 mt-1">支持 CSV 或 Excel（.csv / .xlsx / .xls）</p>
                </div>
                <button
                  onClick={resetImportModalState}
                  className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-gray-700">站点</div>
                  <select
                    value={importSite}
                    onChange={(e) => setImportSite(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3B9DF8]/30 focus:border-[#3B9DF8]"
                  >
                    <option value="US">US</option>
                    <option value="CA">CA</option>
                    <option value="UK">UK</option>
                    <option value="DE">DE</option>
                  </select>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ImportUploadField
                      title="卖家精灵明细"
                      file={sellerImportFile}
                      isDragging={sellerImportDragging}
                      onDragStateChange={setSellerImportDragging}
                      onFileChange={setSellerImportFile}
                      onClearError={clearImportError}
                    />
                    <ImportUploadField
                      title="卖家精灵明细（销量、销售额）"
                      file={sellerImportFileNext}
                      isDragging={sellerImportDraggingNext}
                      onDragStateChange={setSellerImportDraggingNext}
                      onFileChange={setSellerImportFileNext}
                      onClearError={clearImportError}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ImportUploadField
                      title="极木与西柚数据#1-50"
                      file={jimuImportFile}
                      isDragging={jimuImportDragging}
                      onDragStateChange={setJimuImportDragging}
                      onFileChange={setJimuImportFile}
                      onClearError={clearImportError}
                    />
                    <ImportUploadField
                      title="极木与西柚数据#51-100"
                      file={jimuImportFileNext}
                      isDragging={jimuImportDraggingNext}
                      onDragStateChange={setJimuImportDraggingNext}
                      onFileChange={setJimuImportFileNext}
                      onClearError={clearImportError}
                    />
                  </div>
                </div>

                {importError && (
                  <div className="text-xs text-red-500">{importError}</div>
                )}
              </div>

              <div className="p-6 pt-0 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetImportModalState}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={
                    importLoading ||
                    (!sellerImportFileNext && !(sellerImportFile && jimuImportFile && jimuImportFileNext)) ||
                    (!!(sellerImportFile || jimuImportFile || jimuImportFileNext) &&
                      !(sellerImportFile && jimuImportFile && jimuImportFileNext))
                  }
                  className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-[#1C1C1E] hover:bg-black disabled:opacity-40 transition"
                >
                  {importLoading ? "导入中..." : "确定"}
                </button>
              </div>
            </div>
          </div>
        )}

        {historyPopover && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={closeHistoryModal}
          >
            <div
              className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-8">
                  {[
                    { key: "month", label: "月销量" },
                    { key: "child", label: "子体销量" },
                    { key: "price", label: "价格" },
                    { key: "keepa", label: "Keepa插件替代" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleHistoryTabChange(tab.key as "month" | "child" | "price" | "keepa")}
                      className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${historyTab === tab.key
                        ? "text-[#F59E0B] border-[#F59E0B]"
                        : "text-gray-500 border-transparent hover:text-gray-700"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={closeHistoryModal}
                  className="w-9 h-9 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 pt-4">
                {activeHistoryLoading && (
                  <div className="text-sm text-gray-400 py-10 text-center">加载中...</div>
                )}
                {!activeHistoryLoading && activeHistoryError && (
                  <div className="text-sm text-red-500 py-8 text-center">{activeHistoryError}</div>
                )}
                {!activeHistoryLoading && !activeHistoryError && (activeHistoryData?.length || 0) === 0 && (
                  <div className="text-sm text-gray-400 py-10 text-center">
                    {historyTab === "month"
                      ? "暂无历史数据"
                      : historyTab === "child"
                        ? "暂无子体销量数据"
                        : historyTab === "price"
                          ? "暂无价格数据"
                          : "暂无 Keepa 插件替代数据"}
                  </div>
                )}
                {!activeHistoryLoading && !activeHistoryError && (activeHistoryData?.length || 0) > 0 && (
                  <div className="relative">
                    {historyTab === "keepa" && (
                      <div className="absolute top-0 right-2 z-10 flex items-center gap-5">
                        {[
                          { key: "7d", label: "近7天" },
                          { key: "1m", label: "近1个月" },
                          { key: "3m", label: "近3个月" },
                          { key: "6m", label: "近6个月" },
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setHistoryKeepaRange(item.key as "7d" | "1m" | "3m" | "6m")}
                            className={`pb-1 text-[13px] leading-none font-semibold border-b-2 transition-colors ${historyKeepaRange === item.key
                              ? "text-[#F59E0B] border-[#F59E0B]"
                              : "text-gray-500 border-transparent hover:text-gray-700"
                              }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={historyChartRef} className="w-full h-[500px]" />
                    {historyTab === "keepa" && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleAiInsightAnalyzeClick}
                          disabled={aiInsightSubmitting || !!aiInsightJobId}
                          className="px-5 py-2.5 rounded-xl bg-[#08142D] text-white text-[14px] leading-none font-semibold hover:bg-[#0D1D3D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {aiInsightSubmitting || aiInsightJobId ? "分析提交中..." : "AI分析"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <TagManagerModal
          open={tagModalOpen && (tagModalMode === "product" || !!tagEditItem)}
          initialSelected={tagModalSelected}
          libraryTags={baseLibraryTags}
          customLibraryTags={customLibraryTags}
          setCustomLibraryTags={setCustomLibraryTags}
          hiddenLibraryTags={hiddenLibraryTagsState}
          setHiddenLibraryTags={setHiddenLibraryTagsState}
          onSave={saveTags}
          onClose={closeTagModal}
          saving={tagSaving}
          error={tagSaveError}
        />
        <TagManagerModal
          open={fieldTagModalOpen && !!activeFieldTag}
          title="管理标签"
          subtitle={
            activeFieldTag ? `为当前产品设置${fieldLabelMap[activeFieldTag] || "标签"}` : "为当前产品设置标签"
          }
          initialSelected={activeFieldTag ? parseTagList(productFormData[activeFieldTag]) : []}
          libraryTags={activeFieldTag ? fieldLibraryTags[activeFieldTag] || [] : []}
          customLibraryTags={activeFieldTag ? fieldCustomTags[activeFieldTag] || [] : []}
          setCustomLibraryTags={setActiveFieldCustomTags}
          hiddenLibraryTags={activeFieldTag ? fieldHiddenTags[activeFieldTag] || [] : []}
          setHiddenLibraryTags={setActiveFieldHiddenTags}
          onSave={(tags) => {
            if (!activeFieldTag) return;
            setProductFormData((prev) => ({
              ...prev,
              [activeFieldTag]: tags.join(","),
            }));
            closeFieldTagModal();
          }}
          onClose={closeFieldTagModal}
        />
        {productModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">编辑产品</h3>
                <button className="text-gray-400 hover:text-gray-600" onClick={closeProductModal}>
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Site</label>
                  <div className="relative">
                    <FormSelect
                      value={productBsrForm.site || "US"}
                      onChange={(e) => setProductBsrForm((prev) => ({ ...prev, site: e.target.value }))}
                      className="pr-10 appearance-none"
                    >
                      <option value="US">US</option>
                      <option value="CA">CA</option>
                      <option value="UK">UK</option>
                      <option value="DE">DE</option>
                    </FormSelect>
                    <CaretDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">品牌</label>
                  <div className="flex gap-3">
                    {["EZARC", "TOLESA"].map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setProductFormData((prev) => ({ ...prev, brand }))}
                        className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all border ${(
                          productFormData.brand === brand
                            ? "bg-gray-900 text-white border-gray-900 shadow-md scale-[1.02]"
                            : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
                        )}`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">SKU</label>
                  <FormInput
                    value={productFormData.sku || ""}
                    onChange={(e) => setProductFormData((prev) => ({ ...prev, sku: e.target.value }))}
                    placeholder="SKU"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ASIN</label>
                  <FormInput
                    value={productFormData.asin || ""}
                    onChange={(e) => setProductFormData((prev) => ({ ...prev, asin: e.target.value }))}
                    placeholder="ASIN"
                    disabled
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">产品名称</label>
                  <FormInput
                    value={productFormData.name || ""}
                    onChange={(e) => setProductFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="产品名称"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">状态</label>
                  <div className="flex gap-2">
                    {["在售", "观察中", "停售"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setProductFormData((prev) => ({ ...prev, status: s }))}
                        className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all border ${(
                          (productFormData.status || "在售") === s
                            ? "bg-gray-900 text-white border-gray-900 shadow-md scale-[1.02]"
                            : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
                        )}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">规格-长度</label>
                      <FormInput
                        size="sm"
                        value={productFormData.spec_length || ""}
                        onChange={(e) => setProductFormData((prev) => ({ ...prev, spec_length: e.target.value }))}
                        placeholder="6 inch"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">片数</label>
                      <FormInput
                        size="sm"
                        type="number"
                        value={productFormData.spec_quantity ?? ""}
                        onChange={(e) => setProductFormData((prev) => ({ ...prev, spec_quantity: e.target.value === "" ? undefined : Number(e.target.value) }))}
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">其他</label>
                      <FormInput
                        size="sm"
                        value={productFormData.spec_other || ""}
                        onChange={(e) => setProductFormData((prev) => ({ ...prev, spec_other: e.target.value }))}
                        placeholder="10/14 TPI"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">应用标签</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFieldTagModal("application_tags")}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                      >
                        管理标签
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TagPillList
                      value={productFormData.application_tags}
                      toneClass="bg-blue-100 text-blue-600"
                      stack
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">齿形标签</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFieldTagModal("tooth_pattern_tags")}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                      >
                        管理标签
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TagPillList
                      value={productFormData.tooth_pattern_tags}
                      toneClass="bg-purple-100 text-purple-600"
                      stack
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">材质标签</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFieldTagModal("material_tags")}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                      >
                        管理标签
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TagPillList
                      value={productFormData.material_tags}
                      toneClass="bg-green-100 text-green-600"
                      stack
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">定位标签</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFieldTagModal("position_tags")}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                      >
                        管理标签
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TagPillList
                      value={productFormData.position_tags}
                      toneClass="bg-yellow-100 text-yellow-600"
                      stack
                    />
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-900 mb-1">数据明细</h4>
                  <p className="text-xs text-gray-400">用于新增未在榜单的产品</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">BSR 标题</label>
                  <FormInput
                    value={productBsrForm.title}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="亚马逊标题"
                  />
                </div>
                <div className="md:col-span-2 flex flex-col md:flex-row gap-6 items-stretch">
                  <div className="md:w-1/2 shrink-0 flex flex-col">
                    <label className="block text-sm font-bold text-gray-700 mb-2">BSR 图片</label>
                    <div
                      className={`flex flex-1 flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 ${productBsrForm.image_url ? "p-2" : "p-4"}`}
                    >
                      {!productBsrForm.image_url && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <input
                            key={productBsrImageInputKey}
                            id="product-bsr-image-upload"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleProductBsrImageUpload(e.target.files?.[0])}
                            className="hidden"
                          />
                          <label
                            htmlFor="product-bsr-image-upload"
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black cursor-pointer transition-colors"
                          >
                            选择图片
                          </label>
                          <span className="text-xs text-gray-400">未选择图片</span>
                        </div>
                      )}
                      {productBsrImageError && (
                        <div className="text-xs text-red-500">{productBsrImageError}</div>
                      )}
                      <div className="flex-1 flex items-center justify-center min-h-[240px]">
                        {productBsrForm.image_url ? (
                          <div className="relative w-full h-full bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                            <button
                              type="button"
                              onClick={() => {
                                setProductBsrForm((prev) => ({ ...prev, image_url: "" }));
                                setProductBsrImageInputKey((prev) => prev + 1);
                                setProductBsrImageError(null);
                              }}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white text-sm font-bold flex items-center justify-center hover:bg-black"
                              aria-label="清除图片"
                            >
                              ×
                            </button>
                            <img
                              src={productBsrForm.image_url}
                              alt="BSR 预览"
                              className="w-full h-full object-contain block"
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 bg-white/50 w-full h-full rounded-xl border border-dashed border-gray-200 flex items-center justify-center">
                            请上传图片
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-between gap-7 h-full">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">父 ASIN</label>
                        <FormInput
                          value={productBsrForm.parent_asin}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, parent_asin: e.target.value }))}
                          placeholder="Parent ASIN"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">上架时间</label>
                        <AppDatePicker
                          value={productBsrForm.launch_date}
                          onChange={(val) =>
                            setProductBsrForm((prev) => ({
                              ...prev,
                              launch_date: val,
                            }))
                          }
                          placeholder="选择上架日期"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">价格</label>
                        <FormInput
                          type="number"
                          step="0.01"
                          value={productBsrForm.price}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, price: e.target.value }))}
                          placeholder="价格"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">原价</label>
                        <FormInput
                          type="number"
                          step="0.01"
                          value={productBsrForm.list_price}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, list_price: e.target.value }))}
                          placeholder="原价"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">评分</label>
                        <FormInput
                          type="number"
                          step="0.1"
                          value={productBsrForm.score}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, score: e.target.value }))}
                          placeholder="评分"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">评论数</label>
                        <FormInput
                          type="number"
                          value={productBsrForm.comment_count}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, comment_count: e.target.value }))}
                          placeholder="评论数"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">BSR 排名</label>
                        <FormInput
                          type="number"
                          value={productBsrForm.bsr_rank}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, bsr_rank: e.target.value }))}
                          placeholder="BSR 排名"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">大类排名</label>
                        <FormInput
                          type="number"
                          value={productBsrForm.category_rank}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, category_rank: e.target.value }))}
                          placeholder="大类排名"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">变体数</label>
                        <FormInput
                          type="number"
                          value={productBsrForm.variation_count}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, variation_count: e.target.value }))}
                          placeholder="变体数"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">综合转化率(%)</label>
                        <FormInput
                          type="number"
                          step="0.0001"
                          value={productBsrForm.conversion_rate}
                          onChange={(e) => setProductBsrForm((prev) => ({ ...prev, conversion_rate: e.target.value }))}
                          placeholder="0.1234"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 pt-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">详情页链接</label>
                  <FormInput
                    value={productBsrForm.product_url}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, product_url: e.target.value }))}
                    placeholder="产品详情页 URL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">7天自然流量得分</label>
                  <FormInput
                    type="number"
                    step="1"
                    value={productBsrForm.organic_traffic_count}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, organic_traffic_count: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">7天广告流量得分</label>
                  <FormInput
                    type="number"
                    step="1"
                    value={productBsrForm.ad_traffic_count}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, ad_traffic_count: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">自然搜索词</label>
                      <FormInput
                        type="number"
                        step="1"
                        value={productBsrForm.organic_search_terms}
                        onChange={(e) => setProductBsrForm((prev) => ({ ...prev, organic_search_terms: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">广告流量词</label>
                      <FormInput
                        type="number"
                        step="1"
                        value={productBsrForm.ad_search_terms}
                        onChange={(e) => setProductBsrForm((prev) => ({ ...prev, ad_search_terms: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">搜索推荐词</label>
                      <FormInput
                        type="number"
                        step="1"
                        value={productBsrForm.search_recommend_terms}
                        onChange={(e) => setProductBsrForm((prev) => ({ ...prev, search_recommend_terms: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">月销量</label>
                  <FormInput
                    type="number"
                    value={productBsrForm.sales_volume}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, sales_volume: e.target.value }))}
                    placeholder="月销量"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">月销售额($)</label>
                  <FormInput
                    type="number"
                    step="0.01"
                    value={productBsrForm.sales}
                    onChange={(e) => setProductBsrForm((prev) => ({ ...prev, sales: e.target.value }))}
                    placeholder="月销售额($)"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">自定义标签</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openProductTagModal}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                      >
                        管理标签
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <TagPillList
                      value={productBsrForm.tags}
                      toneClass="bg-blue-50 text-[#3B9DF8]"
                      stack
                    />
                  </div>
                </div>
              </div>

              {productModalError && (
                <div className="mt-4 text-sm text-red-500">{productModalError}</div>
              )}

              <div className="flex justify-end gap-3 mt-10">
                <button
                  className="px-8 py-3 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all"
                  onClick={closeProductModal}
                  disabled={productModalSaving}
                >
                  取消
                </button>
                <button
                  className="px-10 py-3 rounded-2xl text-sm font-bold text-white bg-gray-900 hover:bg-black active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
                  onClick={saveProductModal}
                  disabled={productModalSaving}
                >
                  {productModalSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    "保存"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {mappingModalOpen && mappingLeft && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 backdrop-blur-sm bg-black/40 overflow-hidden">
            <div className={`w-full ${selectedStrategy ? "max-w-7xl" : "max-w-5xl"} bg-white rounded-[2rem] shadow-2xl border border-gray-100 my-8 animate-in fade-in zoom-in duration-300 overflow-hidden`}>
              <div className="flex flex-col lg:flex-row h-full min-h-[600px] max-h-[90vh]">
                {/* Left Content Area */}
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar border-r border-gray-50">
                  <div className="mb-6">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-black text-gray-900">映射对比</h3>
                      <div className="hidden sm:flex items-center gap-3">
                        <span className="text-xs text-gray-900">产品</span>
                        <CustomSelect
                          className="w-80"
                          value={compareTargetAsin || mappingRightMeta?.asin || ""}
                          onChange={(val) => handleCompareSelect(val)}
                          options={compareOptions.map((opt) => ({
                            value: opt.asin,
                            label: opt.name,
                          }))}
                        />
                        <span className="text-xs text-gray-900 ml-1">ASIN</span>
                        <CustomSelect
                          className="w-48"
                          value={compareTargetAsin || mappingRightMeta?.asin || ""}
                          onChange={(val) => handleCompareSelect(val)}
                          options={compareOptions.map((opt) => ({
                            value: opt.asin,
                            label: opt.asin,
                          }))}
                        />
                        <button
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mappingLeft?.yida_asin
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                          onClick={handleCancelMapping}
                          disabled={!mappingLeft?.yida_asin || mappingActionLoading}
                        >
                          {mappingActionLoading ? "取消中..." : "取消映射"}
                        </button>
                        <button
                          onClick={closeMappingModal}
                          className="p-2 hover:bg-gray-200 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                        >
                          <X size={20} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {mappingError && (
                    <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-500 text-xs font-bold flex items-center gap-2">
                      <span className="text-lg">⚠️</span> {mappingError}
                    </div>
                  )}

                  {mappingLoading ? (
                    <div className="py-12 text-center text-gray-400">正在加载映射数据...</div>
                  ) : (
                    <div className="space-y-6">
                      {/* Headers */}
                      <div className={`grid grid-cols-1 ${selectedStrategy ? "xl:grid-cols-[1fr_auto_1fr]" : "lg:grid-cols-[1fr_auto_1fr]"} gap-6`}>
                        <div className="bg-slate-50 rounded-3xl p-4 border border-gray-100/50">
                          <div className="text-xs text-gray-400 mb-2">目标坑位竞品</div>
                          <div className="min-h-[54px]">
                            <div className="text-sm font-bold text-gray-900 line-clamp-2">{leftCompareItem?.title || "-"}</div>
                            <div className="text-xs text-gray-500 mt-1 font-mono">ASIN: {leftCompareItem?.asin || "-"}</div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-start p-4">
                          <div className="text-xs text-gray-400 mb-2">差值</div>
                          <div className="min-h-[54px]" />
                        </div>

                        <div className="bg-slate-50 rounded-3xl p-4 border border-gray-100/50">
                          <div className="text-xs text-gray-400 mb-2">自家产品</div>
                          <div className="min-h-[54px]">
                            <div className="text-sm font-bold text-gray-900 line-clamp-2">
                              {mappingRightMeta?.product || mappingRightMeta?.name || "-"}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 font-mono">
                              ASIN: {mappingRightMeta?.asin || "-"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Metric Rows */}
                      <div className="space-y-2">
                        {buildMetricRows(leftCompareItem, rightCompareItem).map((row) => (
                          <div
                            key={row.key}
                            className={`grid grid-cols-1 ${selectedStrategy ? "xl:grid-cols-[1fr_80px_1fr]" : "lg:grid-cols-[1fr_80px_1fr]"} gap-6 px-4`}
                          >
                            <div className="flex justify-between items-center h-7 text-xs text-gray-600 bg-slate-50/50 rounded-xl px-4">
                              <span className="whitespace-nowrap">{row.label}</span>
                              <span className="font-bold text-gray-900 whitespace-nowrap">{row.leftDisplay}</span>
                            </div>

                            <div className={`h-7 flex items-center justify-center font-bold text-xs ${row.diffClass}`}>
                              {row.diffText}
                            </div>

                            <div className="flex justify-between items-center h-7 text-xs text-gray-600 bg-slate-50/50 rounded-xl px-4">
                              <span className="font-bold text-gray-900 whitespace-nowrap">{row.rightDisplay}</span>
                              <span className="whitespace-nowrap text-right">{row.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategy Management List */}
                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                      <div>
                        <h4 className="text-lg font-black text-gray-900">策略管理</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isAdmin && (
                          <CustomSelect
                            value={strategyFilters.owner}
                            onChange={(val: string) => setStrategyFilters((prev) => ({ ...prev, owner: val }))}
                            options={strategyOwners}
                            labelPrefix="负责人："
                          />
                        )}
                        <CustomSelect
                          value={strategyFilters.brand}
                          onChange={(val: string) => setStrategyFilters((prev) => ({ ...prev, brand: val }))}
                          options={strategyBrands}
                          labelPrefix="品牌："
                        />
                        <CustomSelect
                          value={strategyFilters.priority}
                          onChange={(val: string) => setStrategyFilters((prev) => ({ ...prev, priority: val }))}
                          options={strategyPriorities}
                          labelPrefix="优先级："
                        />
                        <CustomSelect
                          value={strategyFilters.status}
                          onChange={(val: string) => setStrategyFilters((prev) => ({ ...prev, status: val }))}
                          options={strategyStatuses}
                          labelPrefix="状态："
                        />
                        <button
                          type="button"
                          onClick={() => setStrategyOpen(true)}
                          className="min-w-[96px] px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-br from-[#1C1C1E] to-[#2C2C2E] hover:shadow-lg hover:shadow-black/10 active:scale-95 transition-all shadow-sm"
                        >
                          新建策略
                        </button>
                      </div>
                    </div>

                    <div className="bg-gray-50/50 rounded-3xl border border-gray-100 overflow-x-auto custom-scrollbar-thin">
                      <div className="min-w-full">
                        <div
                          className={`hidden md:grid gap-2 px-6 py-3 text-[11px] font-bold text-gray-400 uppercase ${selectedStrategy ? "pr-8" : ""}`}
                          style={{ gridTemplateColumns: strategyGridTemplate }}
                        >
                          <span>策略标题</span>
                          <span>自家ASIN</span>
                          <span>品牌</span>
                          <span>负责人</span>
                          <span>优先级</span>
                          <span>计划复盘</span>
                          <span>状态</span>
                          <span className={`text-right ${selectedStrategy ? "pr-4" : ""}`}>操作</span>
                        </div>

                        <div className="space-y-2 py-2">
                          {strategyLoading ? (
                            <div className="px-6 py-10 text-center text-sm text-gray-400">正在加载策略任务...</div>
                          ) : strategyError ? (
                            <div className="px-6 py-10 text-center text-sm text-red-400">{strategyError}</div>
                          ) : filteredStrategyTasks.length === 0 ? (
                            <div className="px-6 py-10 text-center text-sm text-gray-400">暂无符合条件的策略任务</div>
                          ) : (
                            filteredStrategyTasks.map((task) => {
                              const tone = strategyStateTone[task.state] || "bg-gray-50";
                              const badge = strategyStateBadge[task.state] || "bg-gray-200 text-gray-600";
                              return (
                                <div
                                  key={task.id}
                                  className={`grid grid-cols-1 md:grid gap-2 px-6 py-4 text-xs text-gray-600 items-center rounded-2xl ${tone} ${selectedStrategy ? "pr-8" : ""}`}
                                  style={{ gridTemplateColumns: strategyGridTemplate }}
                                >
                                  <div>
                                    <div className="font-semibold text-gray-900">{task.title}</div>
                                    <div className="text-[11px] text-gray-400 mt-1">创建于 {task.created_at || "-"}</div>
                                  </div>
                                  <div className="font-mono text-[11px]">{task.yida_asin}</div>
                                  <div>{task.brand || "-"}</div>
                                  <div>{task.owner || "-"}</div>
                                  <div>{task.priority}</div>
                                  <div>{task.review_date || "-"}</div>
                                  <div>
                                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${badge}`}>
                                      {task.state}
                                    </span>
                                  </div>
                                  <div className={`text-right ${selectedStrategy ? "pr-4" : ""}`}>
                                    <button
                                      type="button"
                                      onClick={() => openStrategyDetail(task)}
                                      className="px-2 py-1 rounded-lg text-[#3B9DF8] font-bold text-[11px] hover:bg-blue-50 transition-colors"
                                    >
                                      编辑
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Detail Panel */}
                {selectedStrategy && (
                  <div className="w-full lg:w-[320px] xl:w-[400px] bg-gray-50/50 p-8 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 border-l border-gray-100">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h4 className="text-lg font-black text-gray-900">策略详情</h4>
                      </div>
                      <button
                        onClick={() => setSelectedStrategy(null)}
                        className="p-2 hover:bg-gray-200 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                      >
                        <X size={20} weight="bold" />
                      </button>
                    </div>

                    <div className="space-y-8">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">策略标题</label>
                        <FormInput
                          size="sm"
                          value={strategyEdit.title}
                          onChange={(e) => handleStrategyEditChange("title", e.target.value)}
                          className="bg-white text-sm font-semibold text-gray-900"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">创建于 {selectedStrategy.created_at}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-y-6 gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">自家ASIN</span>
                          <FormInput
                            size="sm"
                            value={strategyEdit.yida_asin}
                            disabled
                            className="bg-gray-100 text-[12px] font-mono text-gray-700"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">品牌</span>
                          <span className="text-[12px] font-bold text-gray-900">{selectedStrategy.brand || "-"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">负责人</span>
                          {isAdmin ? (
                            <CustomSelect
                              value={strategyEdit.owner_userid || ""}
                              onChange={(val: string) => handleStrategyEditOwnerSelect(val)}
                              options={strategyOwnerSelectOptions}
                              className="w-full"
                              innerClassName="bg-white border-gray-100 text-[12px] font-bold text-gray-900 focus:ring-4 focus:ring-blue-100 py-2"
                            />
                          ) : (
                            <FormInput
                              size="sm"
                              value={strategyEdit.owner || currentUserName || "-"}
                              disabled
                              className="bg-gray-100 text-[12px] font-semibold text-gray-700"
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">优先级</span>
                          <CustomSelect
                            value={strategyEdit.priority}
                            onChange={(val: string) => handleStrategyEditChange("priority", val)}
                            options={["高", "中", "低"]}
                            className="w-full"
                            innerClassName="bg-white border-gray-100 text-[12px] font-bold text-gray-900 focus:ring-4 focus:ring-blue-100 py-2"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">执行状态</span>
                          <CustomSelect
                            value={strategyEdit.state}
                            onChange={(val: string) => handleStrategyEditChange("state", val)}
                            options={["待开始", "进行中", "已完成", "搁置"]}
                            className="w-full"
                            innerClassName="bg-white border-gray-100 text-[12px] font-bold text-gray-900 focus:ring-4 focus:ring-blue-100 py-2"
                          />
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">计划复盘</span>
                          <AppDatePicker
                            value={strategyEdit.review_date}
                            onChange={(val) => handleStrategyEditChange("review_date", val)}
                            size="sm"
                            className="bg-white border border-gray-100 text-[12px] font-bold text-gray-900"
                          />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-200/50">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">详细方案说明</label>
                        <textarea
                          value={strategyEdit.detail}
                          onChange={(e) => handleStrategyEditChange("detail", e.target.value)}
                          className="w-full min-h-[180px] bg-white p-4 rounded-2xl border border-gray-100 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed shadow-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none"
                        />
                      </div>

                      <div className="pt-2 flex gap-3">
                        <button
                          onClick={handleUpdateStrategyDetail}
                          disabled={strategyEditSaving || !strategyEdit.title || !strategyEdit.detail}
                          className="flex-1 py-4 bg-[#1C1C1E] text-white text-xs font-bold rounded-2xl hover:bg-black transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          {strategyEditSaving ? "保存中..." : "确定"}
                        </button>
                        <button
                          onClick={handleDeleteStrategy}
                          className="flex-1 py-4 bg-red-50 text-red-500 text-xs font-bold rounded-2xl hover:bg-red-100 transition-all"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Custom Toast */}
        {toast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-600' :
              toast.type === 'info' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                'bg-white border-gray-100 text-green-600'
              }`}>
              {toast.type === 'error' ? <WarningCircle size={20} weight="fill" /> :
                toast.type === 'info' ? <Info size={20} weight="fill" /> :
                  <CheckCircle size={20} weight="fill" />}
              <span className="text-sm font-bold">{toast.message}</span>
              <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70 transition-opacity">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {confirmConfig && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm bg-black/20 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 animate-in zoom-in duration-200">
              <h3 className="text-lg font-black text-gray-900 mb-2">{confirmConfig.title}</h3>
              <p className="text-sm text-gray-500 mb-8 leading-relaxed">{confirmConfig.message}</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all"
                  onClick={() => setConfirmConfig(null)}
                >
                  取消
                </button>
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-black transition-all"
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(null);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Strategy Modal */}
        {strategyOpen && (
          <div className="fixed inset-0 z-[92] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in duration-200">
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#3B9DF8]">
                      <ChartLineUp size={22} weight="fill" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">制定打法策略</h4>
                      <p className="text-xs text-gray-400 mt-0.5">记录针对该竞品的作战计划</p>
                    </div>
                  </div>
                  <button
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                    onClick={() => setStrategyOpen(false)}
                  >
                    <span className="text-xl">✕</span>
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-900 ml-1">计划复盘日期</label>
                      <AppDatePicker
                        value={strategyFormData.review_date}
                        onChange={(val) => handleStrategyChange("review_date", val)}
                        size="lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-900 ml-1">负责人</label>
                      {isAdmin ? (
                        <CustomSelect
                          value={strategyFormData.owner_userid}
                          onChange={(val) => handleStrategyOwnerSelect(val)}
                          options={strategyOwnerSelectOptions}
                          className="w-full"
                          innerClassName="bg-gray-50 border-gray-100 text-sm font-semibold text-gray-700 py-3"
                        />
                      ) : (
                        <FormInput
                          size="lg"
                          type="text"
                          placeholder="选择团队成员"
                          value={currentUserName || strategyFormData.owner}
                          disabled
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-900 ml-1">优先级</label>
                      <div className="flex p-1 bg-gray-50 rounded-2xl border border-gray-100">
                        {["高", "中", "低"].map((p) => (
                          <button
                            key={p}
                            onClick={() => handleStrategyChange("priority", p)}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${strategyFormData.priority === p
                              ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5"
                              : "text-gray-400 hover:text-gray-600"
                              }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-900 ml-1">策略标题 <span className="text-red-500">*</span></label>
                    <FormInput
                      size="lg"
                      type="text"
                      placeholder="例如：通过价格优势拦截流量"
                      value={strategyFormData.title}
                      onChange={(e) => handleStrategyChange("title", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-900 ml-1">策略详情 <span className="text-red-500">*</span></label>
                    <textarea
                      placeholder="描述具体打法，如：调整广告出价、增加优惠券力度等..."
                      className="w-full px-5 py-4 rounded-3xl bg-gray-50 border border-gray-100 text-sm focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition-all min-h-[120px] resize-none"
                      value={strategyFormData.detail}
                      onChange={(e) => handleStrategyChange("detail", e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end pt-2 gap-3">
                    <button
                      type="button"
                      className="px-8 py-3 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all"
                      onClick={() => setStrategyOpen(false)}
                      disabled={strategySaving}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveStrategy}
                      disabled={strategySaving || !strategyFormData.title || !strategyFormData.detail}
                      className="px-10 py-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-br from-[#1C1C1E] to-[#2C2C2E] hover:shadow-xl hover:shadow-black/10 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
                    >
                      {strategySaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          正在保存...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={18} weight="fill" />
                          保存为待办
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type ImportUploadFieldProps = {
  title: string;
  file: File | null;
  isDragging: boolean;
  onDragStateChange: (value: boolean) => void;
  onFileChange: (file: File | null) => void;
  onClearError?: () => void;
};

function ImportUploadField({
  title,
  file,
  isDragging,
  onDragStateChange,
  onFileChange,
  onClearError,
}: ImportUploadFieldProps) {
  const fileName = file?.name || "";
  const fileSize = file?.size ? `${(file.size / 1024).toFixed(1)} KB` : "";

  const applyFile = (nextFile: File | null) => {
    onFileChange(nextFile);
    onClearError?.();
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${isDragging ? "border-[#3B9DF8] bg-blue-50/50" : "border-gray-200 bg-gray-50"}`}
        onDragOver={(e) => {
          e.preventDefault();
          onDragStateChange(true);
        }}
        onDragLeave={() => onDragStateChange(false)}
        onDrop={(e) => {
          e.preventDefault();
          onDragStateChange(false);
          const droppedFile = e.dataTransfer.files?.[0] || null;
          if (droppedFile) {
            applyFile(droppedFile);
          }
        }}
      >
        <div className="text-sm text-gray-600 font-semibold mb-2">拖拽文件到此处</div>
        <div className="text-xs text-gray-400 mb-4">或点击选择文件</div>
        <label className="inline-flex items-center px-4 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition">
          选择文件
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              applyFile(e.target.files?.[0] || null);
            }}
          />
        </label>
      </div>
      {file && (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100">
          <div>
            <div className="text-sm font-semibold text-gray-900">{fileName}</div>
            <div className="text-xs text-gray-400">{fileSize}</div>
          </div>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-900"
            onClick={() => applyFile(null)}
          >
            移除
          </button>
        </div>
      )}
    </div>
  );
}

type LibraryHoverPopoverProps = {
  hover: {
    rect: DOMRect;
    payload: LibraryHoverPayload;
  } | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function LibraryHoverPopover({
  hover,
  onMouseEnter,
  onMouseLeave,
}: LibraryHoverPopoverProps) {
  if (!hover) return null;

  return (
    <div
      className="fixed z-[70] pointer-events-auto"
      style={{
        top: Math.max(16, hover.rect.top),
        left: Math.max(16, hover.rect.left - 280 - 16),
        width: 280,
        maxHeight: "calc(100vh - 32px)",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-xl p-3 text-[11px] text-gray-500 space-y-2 h-full overflow-auto custom-scrollbar">
        <div className="flex items-center justify-between gap-2">
          <span>BSR排名</span>
          <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">{hover.payload.rankText}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>大类排名</span>
          <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">{hover.payload.categoryRankText}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>综合转化率</span>
          <span className="inline-flex items-center">{hover.payload.conversionText}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>7天自然流量占比</span>
          <span className="bg-[#3B9DF8]/10 text-[#3B9DF8] font-bold px-2 py-0.5 rounded-lg">
            {hover.payload.organicText}
            {hover.payload.organicShareText}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>7天广告流量占比</span>
          <span className="bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-lg">
            {hover.payload.adText}
            {hover.payload.adShareText}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
          <div className="flex items-center justify-between">
            <span>全部流量词</span>
            <span className="text-gray-900 font-bold">{formatNumberValue(hover.payload.totalTerms)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>自然搜索词</span>
            <span className="text-gray-900 font-bold">{formatNumberValue(hover.payload.organicTerms)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>广告流量词</span>
            <span className="text-gray-900 font-bold">{formatNumberValue(hover.payload.adTerms)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>搜索推荐词</span>
            <span className="text-gray-900 font-bold">{formatNumberValue(hover.payload.recommendTerms)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>长度</span>
            <span className="text-gray-900 font-bold">{hover.payload.specLengthText}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>片数</span>
            <span className="text-gray-900 font-bold">{hover.payload.specQuantityText}</span>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-2 space-y-2">
          {[
            {
              key: "app",
              label: "应用",
              tags: hover.payload.applicationTags,
              chipClass: "text-[9px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded-md font-semibold",
            },
            {
              key: "tooth",
              label: "齿形",
              tags: hover.payload.toothTags,
              chipClass: "text-[9px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md font-semibold",
            },
            {
              key: "material",
              label: "材质",
              tags: hover.payload.materialTags,
              chipClass: "text-[9px] px-2 py-0.5 bg-green-100 text-green-600 rounded-md font-semibold",
            },
            {
              key: "position",
              label: "定位",
              tags: hover.payload.positionTags,
              chipClass: "text-[9px] px-2 py-0.5 bg-yellow-100 text-yellow-600 rounded-md font-semibold",
            },
            {
              key: "custom",
              label: "自定义标签",
              tags: hover.payload.customTags,
              chipClass: "text-[9px] px-2 py-0.5 bg-blue-50 text-[#3B9DF8] rounded-md font-semibold",
            },
          ].map((group) => (
            <div key={group.key} className="space-y-1">
              <span className="text-[10px] text-gray-400 font-bold">{group.label}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {group.tags?.length > 0 ? (
                  group.tags.map((tag: string) => (
                    <span key={`${group.key}-${tag}`} className={group.chipClass}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-[9px] text-gray-300">无</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type LibraryProductCardProps = {
  product: ProductLibraryItem;
  siteFilter: string;
  selected: boolean;
  monthlySalesTrend?: MonthlyTrendPoint[];
  activeSparklineIndex: number | null;
  onSparklineHoverChange: (asin: string, index: number | null) => void;
  onSelect: (item: ProductLibraryItem) => void;
  onEdit: (item: ProductLibraryItem) => void;
  onRequestMonthlySalesTrend: (target: Pick<BsrItem, "asin" | "site">) => void;
  onHoverShow: (rect: DOMRect, payload: LibraryHoverPayload) => void;
  onHoverHide: (asin: string) => void;
};

const LibraryProductCard = memo(function LibraryProductCard({
  product,
  siteFilter,
  selected,
  monthlySalesTrend,
  activeSparklineIndex,
  onSparklineHoverChange,
  onSelect,
  onEdit,
  onRequestMonthlySalesTrend,
  onHoverShow,
  onHoverHide,
}: LibraryProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const bsr = useMemo(() => {
    if (product?.bsr && typeof product.bsr === "object") {
      return product.bsr as Partial<BsrItem>;
    }
    return {} as Partial<BsrItem>;
  }, [product]);

  const displaySite = String(product.site || siteFilter || "US").toUpperCase();
  const displayStatus = String(product.status || "在售");
  const displayTitle = String(product.product || product.name || bsr?.title || product.asin || "-");
  const displaySku = String(product.sku || "-");
  const displayBrand = String(product.brand || bsr?.brand || "-");
  const displayAsin = String(product.asin || "-");
  const displayParentAsin = String(bsr?.parent_asin || "-");
  const imageUrl = String(bsr?.image_url || "");
  const ratingValueRaw = Number(bsr?.rating ?? bsr?.score);
  const ratingValue = Number.isFinite(ratingValueRaw) ? Math.max(0, Math.min(5, ratingValueRaw)) : 0;
  const reviewCount = bsr?.reviews ?? bsr?.comment_count;

  const hoverPayload = useMemo<LibraryHoverPayload>(() => {
    const organicTerms = toCountValue(bsr?.organic_search_terms);
    const adTerms = toCountValue(bsr?.ad_search_terms);
    const recommendTerms = toCountValue(bsr?.search_recommend_terms);
    const rawSpecQuantity = product?.spec_quantity;
    const specQuantityText =
      rawSpecQuantity === null || rawSpecQuantity === undefined || rawSpecQuantity === ""
        ? "-"
        : String(rawSpecQuantity);
    return {
      item: product,
      rankText: `#${formatTextValue(bsr?.bsr_rank ?? bsr?.rank)}`,
      categoryRankText: `#${formatNumberValue(bsr?.category_rank)}`,
      conversionText: <ConversionRateBadge value={bsr?.conversion_rate} period={bsr?.conversion_rate_period} />,
      organicText: formatNumberValue(bsr?.organic_traffic_count),
      adText: formatNumberValue(bsr?.ad_traffic_count),
      organicShareText: formatTrafficShareValue(bsr?.organic_traffic_count, bsr?.ad_traffic_count, "organic"),
      adShareText: formatTrafficShareValue(bsr?.organic_traffic_count, bsr?.ad_traffic_count, "ad"),
      totalTerms: organicTerms + adTerms + recommendTerms,
      organicTerms,
      adTerms,
      recommendTerms,
      specLengthText: formatTextValue(product?.spec_length),
      specQuantityText,
      applicationTags: parseTagList(product?.application_tags),
      toothTags: parseTagList(product?.tooth_pattern_tags),
      materialTags: parseTagList(product?.material_tags),
      positionTags: parseTagList(product?.position_tags_raw || product?.position_tags),
      customTags: parseTagList(product?.tags),
    };
  }, [bsr, product]);

  const salesSparklinePoints = useMemo(() => {
    return buildSalesSparklinePoints({
      monthlySalesTrend,
      fallback: {
        month: bsr?.createtime,
        salesVolume: bsr?.sales_volume,
        salesAmount: bsr?.sales,
      },
      limit: 12,
    }) as MonthlyTrendPoint[];
  }, [monthlySalesTrend, bsr?.sales_volume, bsr?.sales, bsr?.createtime]);

  const sparklineGeometry = useMemo(() => {
    return buildSparklineGeometry(salesSparklinePoints, 168, 38);
  }, [salesSparklinePoints]);

  const sparklineAreaId = useMemo(() => {
    const asinPart = String(product?.asin || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
    const sitePart = String(product?.site || siteFilter || "US").replace(/[^a-zA-Z0-9_-]/g, "");
    return `library-sparkline-area-${sitePart}-${asinPart}`;
  }, [product?.asin, product?.site, siteFilter]);

  const hoveredSparklinePoint = useMemo(() => {
    if (activeSparklineIndex === null) return null;
    if (activeSparklineIndex < 0 || activeSparklineIndex >= salesSparklinePoints.length) return null;
    return salesSparklinePoints[activeSparklineIndex];
  }, [activeSparklineIndex, salesSparklinePoints]);

  const statusClass = statusColor[displayStatus] || "bg-gray-100 text-gray-600";

  const handleHoverShow = (target: HTMLElement) => {
    onHoverShow(target.getBoundingClientRect(), hoverPayload);
  };

  const handleSparklineRequest = () => {
    onRequestMonthlySalesTrend({ asin: product.asin, site: displaySite });
  };

  return (
    <div
      className={`rounded-3xl border p-4 bg-[#F8FAFC] transition ${selected ? "border-[#3B9DF8] ring-2 ring-[#3B9DF8]/20" : "border-gray-100 hover:border-gray-200"}`}
      onMouseEnter={(e) => handleHoverShow(e.currentTarget)}
      onMouseLeave={() => onHoverHide(product.asin)}
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(product);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-[52px] h-[52px] rounded-2xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={displayTitle}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="text-xl opacity-70">🪚</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[16px] leading-tight font-black text-gray-900 truncate">{displayTitle}</h4>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${statusClass}`}>
              {displayStatus}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="font-black text-gray-900">{formatMoneyValue(bsr?.price)}</span>
            <span className="text-[#3B9DF8]">
              {"★★★★★".slice(0, Math.round(ratingValue))}
              <span className="text-gray-200">{"★★★★★".slice(Math.round(ratingValue))}</span>
            </span>
            <span className="font-black text-gray-700">{formatTextValue(bsr?.rating ?? bsr?.score)}</span>
            <span className="text-gray-400">({formatNumberValue(reviewCount)})</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div className="text-gray-400">
          ASIN: <span className="text-gray-800 font-black">{displayAsin}</span>
        </div>
        <div className="text-gray-400">
          父ASIN: <span className="text-gray-800 font-black">{displayParentAsin}</span>
        </div>
        <div className="text-gray-400">
          品牌: <span className="text-gray-800 font-black">{displayBrand}</span>
        </div>
        <div className="text-gray-400">
          SKU: <span className="text-gray-800 font-black">{displaySku}</span>
        </div>
        <div className="text-gray-400">
          变体数: <span className="text-gray-900 font-black">{formatNumberValue(bsr?.variation_count)}</span>
        </div>
        <div />
        <div className="text-gray-400">
          月销量: <span className="text-gray-900 font-black">{formatNumberValue(bsr?.sales_volume)}</span>
        </div>
        <div className="text-gray-400">
          月销售额($): <span className="text-gray-900 font-black">{formatSalesMoneyValue(bsr?.sales)}</span>
        </div>
      </div>

      <button
        type="button"
        className="relative mt-2 w-full h-9 text-left"
        onMouseEnter={handleSparklineRequest}
        onFocus={handleSparklineRequest}
        onTouchStart={handleSparklineRequest}
        onClick={(e) => {
          e.stopPropagation();
          handleSparklineRequest();
        }}
      >
        {hoveredSparklinePoint && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-[#2A2A2A]/95 text-white rounded-md px-3 py-2 min-w-[170px] shadow-xl z-20 pointer-events-none">
            <div className="text-xs font-semibold mb-1">{formatMonthLabelValue(hoveredSparklinePoint.month)}</div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span>当月销量</span>
              </span>
              <span>{formatNumberValue(hoveredSparklinePoint.salesVolume)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#60A5FA]" />
                <span>月销售额</span>
              </span>
              <span>{formatSalesMoneyValue(hoveredSparklinePoint.salesAmount)}</span>
            </div>
          </div>
        )}
        {sparklineGeometry ? (
          <svg
            viewBox={`0 0 ${sparklineGeometry.width} ${sparklineGeometry.height}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              if (!sparklineGeometry || sparklineGeometry.points.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relativeX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * sparklineGeometry.width;
              const nearestIndex = findNearestSparklineIndex(sparklineGeometry.points, relativeX);
              onSparklineHoverChange(product.asin, nearestIndex);
            }}
            onMouseLeave={() => onSparklineHoverChange(product.asin, null)}
          >
            <defs>
              <linearGradient id={sparklineAreaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FB923C" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#FB923C" stopOpacity="0.08" />
              </linearGradient>
            </defs>
            <polygon points={sparklineGeometry.area} fill={`url(#${sparklineAreaId})`} />
            <polyline
              points={sparklineGeometry.polyline}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {activeSparklineIndex !== null &&
              sparklineGeometry.points[activeSparklineIndex] && (
                <circle
                  cx={sparklineGeometry.points[activeSparklineIndex][0]}
                  cy={sparklineGeometry.points[activeSparklineIndex][1]}
                  r="2.3"
                  fill="#F59E0B"
                  stroke="#fff"
                  strokeWidth="1.2"
                />
              )}
          </svg>
        ) : (
          <div className="h-full flex items-center text-[10px] text-gray-400">暂无历史数据</div>
        )}
      </button>

      <button
        type="button"
        className="mt-2 h-10 w-full rounded-2xl bg-[#0F1E3A] text-white font-black text-[15px] hover:bg-[#0A162D] transition"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(product);
        }}
      >
        编辑
      </button>
    </div>
  );
}, (prev, next) => (
  prev.product === next.product &&
  prev.siteFilter === next.siteFilter &&
  prev.selected === next.selected &&
  prev.monthlySalesTrend === next.monthlySalesTrend &&
  prev.activeSparklineIndex === next.activeSparklineIndex &&
  prev.onSparklineHoverChange === next.onSparklineHoverChange &&
  prev.onSelect === next.onSelect &&
  prev.onEdit === next.onEdit &&
  prev.onRequestMonthlySalesTrend === next.onRequestMonthlySalesTrend &&
  prev.onHoverShow === next.onHoverShow &&
  prev.onHoverHide === next.onHoverHide
));

interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

function CustomSelect({
  value,
  onChange,
  options,
  labelPrefix,
  className = "",
  innerClassName = "",
}: {
  value: string;
  onChange: (val: string) => void;
  options: (string | SelectOption)[];
  labelPrefix?: string;
  className?: string;
  innerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 hover:bg-white hover:border-gray-200 transition-all w-full ${innerClassName}`}
      >
        <span className="truncate" title={selectedOption?.label || value}>
          {labelPrefix}{selectedOption?.label || value}
        </span>
        <CaretDown size={12} className={`text-gray-400 transition-transform shrink-0 ml-1 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-0 z-[70] p-1.5 bg-white rounded-xl shadow-2xl border border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200 w-full overflow-hidden">
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {normalizedOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all mb-0.5 last:mb-0 ${value === opt.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <div className="text-xs font-bold truncate" title={opt.label}>
                  {opt.label}
                </div>
                {opt.sublabel && (
                  <div className={`text-[10px] truncate ${value === opt.value ? "text-gray-400" : "text-gray-400"}`}>
                    {opt.sublabel}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({
  item,
  prevItem,
  onTag,
  onMap,
  onCompare,
  onHistory,
  monthlySalesTrend,
  onRequestMonthlySalesTrend,
}: {
  item: BsrItem;
  onTag?: (item: BsrItem) => void;
  onMap?: (item: BsrItem) => void;
  onCompare?: (item: BsrItem) => void;
  onHistory?: (item: BsrItem, tab?: "month" | "child" | "price" | "keepa") => void;
  monthlySalesTrend?: MonthlyTrendPoint[];
  onRequestMonthlySalesTrend?: (item: BsrItem) => void;
  prevItem?: BsrItem;
}) {
  const [imageError, setImageError] = useState(false);
  const [sparklineHoverIndex, setSparklineHoverIndex] = useState<number | null>(null);

  const salesSparklinePoints = useMemo(() => {
    return buildSalesSparklinePoints({
      monthlySalesTrend,
      fallback: {
        month: item?.createtime,
        salesVolume: item?.sales_volume,
        salesAmount: item?.sales,
      },
      limit: 12,
    }) as MonthlyTrendPoint[];
  }, [monthlySalesTrend, item?.sales_volume, item?.sales, item?.createtime]);

  const sparklineGeometry = useMemo(() => {
    return buildSparklineGeometry(salesSparklinePoints, 120, 34);
  }, [salesSparklinePoints]);

  const sparklineAreaId = useMemo(() => {
    const asinPart = String(item?.asin || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
    const sitePart = String(item?.site || "US").replace(/[^a-zA-Z0-9_-]/g, "");
    return `sparkline-area-${sitePart}-${asinPart}`;
  }, [item?.asin, item?.site]);

  const hoveredSparklinePoint = useMemo(() => {
    if (sparklineHoverIndex === null) return null;
    if (sparklineHoverIndex < 0 || sparklineHoverIndex >= salesSparklinePoints.length) return null;
    return salesSparklinePoints[sparklineHoverIndex];
  }, [sparklineHoverIndex, salesSparklinePoints]);

  const organicTerms = toCountValue(item.organic_search_terms);
  const adTerms = toCountValue(item.ad_search_terms);
  const recommendTerms = toCountValue(item.search_recommend_terms);
  const totalTerms = organicTerms + adTerms + recommendTerms;
  const trafficShareText = formatTrafficShareValue(item.organic_traffic_count, item.ad_traffic_count, "organic");
  const adTrafficShareText = formatTrafficShareValue(item.organic_traffic_count, item.ad_traffic_count, "ad");

  const renderTags = (value: unknown) => (
    <TagPillList
      value={value}
      toneClass="bg-blue-50 text-[#3B9DF8] border border-blue-100/50"
      emptyText="-"
    />
  );

  const isNewProduct = (() => {
    if (!item?.launch_date) return false;
    const parsed = new Date(item.launch_date);
    if (Number.isNaN(parsed.getTime())) return false;
    const diffMs = Date.now() - parsed.getTime();
    if (diffMs < 0) return false;
    return diffMs <= 180 * 24 * 60 * 60 * 1000;
  })();

  const isDelta = (() => {
    if (!prevItem) return false;
    const currentSales = Number(item?.sales_volume);
    const prevSales = Number(prevItem?.sales_volume);
    const hasSalesGrowth =
      Number.isFinite(currentSales) &&
      Number.isFinite(prevSales) &&
      (prevSales > 0 && (currentSales - prevSales) / prevSales > 0.2);

    const currentRank = Number(item?.bsr_rank ?? item?.rank);
    const prevRank = Number(prevItem?.bsr_rank ?? prevItem?.rank);
    const hasRankJump =
      Number.isFinite(currentRank) &&
      Number.isFinite(prevRank) &&
      Math.abs(currentRank - prevRank) >= 10;

    return hasSalesGrowth || hasRankJump;
  })();

  return (
    <div
      className={`rounded-3xl shadow-sm p-5 border relative flex flex-col h-full group overflow-visible card-hover-lift hover:z-30 ${isDelta ? "bg-red-50 border-red-300" : isNewProduct ? "bg-[#F6F8FF] border-[#3B9DF8]/40" : "bg-white border-gray-100"
        }`}
    >
      {/* Top Section */}
      <div className="mb-4 min-h-[20px]" />
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="text-xs font-bold text-white bg-[#1C1C1E] px-2 py-1 rounded-lg">
          #{formatTextValue(item.bsr_rank ?? item.rank)}
        </span>
        {isDelta && (
          <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-lg">
            增量
          </span>
        )}
        {isNewProduct && (
          <span className="text-xs font-bold text-white bg-[#3B9DF8] px-2 py-1 rounded-lg">
            新品
          </span>
        )}
      </div>

      {/* Image Container */}
      <div className="w-full h-40 bg-gray-50 rounded-2xl mb-5 flex items-center justify-center relative group-hover:bg-gray-100 transition-colors overflow-hidden">
        {item.image_url && !imageError ? (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="text-5xl filter drop-shadow-sm opacity-80">
            🪚
          </div>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-[15px] font-semibold text-gray-900 mb-3 line-clamp-2 leading-snug h-[42px]"
        title={item.title}
      >
        {item.product_url ? (
          <a
            className="cursor-pointer hover:text-[#3B9DF8] transition-colors"
            href={item.product_url}
            target="_blank"
            rel="noreferrer"
          >
            {item.title}
          </a>
        ) : (
          <span className="cursor-default">{item.title}</span>
        )}
      </h3>

      {/* Price */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-900">{formatTextValue(item.price)}</span>
        <span className="text-[11px] text-gray-400 line-through">{formatTextValue(item.list_price)}</span>
      </div>

      {/* Rating & reviews */}
      <div className="flex items-center gap-2 mb-4 mt-1">
        <div className="flex text-[#3B9DF8] text-[14px]">
          {"★★★★★".slice(0, Math.round(item.rating))}
          <span className="text-gray-200">{"★★★★★".slice(Math.round(item.rating))}</span>
        </div>
        <span className="text-xs font-bold text-gray-900">{formatTextValue(item.rating)}</span>
        <span className="text-xs text-gray-400">({formatNumberValue(item.reviews)})</span>
      </div>
      <div className="flex flex-col gap-1 mb-5 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">品牌:</span>
          <span className="text-gray-900 font-bold">{formatTextValue(item.brand)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">ASIN:</span>
          <span className="text-gray-900 font-bold">{formatTextValue(item.asin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">父ASIN:</span>
          <span className="text-gray-900 font-bold">{formatTextValue(item.parent_asin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">变体数:</span>
          <button
            type="button"
            onClick={() => onHistory?.(item, "child")}
            className="text-[#3B9DF8] font-bold underline decoration-dashed underline-offset-2 decoration-[#3B9DF8] hover:text-[#1D7FE0] hover:decoration-[#1D7FE0] transition-colors"
            title="查看子体销量"
          >
            {formatNumberValue(item.variation_count)}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">月销量:</span>
          <button
            type="button"
            onClick={() => onHistory?.(item, "month")}
            className="text-[#3B9DF8] font-bold underline decoration-dashed underline-offset-2 decoration-[#3B9DF8] hover:text-[#1D7FE0] hover:decoration-[#1D7FE0] transition-colors"
            title="查看历史销量"
          >
            {formatNumberValue(item.sales_volume)}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-semibold">月销售额:</span>
          <button
            type="button"
            onClick={() => onHistory?.(item, "month")}
            className="text-[#3B9DF8] font-bold underline decoration-dashed underline-offset-2 decoration-[#3B9DF8] hover:text-[#1D7FE0] hover:decoration-[#1D7FE0] transition-colors"
            title="查看历史销量"
          >
            {formatSalesMoneyValue(item.sales)}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onHistory?.(item, "month")}
          onMouseEnter={() => onRequestMonthlySalesTrend?.(item)}
          onFocus={() => onRequestMonthlySalesTrend?.(item)}
          onTouchStart={() => onRequestMonthlySalesTrend?.(item)}
          className="relative mt-0.5 w-[132px] h-8 text-left"
          title="查看历史月销量"
          aria-label="查看历史月销量趋势"
        >
          {hoveredSparklinePoint && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-[#2A2A2A]/95 text-white rounded-md px-3 py-2 min-w-[170px] shadow-xl z-20 pointer-events-none">
              <div className="text-xs font-semibold mb-1">{formatMonthLabelValue(hoveredSparklinePoint.month)}</div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  <span>当月销量</span>
                </span>
                <span>{formatNumberValue(hoveredSparklinePoint.salesVolume)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] mt-1">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#60A5FA]" />
                  <span>月销售额</span>
                </span>
                <span>{formatSalesMoneyValue(hoveredSparklinePoint.salesAmount)}</span>
              </div>
            </div>
          )}
          {sparklineGeometry ? (
            <svg
              viewBox={`0 0 ${sparklineGeometry.width} ${sparklineGeometry.height}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
              onMouseMove={(e) => {
                if (!sparklineGeometry || sparklineGeometry.points.length === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * sparklineGeometry.width;
                const nearestIndex = findNearestSparklineIndex(sparklineGeometry.points, relativeX);
                setSparklineHoverIndex(nearestIndex);
              }}
              onMouseLeave={() => setSparklineHoverIndex(null)}
            >
              <defs>
                <linearGradient id={sparklineAreaId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#FB923C" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              <polygon points={sparklineGeometry.area} fill={`url(#${sparklineAreaId})`} />
              <polyline
                points={sparklineGeometry.polyline}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {sparklineHoverIndex !== null &&
                sparklineGeometry.points[sparklineHoverIndex] && (
                  <circle
                    cx={sparklineGeometry.points[sparklineHoverIndex][0]}
                    cy={sparklineGeometry.points[sparklineHoverIndex][1]}
                    r="2.2"
                    fill="#F59E0B"
                    stroke="#fff"
                    strokeWidth="1.2"
                  />
                )}
            </svg>
          ) : (
            <div className="h-full flex items-center text-[10px] text-gray-400">暂无历史数据</div>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <a
            href={`https://www.sif.com/search?asin=${encodeURIComponent(item.asin || "")}&type=1&country=${encodeURIComponent(item.site || "US")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 text-[10px] font-bold hover:bg-[#F59E0B]/20 transition"
          >
            流量结构分析
          </a>
          <a
            href={`https://www.sif.com/reverse?country=${encodeURIComponent(item.site || "US")}&asin=${encodeURIComponent(item.asin || "")}&piece=latelyDay&date=7`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#3B9DF8]/10 text-[#3B9DF8] border border-[#3B9DF8]/20 text-[10px] font-bold hover:bg-[#3B9DF8]/20 transition"
          >
            反查关键词
          </a>
        </div>
      </div>

      {/* Hover Details */}
      <div className="absolute left-full top-0 bottom-0 ml-4 z-40 w-[260px] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 hover:opacity-100 hover:translate-y-0 transition pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto">
        <div className="bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-xl p-3 text-[11px] text-gray-500 space-y-2 h-full overflow-auto">
          <div className="flex items-center justify-between gap-2">
            <span>BSR排名</span>
            <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">#{formatTextValue(item.bsr_rank ?? item.rank)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>大类排名</span>
            <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">#{formatNumberValue(item.category_rank)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>综合转化率</span>
            <span className="inline-flex items-center">
              <ConversionRateBadge value={item.conversion_rate} period={item.conversion_rate_period} />
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>7天自然流量占比</span>
            <span className="bg-[#3B9DF8]/10 text-[#3B9DF8] font-bold px-2 py-0.5 rounded-lg">
              {formatNumberValue(item.organic_traffic_count)}
              {trafficShareText}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>7天广告流量占比</span>
            <span className="bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-lg">
              {formatNumberValue(item.ad_traffic_count)}
              {adTrafficShareText}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span>全部流量词</span>
              <span className="text-gray-900 font-bold">{formatNumberValue(totalTerms)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>自然搜索词</span>
              <span className="text-gray-900 font-bold">{formatNumberValue(organicTerms)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>广告流量词</span>
              <span className="text-gray-900 font-bold">{formatNumberValue(adTerms)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>搜索推荐词</span>
              <span className="text-gray-900 font-bold">{formatNumberValue(recommendTerms)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span>自定义标签</span>
            <div className="flex justify-start min-h-[1.5rem] w-full">
              {renderTags(item.tags)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span>已映射ASIN</span>
            <div className="flex flex-wrap gap-1.5">
              {splitAsins(item.yida_asin).length > 0 ? (
                splitAsins(item.yida_asin).map((asin, idx) => (
                  <span
                    key={`${asin}-${idx}`}
                    className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded-md text-[10px] font-mono font-bold"
                  >
                    {asin}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-[10px]">-</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>上架时间</span>
            <span className="text-gray-900 font-bold">{formatTextValue(item.launch_date)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2 mt-auto pt-4">
        <button
          className="py-2.5 text-[11px] font-bold rounded-xl transition-colors shadow-sm bg-[#1C1C1E] text-white hover:bg-black"
          onClick={() => onMap?.(item)}
        >
          映射
        </button>
        <button
          className="py-2.5 bg-[#1C1C1E] text-white text-[11px] font-bold rounded-xl hover:bg-black transition-colors"
          onClick={() => onCompare?.(item)}
        >
          对比
        </button>
        <button
          className="py-2.5 bg-[#1C1C1E] text-white text-[11px] font-bold rounded-xl hover:bg-black transition-colors"
          onClick={() => onTag?.(item)}
        >
          标签
        </button>
      </div>
    </div>
  );
}
