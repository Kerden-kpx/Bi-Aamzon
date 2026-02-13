import {
  CaretDown,
  MagnifyingGlass,
  SidebarSimple,
  Star,
  Tag,
  CornersOut,
} from "@phosphor-icons/react";
import axios from "axios";
import { useMemo, useState, useEffect, useRef, useCallback, type SetStateAction } from "react";

import { AppDatePicker } from "../components/AppDatePicker";
import { ConversionRateBadge } from "../components/ConversionRateBadge";
import { FormInput, FormSelect } from "../components/FormControls";
import { TagManagerModal } from "../components/TagManagerModal";
import { TagGroup, TagPillList, parseTagList } from "../components/TagSystem";
import { PRODUCT_STATUS_COLOR } from "../constants/productStatus";
import {
  formatMoney,
  formatNumber,
  formatSalesMoney,
  formatText,
  formatTrafficShare,
  toCount,
} from "../utils/valueFormat";

// API 配置
const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/yida-products`;

type Product = {
  asin: string;
  site?: string;
  sku: string;
  brand: string;
  name: string;
  product?: string;
  application_tags?: string;
  tooth_pattern_tags?: string;
  material_tags?: string;
  spec_length?: string;
  spec_quantity?: number;
  spec_other?: string;
  position_tags?: string;
  position_tags_raw?: string;
  status: string; // "在售" | "停售" | "观察中"
  created_at?: string;
  updated_at?: string;
  bsr?: ProductBsr;
};

type ProductBsr = {
    site?: string;
    parent_asin?: string;
    brand?: string;
    title?: string;
    image_url?: string;
    product_url?: string;
    price?: string | number;
    list_price?: string | number;
    score?: number | string;
    rating?: number | string;
    comment_count?: number | string;
    reviews?: number | string;
    bsr_rank?: number | string;
    rank?: number | string;
    category_rank?: number | string;
    variation_count?: number | string;
    launch_date?: string;
    conversion_rate?: number | string;
    conversion_rate_period?: string;
    organic_traffic_count?: number | string;
    ad_traffic_count?: number | string;
    organic_search_terms?: number | string;
    ad_search_terms?: number | string;
    search_recommend_terms?: number | string;
    sales_volume?: number | string;
    sales?: number | string;
    tags?: string[] | string;
    type?: string | number;
    createtime?: string;
    [key: string]: unknown;
};

type ProductFieldTagKey = "application_tags" | "tooth_pattern_tags" | "material_tags" | "position_tags";
type ProductFormData = Partial<Product> & { tagsStr?: string };
type ProductApiItem = Partial<Product> & {
  bsr?: Partial<ProductBsr> | null;
  position_tags?: string | string[] | null;
  position_tags_raw?: string | null;
  [key: string]: unknown;
};

const normalizeTextInput = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const normalizePercentInput = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  const percent = num > 1 ? num : num * 100;
  return String(Number.isInteger(percent) ? percent : Number(percent.toFixed(2)));
};

const normalizeMoneyInput = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[^0-9.]/g, "");
};

const toNumberOrNull = (value: unknown, integer = false) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = integer ? Number.parseInt(String(value), 10) : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const statusOptions = ["All", "Active", "Watch", "Paused"] as const;
type StatusFilter = (typeof statusOptions)[number];
const siteOptions = ["US", "CA", "UK", "DE"] as const;

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

export function ProductBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedSites, setSelectedSites] = useState<string[]>([...siteOptions]);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef<HTMLDivElement | null>(null);
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  // 产品管理弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [bsrForm, setBsrForm] = useState(createEmptyBsrForm());
  const [bsrLookupLoading, setBsrLookupLoading] = useState(false);
  const [bsrLookupError, setBsrLookupError] = useState<string | null>(null);
  const [bsrLookupSuccess, setBsrLookupSuccess] = useState(false);
  const [bsrImageError, setBsrImageError] = useState<string | null>(null);
  const [bsrImageInputKey, setBsrImageInputKey] = useState(0);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [hiddenTagLibrary, setHiddenTagLibrary] = useState<string[]>([]);
  const [customLibraryTags, setCustomLibraryTags] = useState<string[]>([]);
  const [fieldTagModalOpen, setFieldTagModalOpen] = useState(false);
  const [activeFieldTag, setActiveFieldTag] = useState<ProductFieldTagKey | null>(null);
  const [fieldCustomTags, setFieldCustomTags] = useState<Record<ProductFieldTagKey, string[]>>({
    application_tags: [],
    tooth_pattern_tags: [],
    material_tags: [],
    position_tags: [],
  });
  const [fieldHiddenTags, setFieldHiddenTags] = useState<Record<ProductFieldTagKey, string[]>>({
    application_tags: [],
    tooth_pattern_tags: [],
    material_tags: [],
    position_tags: [],
  });

  // 删除确认对话框状态
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // 表单状态
  const [formData, setFormData] = useState<ProductFormData>({
    sku: "",
    asin: "",
    name: "",
    brand: "EZARC",
    status: "在售",
    application_tags: "",
    tooth_pattern_tags: "",
    material_tags: "",
  });

  const normalizeApiProduct = useCallback((item: ProductApiItem, fallbackSite: string): Product | null => {
    const asin = String(item?.asin || "").trim().toUpperCase();
    if (!asin) return null;

    const rawBsr =
      item?.bsr && typeof item.bsr === "object"
        ? (item.bsr as Partial<ProductBsr>)
        : undefined;
    const site = String(item?.site || rawBsr?.site || fallbackSite).trim().toUpperCase() || fallbackSite;
    const positionTags =
      item?.position_tags_raw ??
      (Array.isArray(item?.position_tags) ? item.position_tags.join(",") : item?.position_tags || "");

    const specQuantityRaw = item?.spec_quantity;
    const specQuantity =
      specQuantityRaw === undefined || specQuantityRaw === null || specQuantityRaw === ""
        ? undefined
        : Number(specQuantityRaw);

    return {
      asin,
      site,
      sku: String(item?.sku || ""),
      brand: String(item?.brand || ""),
      name: String(item?.name || item?.product || ""),
      product: item?.product ? String(item.product) : "",
      application_tags: item?.application_tags ? String(item.application_tags) : "",
      tooth_pattern_tags: item?.tooth_pattern_tags ? String(item.tooth_pattern_tags) : "",
      material_tags: item?.material_tags ? String(item.material_tags) : "",
      spec_length: item?.spec_length ? String(item.spec_length) : "",
      spec_quantity: Number.isFinite(specQuantity) ? specQuantity : undefined,
      spec_other: item?.spec_other ? String(item.spec_other) : "",
      position_tags: String(positionTags || ""),
      position_tags_raw: item?.position_tags_raw ? String(item.position_tags_raw) : "",
      status: String(item?.status || "在售"),
      created_at: item?.created_at ? String(item.created_at) : undefined,
      updated_at: item?.updated_at ? String(item.updated_at) : undefined,
      bsr: rawBsr ? ({ ...rawBsr, site: String(rawBsr.site || site).trim().toUpperCase() || site } as ProductBsr) : undefined,
    };
  }, []);

  // 获取产品列表
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sites = Array.from(
        new Set(
          selectedSites
            .map((item) => String(item || "").trim().toUpperCase())
            .filter(Boolean)
        )
      );
      if (sites.length === 0) {
        setProducts([]);
        setLoadError("请至少选择一个站点。");
        return;
      }

      const results = await Promise.allSettled(
        sites.map((site) => axios.get(API_BASE_URL, { params: { site } }))
      );
      const merged: Product[] = [];
      let hasError = false;

      results.forEach((result, index) => {
        const site = sites[index];
        if (result.status !== "fulfilled") {
          hasError = true;
          return;
        }
        const data = result.value.data as { items?: unknown } | unknown;
        const rawItems = Array.isArray((data as { items?: unknown[] })?.items)
          ? (data as { items: unknown[] }).items
          : Array.isArray(data)
            ? data
            : [];

        rawItems.forEach((rawItem) => {
          if (!rawItem || typeof rawItem !== "object") return;
          const normalized = normalizeApiProduct(rawItem as ProductApiItem, site);
          if (normalized) {
            merged.push(normalized);
          }
        });
      });

      const dedup = new Map<string, Product>();
      merged.forEach((item) => {
        const asin = String(item?.asin || "").trim().toUpperCase();
        const site = String(item?.site || "").trim().toUpperCase();
        const key = `${asin}__${site}`;
        if (!asin || !site) return;
        if (!dedup.has(key)) dedup.set(key, item);
      });
      setProducts(Array.from(dedup.values()));
      setLoadError(hasError ? "部分站点加载失败，请检查后端服务。" : null);
    } catch (error) {
      console.warn("Failed to fetch products:", error);
      setLoadError("加载产品失败，请检查后端服务或接口返回。");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [normalizeApiProduct, selectedSites]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const openTagModal = () => {
    setTagModalOpen(true);
  };

  const closeTagModal = () => {
    setTagModalOpen(false);
  };

  const openFieldTagModal = (field: ProductFieldTagKey) => {
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

  const baseLibraryTags = useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => {
      const tags = product.bsr?.tags;
      if (Array.isArray(tags)) {
        tags.forEach((tag) => tag && set.add(String(tag).trim()));
      } else if (tags) {
        parseTagList(tags).forEach((tag) => set.add(tag));
      }
    });
    return Array.from(set);
  }, [products]);

  const fieldLibraryTags = useMemo<Record<ProductFieldTagKey, string[]>>(() => {
    const build = (key: ProductFieldTagKey) => {
      const set = new Set<string>();
      products.forEach((product) => {
        const raw = product[key];
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
  }, [products]);

  const fieldLabelMap: Record<ProductFieldTagKey, string> = {
    application_tags: "应用标签",
    tooth_pattern_tags: "齿形标签",
    material_tags: "材质标签",
    position_tags: "定位标签",
  };

  // Handle body overflow when modal is open
  useEffect(() => {
    if (showModal || showDeleteModal || tagModalOpen || fieldTagModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showModal, showDeleteModal, tagModalOpen, fieldTagModalOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!siteDropdownRef.current) return;
      if (!siteDropdownRef.current.contains(event.target as Node)) {
        setSiteDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    // ... filtering logic ...
    const keyword = search.trim().toLowerCase();
    return products.filter((product) => {
      // Status mapping
      let matchesStatus = true;
      if (statusFilter !== "All") {
        const statusMap: Record<string, string> = {
          "Active": "在售",
          "Watch": "观察中",
          "Paused": "停售"
        };
        const targetStatus = statusMap[statusFilter];
        matchesStatus = product.status === targetStatus;
      }

      const matchesKeyword = !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.sku.toLowerCase().includes(keyword) ||
        product.asin.toLowerCase().includes(keyword);

      return matchesStatus && matchesKeyword;
    });
  }, [products, search, statusFilter]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((item) => item.status === "在售").length;
    const watch = products.filter((item) => item.status === "观察中").length;
    const paused = products.filter((item) => item.status === "停售").length;
    return { total, active, watch, paused };
  }, [products]);

  const productStats = [
    { label: "Total SKU", value: String(stats.total), bg: "bg-[#1C1C1E] text-white", iconColor: "text-gray-400" },
    { label: "Active", value: String(stats.active), bg: "bg-[#3B9DF8] text-white", iconColor: "text-blue-200" },
    { label: "Watch", value: String(stats.watch), bg: "bg-[#1C1C1E] text-white", iconColor: "text-gray-400" },
    { label: "Paused", value: String(stats.paused), bg: "bg-[#3B9DF8] text-white", iconColor: "text-blue-200" },
  ];

  const formatSpec = (product: Product) => {
    const parts = [];
    if (product.spec_length) parts.push(product.spec_length);
    if (product.spec_quantity) parts.push(`${product.spec_quantity} pcs`);
    if (product.spec_other) parts.push(product.spec_other);
    return parts.length > 0 ? parts.join(" / ") : "-";
  };

  // ... modal handlers ...
  const openAddModal = () => {
    setModalMode("add");
    setEditingProduct(null);
    const nextForm = {
      sku: "",
      asin: "",
      name: "",
      brand: "EZARC",
      status: "在售",
      application_tags: "",
      tooth_pattern_tags: "",
      material_tags: "",
      spec_length: "",
      spec_quantity: undefined,
      position_tags: "",
    };
    setFormData(nextForm);
    setBsrForm({
      ...createEmptyBsrForm(),
      site: selectedSites[0] || "US",
      brand: nextForm.brand,
    });
    setBsrLookupError(null);
    setBsrLookupSuccess(false);
    setBsrImageError(null);
    setBsrImageInputKey((prev) => prev + 1);
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setModalMode("edit");
    setEditingProduct(product);
    setFormData({ ...product });
    const bsr = product.bsr;
    setBsrForm({
      site: bsr?.site ? String(bsr.site).toUpperCase() : String(product.site || "US").toUpperCase(),
      parent_asin: bsr?.parent_asin ?? "",
      title: bsr?.title ?? "",
      image_url: bsr?.image_url ?? "",
      product_url: bsr?.product_url ?? "",
      brand: bsr?.brand ?? product.brand ?? "",
      createtime: bsr?.createtime ?? "",
      price: bsr?.price != null ? String(bsr.price).replace(/[^0-9.]/g, "") : "",
      list_price: bsr?.list_price != null ? String(bsr.list_price).replace(/[^0-9.]/g, "") : "",
      score: bsr?.score != null ? String(bsr.score) : "",
      comment_count: bsr?.comment_count != null ? String(bsr.comment_count) : "",
      bsr_rank: bsr?.bsr_rank != null ? String(bsr.bsr_rank) : "",
      category_rank: bsr?.category_rank != null ? String(bsr.category_rank) : "",
      variation_count: bsr?.variation_count != null ? String(bsr.variation_count) : "",
      launch_date: bsr?.launch_date ?? "",
      conversion_rate: normalizePercentInput(bsr?.conversion_rate),
      organic_traffic_count: normalizeTextInput(bsr?.organic_traffic_count),
      ad_traffic_count: normalizeTextInput(bsr?.ad_traffic_count),
      organic_search_terms: normalizeTextInput(bsr?.organic_search_terms),
      ad_search_terms: normalizeTextInput(bsr?.ad_search_terms),
      search_recommend_terms: normalizeTextInput(bsr?.search_recommend_terms),
      sales_volume: bsr?.sales_volume != null ? String(bsr.sales_volume) : "",
      sales: bsr?.sales != null ? String(bsr.sales) : "",
      tags: Array.isArray(bsr?.tags) ? bsr?.tags.join(",") : (bsr?.tags ?? ""),
    });
    setBsrLookupError(null);
    setBsrLookupSuccess(false);
    setBsrImageError(null);
    setBsrImageInputKey((prev) => prev + 1);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setFormError(null);
    closeTagModal();
  }

  const buildPayload = () => {
    const specQuantityRaw = formData.spec_quantity;
    const parsedSpecQuantity =
      specQuantityRaw === undefined || specQuantityRaw === null || specQuantityRaw === ""
        ? null
        : Number(specQuantityRaw);
    return {
      asin: String(formData.asin || "").trim(),
      site: String(bsrForm.site || formData.site || editingProduct?.site || "US").trim().toUpperCase() || "US",
      sku: String(formData.sku || "").trim(),
      brand: String(formData.brand || "").trim(),
      product: String(formData.name || "").trim(),
      application_tags: formData.application_tags?.trim() || null,
      tooth_pattern_tags: formData.tooth_pattern_tags?.trim() || null,
      material_tags: formData.material_tags?.trim() || null,
      spec_length: formData.spec_length?.trim() || null,
      spec_quantity: parsedSpecQuantity !== null && Number.isFinite(parsedSpecQuantity) ? parsedSpecQuantity : null,
      spec_other: formData.spec_other?.trim() || null,
      position_tags: (() => {
        if (Array.isArray(formData.position_tags)) {
          return formData.position_tags.join(",");
        }
        if (typeof formData.position_tags === "string") {
          const value = formData.position_tags.trim();
          return value ? value : null;
        }
        return null;
      })(),
      status: formData.status || "在售",
      bsr: buildBsrPayload(),
    };
  };

  const buildBsrPayload = () => {
    const payload = {
      parent_asin: bsrForm.parent_asin?.trim() || null,
      title: bsrForm.title?.trim() || null,
      image_url: bsrForm.image_url?.trim() || null,
      product_url: bsrForm.product_url?.trim() || null,
      brand: bsrForm.brand?.trim() || formData.brand?.trim() || null,
      createtime: bsrForm.createtime?.trim() || null,
      price: toNumberOrNull(bsrForm.price),
      list_price: toNumberOrNull(bsrForm.list_price),
      score: toNumberOrNull(bsrForm.score),
      comment_count: toNumberOrNull(bsrForm.comment_count, true),
      bsr_rank: toNumberOrNull(bsrForm.bsr_rank, true),
      category_rank: toNumberOrNull(bsrForm.category_rank, true),
      variation_count: toNumberOrNull(bsrForm.variation_count, true),
      launch_date: bsrForm.launch_date?.trim() || null,
      conversion_rate: toNumberOrNull(bsrForm.conversion_rate),
      organic_traffic_count: toNumberOrNull(bsrForm.organic_traffic_count),
      ad_traffic_count: toNumberOrNull(bsrForm.ad_traffic_count),
      organic_search_terms: toNumberOrNull(bsrForm.organic_search_terms, true),
      ad_search_terms: toNumberOrNull(bsrForm.ad_search_terms, true),
      search_recommend_terms: toNumberOrNull(bsrForm.search_recommend_terms, true),
      sales_volume: toNumberOrNull(bsrForm.sales_volume, true),
      sales: toNumberOrNull(bsrForm.sales),
      tags: bsrForm.tags?.trim() || null,
    };
    const hasValue = Object.values(payload).some((value) => value !== null && value !== "");
    return hasValue
      ? { ...payload, site: String(bsrForm.site || "US").trim().toUpperCase() || "US" }
      : null;
  };

  const fillBsrFormFromLookup = (item: Partial<ProductBsr>) => {
    setBsrForm((prev) => ({
      ...prev,
      site: item.site ? String(item.site).toUpperCase() : prev.site || "US",
      parent_asin: item.parent_asin ?? "",
      title: item.title ?? "",
      image_url: item.image_url ?? "",
      product_url: item.product_url ?? "",
      brand: item.brand ?? prev.brand ?? formData.brand ?? "",
      price: normalizeMoneyInput(item.price),
      list_price: normalizeMoneyInput(item.list_price),
      score: normalizeTextInput(item.score ?? item.rating),
      comment_count: normalizeTextInput(item.comment_count ?? item.reviews),
      bsr_rank: normalizeTextInput(item.bsr_rank ?? item.rank),
      category_rank: normalizeTextInput(item.category_rank),
      variation_count: normalizeTextInput(item.variation_count),
      launch_date: item.launch_date ?? "",
      conversion_rate: normalizePercentInput(item.conversion_rate),
      organic_traffic_count: normalizeTextInput(item.organic_traffic_count),
      ad_traffic_count: normalizeTextInput(item.ad_traffic_count),
      organic_search_terms: normalizeTextInput(item.organic_search_terms),
      ad_search_terms: normalizeTextInput(item.ad_search_terms),
      search_recommend_terms: normalizeTextInput(item.search_recommend_terms),
      sales_volume: normalizeTextInput(item.sales_volume),
      sales: normalizeTextInput(item.sales),
      tags: Array.isArray(item.tags) ? item.tags.join(",") : (item.tags ?? ""),
    }));
    setFormData((prev) => ({
      ...prev,
      name: prev.name || item.title || "",
      brand: prev.brand || item.brand || prev.brand || "",
    }));
  };

  const handleBsrImageUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBsrImageError("仅支持图片文件。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setBsrImageError("读取图片失败，请重试。");
        return;
      }
      setBsrForm((prev) => ({ ...prev, image_url: result }));
      setBsrImageError(null);
    };
    reader.onerror = () => {
      setBsrImageError("读取图片失败，请重试。");
    };
    reader.readAsDataURL(file);
  };

  const lookupBsrByAsin = async (asin: string) => {
    const trimmed = String(asin || "").trim();
    if (!trimmed) return;
    setBsrLookupLoading(true);
    setBsrLookupError(null);
    setBsrLookupSuccess(false);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await axios.post(`${apiBase}/api/bsr/lookup`, {
        asin: trimmed,
        site: String(bsrForm.site || "US").trim().toUpperCase() || "US",
        brand: String(formData.brand || bsrForm.brand || "").trim() || undefined,
      });
      const lookupItem = res.data?.item as Partial<ProductBsr> | undefined;
      if (lookupItem) {
        fillBsrFormFromLookup(lookupItem);
        setBsrLookupSuccess(true);
      }
    } catch (err: unknown) {
      if (!(axios.isAxiosError(err) && err.response?.status === 404)) {
        setBsrLookupError("自动填充失败，请检查后端服务。");
      }
    } finally {
      setBsrLookupLoading(false);
    }
  };

  const saveProduct = async () => {
    const payload = buildPayload();
    if (!payload.asin) {
      setFormError("ASIN 为必填项。");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === "add") {
        await axios.post(API_BASE_URL, payload);
      } else {
        const targetSite =
          String(editingProduct?.site || editingProduct?.bsr?.site || payload.site || "US")
            .trim()
            .toUpperCase() || "US";
        await axios.put(
          `${API_BASE_URL}/${editingProduct?.asin}?site=${encodeURIComponent(targetSite)}`,
          payload
        );
      }
      await fetchProducts();
      closeModal();
    } catch {
      setFormError("保存失败，请检查后端服务或数据格式。");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = (product: Product) => {
    setProductToDelete(product);
    setShowDeleteModal(true);
  };

  const allSitesSelected = selectedSites.length === siteOptions.length;
  const selectedSiteLabel =
    allSitesSelected || selectedSites.length === 0 ? "全部站点" : selectedSites.join(",");

  const toggleSiteSelection = (site: string) => {
    setSelectedSites((prev) => {
      const normalized = site.toUpperCase();
      if (prev.includes(normalized)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const asin = String(productToDelete.asin || "").trim();
    if (!asin) return;
    const site =
      String(productToDelete.site || productToDelete.bsr?.site || "US")
        .trim()
        .toUpperCase() || "US";

    setSaving(true);
    try {
      await axios.delete(`${API_BASE_URL}/${encodeURIComponent(asin)}?site=${encodeURIComponent(site)}`);
      await fetchProducts();
      setShowDeleteModal(false);
      setProductToDelete(null);
    } catch (err) {
      console.warn("Failed to delete product:", err);
      alert("删除失败，请检查网络或后端服务。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={`flex-1 ${collapsed ? "ml-20" : "ml-56"} p-8 transition-all duration-300 bg-[#F7F9FB] min-h-screen text-gray-800`}>
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-800 transition"
            title={collapsed ? "展开菜单" : "收起菜单"}
          >
            <SidebarSimple className="text-xl" />
          </button>
          <Star className="text-xl text-gray-800 cursor-pointer" weight="fill" />
          <span className="text-gray-400">Dashboards</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Products</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-[148px]" ref={siteDropdownRef}>
            <button
              type="button"
              onClick={() => setSiteDropdownOpen((prev) => !prev)}
              className="w-full h-9 px-3 rounded-xl bg-[#F4F6FA] border border-[#E9EDF3] text-[13px] text-[#3D4757] font-medium flex items-center justify-between hover:border-[#D5DBE6] transition"
            >
              <span className="truncate">{selectedSiteLabel}</span>
              <CaretDown
                size={14}
                className={`text-[#7A8596] transition-transform ${siteDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {siteDropdownOpen && (
              <div className="absolute left-0 top-[42px] z-30 w-full rounded-xl border border-[#E6EBF2] bg-white shadow-lg p-2">
                <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#0C1731]"
                    checked={allSitesSelected}
                    onChange={() => {
                      if (allSitesSelected) {
                        setSelectedSites(["US"]);
                      } else {
                        setSelectedSites([...siteOptions]);
                      }
                    }}
                  />
                  全部站点
                </label>
                <div className="my-1 h-px bg-[#EEF2F7]" />
                {siteOptions.map((site) => (
                  <label
                    key={site}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0C1731]"
                      checked={selectedSites.includes(site)}
                      onChange={() => toggleSiteSelection(site)}
                    />
                    {site}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-72">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <FormInput
              type="text"
              placeholder="搜索 产品名称, ASIN..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-[34px] pl-11 pr-4 text-xs rounded-full"
            />
          </div>
          <button
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
            onClick={handleToggleFullscreen}
            title="全屏"
          >
            <CornersOut size={18} />
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {productStats.map((item) => (
          <div
            key={item.label}
            className={`p-6 rounded-3xl relative overflow-hidden shadow-lg ${item.bg} flex flex-col justify-between card-hover-lift`}
          >
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium opacity-90">{item.label}</span>
              <div className={`p-1 rounded bg-white/10 ${item.iconColor}`}>
                <Tag size={16} className="text-white" />
              </div>
            </div>
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-semibold">{item.value}</h2>
            </div>
          </div>
        ))}
      </section>

      {/* Product List */}
      <section className="bg-white p-5 rounded-3xl shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${statusFilter === status
                  ? "bg-[#1C1C1E] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={openAddModal}
              className="h-[34px] min-w-[86px] px-2.5 rounded-lg bg-[#0C1731] hover:bg-[#162443] text-white text-xs font-semibold flex items-center justify-center whitespace-nowrap shrink-0 shadow-sm transition"
            >
              新增产品
            </button>
          </div>
        </div>

        {/* Cards */}
        {loadError && (
          <div className="mb-6 px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-400 bg-gray-50 rounded-2xl">
            正在加载产品...
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.asin}
                product={product}
                onEdit={() => openEditModal(product)}
                onDelete={() => deleteProduct(product)}
                formatSpec={formatSpec}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400 bg-gray-50 rounded-2xl">
            暂无数据
          </div>
        )}
      </section>

      {/* Modal ... */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">
                {modalMode === "add" ? "新增产品" : "编辑产品"}
              </h3>
              <button className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors" onClick={closeModal}>
                ✕
              </button>
            </div>
            {/* ... form content ... */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Site</label>
                <div className="relative">
                  <FormSelect
                    value={bsrForm.site || "US"}
                    onChange={(e) => setBsrForm((prev) => ({ ...prev, site: e.target.value }))}
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
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, brand }));
                        setBsrForm((prev) => ({ ...prev, brand }));
                      }}
                      className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all border ${(
                        formData.brand === brand
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
                  value={formData.sku || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="SKU"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ASIN</label>
                <FormInput
                  value={formData.asin || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({ ...prev, asin: value }));
                    setBsrLookupSuccess(false);
                    setBsrLookupError(null);
                    if (!value.trim()) {
                      setFormData((prev) => ({ ...prev, name: "", brand: "" }));
                      setBsrForm((prev) => ({ ...createEmptyBsrForm(), brand: "", site: prev.site || "US" }));
                      setBsrImageError(null);
                      setBsrImageInputKey((prev) => prev + 1);
                    }
                  }}
                  onBlur={(e) => lookupBsrByAsin(e.target.value)}
                  placeholder="ASIN"
                  disabled={modalMode === "edit"}
                />
                {bsrLookupLoading && (
                  <div className="text-xs text-gray-400 mt-1">正在查询 BSR 数据...</div>
                )}
                {bsrLookupSuccess && (
                  <div className="text-xs text-green-600 mt-1">已自动填充 BSR 数据。</div>
                )}
                {bsrLookupError && (
                  <div className="text-xs text-red-500 mt-1">{bsrLookupError}</div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">产品名称</label>
                <FormInput
                  value={formData.name || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="产品名称"
                />
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">规格-长度</label>
                    <FormInput
                      size="sm"
                      value={formData.spec_length || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, spec_length: e.target.value }))}
                      placeholder="6 inch"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">片数</label>
                    <FormInput
                      size="sm"
                      type="number"
                      value={formData.spec_quantity ?? ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, spec_quantity: e.target.value === "" ? undefined : Number(e.target.value) }))}
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">其他</label>
                    <FormInput
                      size="sm"
                      value={formData.spec_other || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, spec_other: e.target.value }))}
                      placeholder="10/14 TPI"
                    />
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">应用标签</label>
                  <button
                    type="button"
                    onClick={() => openFieldTagModal("application_tags")}
                    className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                  >
                    管理标签
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <TagPillList
                    value={formData.application_tags}
                    toneClass="bg-blue-100 text-blue-600"
                    stack
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">齿形标签</label>
                  <button
                    type="button"
                    onClick={() => openFieldTagModal("tooth_pattern_tags")}
                    className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                  >
                    管理标签
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <TagPillList
                    value={formData.tooth_pattern_tags}
                    toneClass="bg-purple-100 text-purple-600"
                    stack
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">材质标签</label>
                  <button
                    type="button"
                    onClick={() => openFieldTagModal("material_tags")}
                    className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                  >
                    管理标签
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <TagPillList
                    value={formData.material_tags}
                    toneClass="bg-green-100 text-green-600"
                    stack
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">定位标签</label>
                  <button
                    type="button"
                    onClick={() => openFieldTagModal("position_tags")}
                    className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                  >
                    管理标签
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <TagPillList
                    value={formData.position_tags}
                    toneClass="bg-yellow-100 text-yellow-600"
                    stack
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">状态</label>
                <div className="flex gap-2">
                  {["在售", "观察中", "停售"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, status: s }))}
                      className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all border ${(formData.status || "在售") === s
                        ? "bg-gray-900 text-white border-gray-900 shadow-md scale-[1.02]"
                        : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-bold text-gray-900 mb-1">数据明细</h4>
                <p className="text-xs text-gray-400">用于新增未在榜单的产品</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">BSR 标题</label>
                <FormInput
                  value={bsrForm.title}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="亚马逊标题"
                />
              </div>
              <div className="md:col-span-2 flex flex-col md:flex-row gap-6 items-stretch">
                <div className="md:w-1/2 shrink-0 flex flex-col">
                  <label className="block text-sm font-bold text-gray-700 mb-2">BSR 图片</label>
                  <div
                    className={`flex flex-1 flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 ${bsrForm.image_url ? "p-2" : "p-4"}`}
                  >
                    {!bsrForm.image_url && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          key={bsrImageInputKey}
                          id="bsr-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBsrImageUpload(e.target.files?.[0])}
                          className="hidden"
                        />
                        <label
                          htmlFor="bsr-image-upload"
                          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-black cursor-pointer transition-colors"
                        >
                          选择图片
                        </label>
                        <span className="text-xs text-gray-400">未选择图片</span>
                      </div>
                    )}
                    {bsrImageError && (
                      <div className="text-xs text-red-500">{bsrImageError}</div>
                    )}
                    <div className="flex-1 flex items-center justify-center min-h-[240px]">
                      {bsrForm.image_url ? (
                        <div className="relative w-full h-full bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setBsrForm((prev) => ({ ...prev, image_url: "" }));
                              setBsrImageInputKey((prev) => prev + 1);
                              setBsrImageError(null);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white text-sm font-bold flex items-center justify-center hover:bg-black z-10"
                            aria-label="清除图片"
                          >
                            ×
                          </button>
                          <img
                            src={bsrForm.image_url}
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
                        value={bsrForm.parent_asin}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, parent_asin: e.target.value }))}
                        placeholder="Parent ASIN"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">上架时间</label>
                      <AppDatePicker
                        value={bsrForm.launch_date}
                        onChange={(val) =>
                          setBsrForm((prev) => ({
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
                        value={bsrForm.price}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="价格"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">原价</label>
                      <FormInput
                        type="number"
                        step="0.01"
                        value={bsrForm.list_price}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, list_price: e.target.value }))}
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
                        value={bsrForm.score}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, score: e.target.value }))}
                        placeholder="评分"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">评论数</label>
                      <FormInput
                        type="number"
                        value={bsrForm.comment_count}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, comment_count: e.target.value }))}
                        placeholder="评论数"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">BSR 排名</label>
                      <FormInput
                        type="number"
                        value={bsrForm.bsr_rank}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, bsr_rank: e.target.value }))}
                        placeholder="BSR 排名"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">大类排名</label>
                      <FormInput
                        type="number"
                        value={bsrForm.category_rank}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, category_rank: e.target.value }))}
                        placeholder="大类排名"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">变体数</label>
                      <FormInput
                        type="number"
                        value={bsrForm.variation_count}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, variation_count: e.target.value }))}
                        placeholder="变体数"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">综合转化率(%)</label>
                      <FormInput
                        type="number"
                        step="0.0001"
                        value={bsrForm.conversion_rate}
                        onChange={(e) => setBsrForm((prev) => ({ ...prev, conversion_rate: e.target.value }))}
                        placeholder="0.1234"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 pt-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">详情页链接</label>
                <FormInput
                  value={bsrForm.product_url}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, product_url: e.target.value }))}
                  placeholder="产品详情页 URL"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">7天自然流量得分</label>
                <FormInput
                  type="number"
                  step="1"
                  value={bsrForm.organic_traffic_count}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, organic_traffic_count: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">7天广告流量得分</label>
                <FormInput
                  type="number"
                  step="1"
                  value={bsrForm.ad_traffic_count}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, ad_traffic_count: e.target.value }))}
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
                      value={bsrForm.organic_search_terms}
                      onChange={(e) => setBsrForm((prev) => ({ ...prev, organic_search_terms: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">广告流量词</label>
                    <FormInput
                      type="number"
                      step="1"
                      value={bsrForm.ad_search_terms}
                      onChange={(e) => setBsrForm((prev) => ({ ...prev, ad_search_terms: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">搜索推荐词</label>
                    <FormInput
                      type="number"
                      step="1"
                      value={bsrForm.search_recommend_terms}
                      onChange={(e) => setBsrForm((prev) => ({ ...prev, search_recommend_terms: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">月销量</label>
                <FormInput
                  type="number"
                  value={bsrForm.sales_volume}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, sales_volume: e.target.value }))}
                  placeholder="月销量"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">月销售额($)</label>
                <FormInput
                  type="number"
                  step="0.01"
                  value={bsrForm.sales}
                  onChange={(e) => setBsrForm((prev) => ({ ...prev, sales: e.target.value }))}
                  placeholder="月销售额($)"
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-700">自定义标签</label>
                  <button
                    type="button"
                    onClick={openTagModal}
                    className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600 hover:bg-white hover:border-gray-200 transition-all"
                  >
                    管理标签
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <TagPillList
                    value={bsrForm.tags}
                    toneClass="bg-blue-50 text-[#3B9DF8]"
                    stack
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="mt-4 text-sm text-red-500">{formError}</div>
            )}

            <div className="flex justify-end gap-3 mt-10">
              <button
                className="px-8 py-3 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all"
                onClick={closeModal}
                disabled={saving}
              >
                取消
              </button>
              <button
                className="px-10 py-3 rounded-2xl text-sm font-bold text-white bg-gray-900 hover:bg-black active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
                onClick={saveProduct}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
      <TagManagerModal
        open={tagModalOpen}
        initialSelected={parseTagList(bsrForm.tags)}
        libraryTags={baseLibraryTags}
        customLibraryTags={customLibraryTags}
        setCustomLibraryTags={setCustomLibraryTags}
        hiddenLibraryTags={hiddenTagLibrary}
        setHiddenLibraryTags={setHiddenTagLibrary}
        onSave={(tags) => {
          setBsrForm((prev) => ({
            ...prev,
            tags: tags.join(","),
          }));
          closeTagModal();
        }}
        onClose={closeTagModal}
      />
      <TagManagerModal
        open={fieldTagModalOpen && !!activeFieldTag}
        title="管理标签"
        subtitle={
          activeFieldTag ? `为当前产品设置${fieldLabelMap[activeFieldTag] || "标签"}` : "为当前产品设置标签"
        }
        initialSelected={activeFieldTag ? parseTagList(formData[activeFieldTag]) : []}
        libraryTags={activeFieldTag ? fieldLibraryTags[activeFieldTag] || [] : []}
        customLibraryTags={activeFieldTag ? fieldCustomTags[activeFieldTag] || [] : []}
        setCustomLibraryTags={setActiveFieldCustomTags}
        hiddenLibraryTags={activeFieldTag ? fieldHiddenTags[activeFieldTag] || [] : []}
        setHiddenLibraryTags={setActiveFieldHiddenTags}
        onSave={(tags) => {
          if (!activeFieldTag) return;
          setFormData((prev) => ({
            ...prev,
            [activeFieldTag]: tags.join(","),
          }));
          closeFieldTagModal();
        }}
        onClose={closeFieldTagModal}
      />
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[4px] transition-all">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 transform transition-all scale-100 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除产品？</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                您确定要删除产品 <span className="font-bold text-gray-900">{productToDelete?.asin}</span> 吗？<br />
                此操作无法撤销。
              </p>

              <div className="flex gap-3 w-full">
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition-all active:scale-95"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setProductToDelete(null);
                  }}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-br from-red-500 to-red-600 hover:shadow-lg hover:shadow-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={confirmDeleteProduct}
                  disabled={saving}
                >
                  {saving ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProductCard({
  product,
  onEdit,
  onDelete,
  formatSpec,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  formatSpec: (product: Product) => string;
}) {
  const [imageError, setImageError] = useState(false);
  const bsr = product.bsr;
  const displayTitle = product.name || product.product || "-";
  const displayImage = bsr?.image_url || "";
  const ratingValue = Number(bsr?.score ?? 0);
  const ratingStars = Math.max(0, Math.min(5, Math.round(ratingValue)));

  const organicTerms = toCount(bsr?.organic_search_terms);
  const adTerms = toCount(bsr?.ad_search_terms);
  const recommendTerms = toCount(bsr?.search_recommend_terms);
  const totalTerms = organicTerms + adTerms + recommendTerms;
  const trafficShareText = formatTrafficShare(bsr?.organic_traffic_count, bsr?.ad_traffic_count, "organic");
  const adTrafficShareText = formatTrafficShare(bsr?.organic_traffic_count, bsr?.ad_traffic_count, "ad");

  return (
    <div className="bg-white rounded-3xl shadow-sm p-5 border border-gray-100 relative flex flex-col h-full group overflow-visible card-hover-lift hover:z-30">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-white bg-[#1C1C1E] px-2 py-1 rounded-lg">
          #{formatText(bsr?.bsr_rank)}
        </span>
      </div>

      <div className="w-full h-40 bg-gray-50 rounded-2xl mb-5 flex items-center justify-center relative group-hover:bg-gray-100 transition-colors overflow-hidden">
        {displayImage && !imageError ? (
          <img
            src={displayImage}
            alt={displayTitle}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="text-sm font-bold text-gray-300 tracking-widest">IMG</div>
        )}
      </div>

      <div className="h-[44px] mb-2">
        <h3 className="text-[15px] font-semibold text-gray-900 line-clamp-2 leading-snug" title={displayTitle}>
          {bsr?.product_url ? (
            <a
              className="cursor-pointer hover:text-[#3B9DF8] transition-colors"
              href={bsr.product_url}
              target="_blank"
              rel="noreferrer"
            >
              {displayTitle}
            </a>
          ) : (
            displayTitle
          )}
        </h3>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-bold text-gray-900">{formatMoney(bsr?.price)}</span>
        <span className="text-[11px] text-gray-400 line-through">{formatMoney(bsr?.list_price)}</span>
        <div className="flex text-[#3B9DF8] text-[14px]">
          {"★★★★★".slice(0, ratingStars)}
          <span className="text-gray-200">{"★★★★★".slice(ratingStars)}</span>
        </div>
        <span className="text-xs font-bold text-gray-900">{formatText(bsr?.score)}</span>
        <span className="text-xs text-gray-400">({formatNumber(bsr?.comment_count)})</span>
      </div>

      <div className="flex flex-col gap-1.5 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">站点:</span>
          <span className="text-[11px] font-bold text-gray-900">
            {formatText((product.site || bsr?.site || "US")).toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">品牌:</span>
          <span className="text-[11px] font-bold text-gray-900">{formatText(bsr?.brand || product.brand)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">ASIN:</span>
          <span className="text-[11px] font-bold text-gray-900">{product.asin}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight whitespace-nowrap">父ASIN:</span>
          <span className="text-[11px] font-bold text-gray-900">{formatText(bsr?.parent_asin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight whitespace-nowrap">SKU:</span>
          <span className="text-[11px] font-bold text-gray-900">{product.sku}</span>
        </div>
      </div>

      {/* Hover Details */}
      <div className="absolute left-full top-0 bottom-0 ml-4 z-40 w-[320px] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 hover:opacity-100 hover:translate-y-0 transition pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto">
        <div className="bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-xl p-3 text-[11px] text-gray-500 space-y-3 h-full overflow-auto custom-scrollbar">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>BSR排名</span>
              <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">#{formatText(bsr?.bsr_rank)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>大类排名</span>
              <span className="text-white bg-[#1C1C1E] px-2 py-0.5 rounded-lg font-bold">#{formatNumber(bsr?.category_rank)}</span>
            </div>
          <div className="flex items-center justify-between">
            <span>综合转化率</span>
            <span className="inline-flex items-center">
              <ConversionRateBadge value={bsr?.conversion_rate} period={bsr?.conversion_rate_period} />
            </span>
          </div>
            <div className="flex items-center justify-between">
              <span>7天自然流量占比</span>
              <span className="bg-[#3B9DF8]/10 text-[#3B9DF8] font-bold px-2 py-0.5 rounded-lg">
                {formatNumber(bsr?.organic_traffic_count)}
                {trafficShareText}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>7天广告流量占比</span>
              <span className="bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-lg">
                {formatNumber(bsr?.ad_traffic_count)}
                {adTrafficShareText}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span>全部流量词</span>
                <span className="text-gray-900 font-bold">{formatNumber(totalTerms)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>自然搜索词</span>
                <span className="text-gray-900 font-bold">{formatNumber(organicTerms)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>广告流量词</span>
                <span className="text-gray-900 font-bold">{formatNumber(adTerms)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>搜索推荐词</span>
                <span className="text-gray-900 font-bold">{formatNumber(recommendTerms)}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>变体数</span>
              <span className="text-gray-900 font-bold">{formatNumber(bsr?.variation_count)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>上架时间</span>
              <span className="text-gray-900 font-bold">{formatText(bsr?.launch_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>月销量</span>
              <span className="text-gray-900 font-bold">{formatNumber(bsr?.sales_volume)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>月销售额</span>
              <span className="text-gray-900 font-bold">{formatSalesMoney(bsr?.sales)}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100 space-y-3">
            <TagGroup
              label="自定义"
              tags={parseTagList(bsr?.tags)}
              toneClass="bg-blue-50 text-[#3B9DF8] border border-blue-100/50"
            />
            <div className="space-y-2">
              <TagGroup
                label="应用"
                tags={parseTagList(product.application_tags)}
                toneClass="bg-blue-50 text-[#3B9DF8] border border-blue-100/50"
              />
              <TagGroup
                label="齿形"
                tags={parseTagList(product.tooth_pattern_tags)}
                toneClass="bg-purple-50 text-purple-600 border border-purple-100/50"
              />
              <TagGroup
                label="材质"
                tags={parseTagList(product.material_tags)}
                toneClass="bg-green-50 text-green-600 border border-green-100/50"
              />
              <TagGroup
                label="定位"
                tags={parseTagList(product.position_tags_raw ?? product.position_tags)}
                toneClass="bg-gray-100 text-gray-500 border border-gray-200/50"
              />
            </div>
            <div className="flex items-center justify-between">
              <span>规格</span>
              <span className="text-gray-900 font-bold">{formatSpec(product)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>更新时间</span>
              <span className="text-gray-900 font-bold">{product.updated_at || "-"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>状态</span>
              <span className={`text-[10px] px-2 py-1 rounded-full ${PRODUCT_STATUS_COLOR[product.status] || "bg-gray-100"}`}>
                {product.status}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-auto pt-4">
        <button
          onClick={onEdit}
          className="py-2.5 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-xl hover:bg-gray-200 transition-colors"
        >
          编辑
        </button>
        <button
          onClick={onDelete}
          className="py-2.5 bg-red-50 text-red-600 text-[11px] font-bold rounded-xl hover:bg-red-100 transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}
