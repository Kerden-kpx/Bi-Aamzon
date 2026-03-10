import {
  CaretDown,
  CheckCircle,
  SidebarSimple,
  Star,
  UsersThree,
  CornersOut,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Cascader } from "antd";
import * as echarts from "echarts";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";

import { AppDatePicker } from "../components/AppDatePicker";
import { FormInput, FormSelect } from "../components/FormControls";
import {
  fetchCategoryTreeOptions,
  fetchCategoryRows,
  invalidateCategoryCache,
  findCategoryPathByLeaf,
  getCategoryLeafFromPath,
  type ProductCategoryRow,
} from "../constants/productCategories";

const permissionTabs = ["统计", "成员", "组", "操作日志"];
const bsrSiteOptions = ["US", "CA", "UK", "DE", "JP"];
const DEFAULT_PERMISSION_SITE = "US";

type UserRow = {
  dingtalk_userid: string;
  dingtalk_username: string;
  role: string;
  status: string;
  product_scope?: string;
  last_active_at?: string | null;
  created_at?: string | null;
};

type AuditLogRow = {
  id: number;
  module: string;
  action: string;
  target_id: string;
  operator_userid: string;
  operator_name: string;
  detail: string;
  created_at: string;
};

type TeamMemberRow = {
  userid: string;
  username: string;
  member_role: string;
  status: string;
};

type TeamGroupRow = {
  team_name: string;
  member_count: number;
  members: TeamMemberRow[];
};

type ProductOption = {
  asin: string;
  name: string;
  brand?: string;
  category?: string;
  site?: string;
  imageUrl?: string;
};

type TrendRow = {
  date: string;
  count: number;
};

type ModuleUsageRow = {
  module: string;
  count: number;
  ratio: number;
};

type UsageRow = {
  userid: string;
  name: string;
  sevenDays: number;
  thirtyDays: number;
  total: number;
};

type DingTalkLookupItem = {
  userid: string;
  name: string;
};

type PermissionStatsSummary = {
  totalUsers: number;
  activeToday: number;
  activeWeek: number;
  visitCount: number;
  actionCount: number;
};

type PermissionStatsApiRow = {
  date?: string;
  count?: number;
  module?: string;
  ratio?: number;
  userid?: string;
  name?: string;
  sevenDays?: number;
  thirtyDays?: number;
  total?: number;
};

type ProductQueryRow = {
  asin?: string;
  site?: string;
  product?: string;
  name?: string;
  brand?: string;
  category?: string;
  bsr?: {
    site?: string;
    brand?: string;
    category?: string;
    image_url?: string;
  };
};

type DingTalkLookupResponseItem = {
  userid?: string;
  name?: string;
};

const roleLabel = (role: string) => {
  if (role === "admin") return "管理员";
  if (role === "team_lead") return "运营组长";
  if (role === "operator") return "运营人员";
  return role || "-";
};

const statusLabel = (status: string) => {
  if (status === "active") return "Active";
  if (status === "disabled") return "Paused";
  return status || "-";
};

const moduleLabel = (module: string) => {
  if (module === "strategy") return "策略";
  if (module === "bsr") return "Best Sellers";
  if (module === "product") return "产品";
  if (module === "user") return "用户";
  if (module === "permission") return "权限";
  return module || "-";
};

const actionLabel = (action: string) => {
  if (action === "create") return "创建";
  if (action === "update") return "更新";
  if (action === "delete") return "删除";
  if (action === "visit") return "访问";
  if (action === "update_state") return "更新状态";
  if (action === "update_tags") return "更新标签";
  if (action === "update_mapping") return "更新映射";
  if (action === "update_product_visibility") return "更新产品权限";
  return action || "-";
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
  }
  const text = String(value).trim().replace("T", " ").replace("Z", "");
  const dotIndex = text.indexOf(".");
  return dotIndex >= 0 ? text.slice(0, dotIndex) : text;
};

const normalizeSite = (value: unknown) => {
  const site = String(value || "").trim().toUpperCase();
  return site || DEFAULT_PERMISSION_SITE;
};

const buildPermissionKey = (asin: string, site: string) =>
  `${String(asin || "").trim().toUpperCase()}|${normalizeSite(site)}`;

const splitPermissionKey = (value: string): { asin: string; site: string } => {
  const parts = String(value || "").split("|");
  const asin = String(parts[0] || "").trim().toUpperCase();
  const site = normalizeSite(parts[1] || DEFAULT_PERMISSION_SITE);
  return { asin, site };
};

const normalizeCategoryToLeaf = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (findCategoryPathByLeaf(raw)) return raw;
  const normalized = raw.replace(/＞/g, ">");
  const parts = normalized.split(/>|\/|\\/).map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  return parts[parts.length - 1] || raw;
};

export function PermissionBoard({
  collapsed = false,
  onToggleCollapse,
  currentRole = "operator",
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  currentRole?: string;
}) {
  const normalizedRole = String(currentRole || "").trim().toLowerCase();
  const canViewAdminTabs = normalizedRole === "admin";
  const canViewTeamTabs = normalizedRole === "team_lead";
  const visibleTabs = canViewAdminTabs ? permissionTabs : canViewTeamTabs ? ["成员"] : ["成员"];
  const [categoryTreeOptions, setCategoryTreeOptions] = useState<object[]>([]);
  useEffect(() => {
    fetchCategoryTreeOptions().then(setCategoryTreeOptions);
  }, []);
  const [activeTab, setActiveTab] = useState("成员");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [nameLookupLoading, setNameLookupLoading] = useState(false);
  const [nameLookupHint, setNameLookupHint] = useState<string | null>(null);
  const [nameLookupError, setNameLookupError] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<"admin" | "team_lead" | "operator">("operator");
  const [newUserStatus, setNewUserStatus] = useState<"active" | "disabled">("active");
  const [newUserScope, setNewUserScope] = useState<"all" | "restricted">("restricted");
  const [newPermissionSearch, setNewPermissionSearch] = useState("");
  const [newPermissionSites, setNewPermissionSites] = useState<string[]>([...bsrSiteOptions]);
  const [newSiteDropdownOpen, setNewSiteDropdownOpen] = useState(false);
  const newSiteDropdownRef = useRef<HTMLDivElement | null>(null);
  const [newUserSelectedAsins, setNewUserSelectedAsins] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "team_lead" | "operator">("operator");
  const [editStatus, setEditStatus] = useState<"active" | "disabled">("active");
  const [editScope, setEditScope] = useState<"all" | "restricted">("all");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionSites, setPermissionSites] = useState<string[]>([...bsrSiteOptions]);
  const [editSiteDropdownOpen, setEditSiteDropdownOpen] = useState(false);
  const editSiteDropdownRef = useRef<HTMLDivElement | null>(null);
  const [editCategoryDropdownOpen, setEditCategoryDropdownOpen] = useState(false);
  const editCategoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const [editBrandDropdownOpen, setEditBrandDropdownOpen] = useState(false);
  const editBrandDropdownRef = useRef<HTMLDivElement | null>(null);
  const [editCategoryPath, setEditCategoryPath] = useState<string[]>([]);
  const [editCategoryFilters, setEditCategoryFilters] = useState<string[]>([]);
  const [editBrandFilters, setEditBrandFilters] = useState<string[]>([]);
  const [editSelectedAsins, setEditSelectedAsins] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditCount, setAuditCount] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [logModule, setLogModule] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logUserId, setLogUserId] = useState("");
  const [logKeyword, setLogKeyword] = useState("");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsSummary, setStatsSummary] = useState<PermissionStatsSummary>({
    totalUsers: 0,
    activeToday: 0,
    activeWeek: 0,
    visitCount: 0,
    actionCount: 0,
  });
  const [weeklyTrend, setWeeklyTrend] = useState<TrendRow[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<TrendRow[]>([]);
  const [moduleUsage, setModuleUsage] = useState<ModuleUsageRow[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroupRow[]>([]);
  const [teamGroupsLoading, setTeamGroupsLoading] = useState(false);
  const [teamGroupsError, setTeamGroupsError] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<"create" | "edit">("create");
  const [editingTeamName, setEditingTeamName] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newGroupLeadUserId, setNewGroupLeadUserId] = useState("");
  const [newGroupMemberUserIds, setNewGroupMemberUserIds] = useState<string[]>([]);
  const [newGroupMemberDropdownOpen, setNewGroupMemberDropdownOpen] = useState(false);
  const newGroupMemberTriggerRef = useRef<HTMLDivElement | null>(null);
  const newGroupMemberDropdownRef = useRef<HTMLDivElement | null>(null);
  const [newGroupMemberDropdownPos, setNewGroupMemberDropdownPos] = useState({
    left: 0,
    top: 0,
    width: 0,
  });
  const [newGroupSubmitting, setNewGroupSubmitting] = useState(false);
  const [newGroupError, setNewGroupError] = useState<string | null>(null);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<string | null>(null);
  const [groupDeleteSubmitting, setGroupDeleteSubmitting] = useState(false);
  const [groupDeleteError, setGroupDeleteError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    src: string;
    asin: string;
    left: number;
    top: number;
  } | null>(null);
  const weeklyTrendRef = useRef<HTMLDivElement>(null);
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  const showImagePreview = (rect: DOMRect, src: string, asin: string) => {
    if (!src) return;
    const panelWidth = 320;
    const panelHeight = 360;
    const gap = 12;
    let left = rect.right + gap;
    if (left + panelWidth > window.innerWidth - 12) {
      left = rect.left - panelWidth - gap;
    }
    left = Math.max(12, left);
    let top = rect.top + rect.height / 2 - panelHeight / 2;
    top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));
    setImagePreview({ src, asin, left, top });
  };

  const fetchUsers = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/users/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1000 }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setUsers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError("加载成员失败，请检查后端服务。");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setAuditLoading(true);
    setAuditError(null);
    try {
      const payload: Record<string, unknown> = { limit: 500, offset: 0 };
      if (logModule) payload.module = logModule;
      if (logAction) payload.action = logAction;
      if (logUserId.trim()) payload.userid = logUserId.trim();
      if (logKeyword.trim()) payload.keyword = logKeyword.trim();
      if (logDateFrom) payload.date_from = logDateFrom;
      if (logDateTo) payload.date_to = logDateTo;

      const res = await fetch(`${apiBase}/api/audit-logs/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setAuditLogs(items);
      setAuditCount(typeof data.count === "number" ? data.count : items.length);
    } catch (err) {
      setAuditError("加载操作日志失败，请检查后端服务。");
      setAuditLogs([]);
      setAuditCount(0);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchPermissionStats = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`${apiBase}/api/permission/stats`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const item = data?.item ?? {};
      const summary = item?.summary ?? {};
      const weekly = Array.isArray(item?.weeklyTrend) ? item.weeklyTrend : [];
      const monthly = Array.isArray(item?.monthlyTrend) ? item.monthlyTrend : [];
      const modules = Array.isArray(item?.moduleUsage) ? item.moduleUsage : [];
      const usage = Array.isArray(item?.usageRows) ? item.usageRows : [];

      setStatsSummary({
        totalUsers: Number(summary.totalUsers || 0),
        activeToday: Number(summary.activeToday || 0),
        activeWeek: Number(summary.activeWeek || 0),
        visitCount: Number(summary.visitCount || 0),
        actionCount: Number(summary.actionCount || 0),
      });
      setWeeklyTrend(
        (weekly as PermissionStatsApiRow[]).map((row) => ({
          date: String(row?.date || ""),
          count: Number(row?.count || 0),
        }))
      );
      setMonthlyTrend(
        (monthly as PermissionStatsApiRow[]).map((row) => ({
          date: String(row?.date || ""),
          count: Number(row?.count || 0),
        }))
      );
      setModuleUsage(
        (modules as PermissionStatsApiRow[]).map((row) => ({
          module: String(row?.module || "unknown"),
          count: Number(row?.count || 0),
          ratio: Number(row?.ratio || 0),
        }))
      );
      setUsageRows(
        (usage as PermissionStatsApiRow[]).map((row) => ({
          userid: String(row?.userid || ""),
          name: String(row?.name || row?.userid || ""),
          sevenDays: Number(row?.sevenDays || 0),
          thirtyDays: Number(row?.thirtyDays || 0),
          total: Number(row?.total || 0),
        }))
      );
    } catch (err) {
      setStatsError("加载统计数据失败，请检查后端服务。");
      setStatsSummary({
        totalUsers: 0,
        activeToday: 0,
        activeWeek: 0,
        visitCount: 0,
        actionCount: 0,
      });
      setWeeklyTrend([]);
      setMonthlyTrend([]);
      setModuleUsage([]);
      setUsageRows([]);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchTeamGroups = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setTeamGroupsLoading(true);
    setTeamGroupsError(null);
    try {
      const res = await fetch(`${apiBase}/api/teams`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setTeamGroups(
        items.map((item: any) => ({
          team_name: String(item?.team_name || ""),
          member_count: Number(item?.member_count || 0),
          members: Array.isArray(item?.members)
            ? item.members.map((member: any) => ({
              userid: String(member?.userid || ""),
              username: String(member?.username || ""),
              member_role: String(member?.member_role || ""),
              status: String(member?.status || ""),
            }))
            : [],
        }))
      );
    } catch (err) {
      setTeamGroupsError("加载组信息失败，请检查后端服务。");
      setTeamGroups([]);
    } finally {
      setTeamGroupsLoading(false);
    }
  };

  const resetAuditFilters = () => {
    setLogModule("");
    setLogAction("");
    setLogUserId("");
    setLogKeyword("");
    setLogDateFrom("");
    setLogDateTo("");
  };

  useEffect(() => {
    if (visibleTabs.includes(activeTab)) return;
    setActiveTab("成员");
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab !== "操作日志") return;
    fetchAuditLogs();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "统计") return;
    fetchPermissionStats();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "组") return;
    fetchTeamGroups();
  }, [activeTab]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const visibleUsers = canViewAdminTabs ? users : users.filter((item) => item.role !== "admin");
    return visibleUsers.filter((item) => {
      return (
        !keyword ||
        item.dingtalk_username.toLowerCase().includes(keyword) ||
        item.dingtalk_userid.toLowerCase().includes(keyword)
      );
    });
  }, [users, search, canViewAdminTabs]);
  const filteredTeamGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase();
    if (!keyword) return teamGroups;
    return teamGroups.filter((group) => String(group.team_name || "").toLowerCase().includes(keyword));
  }, [teamGroups, groupSearch]);
  const groupLeadOptions = useMemo(() => {
    return users
      .filter((user) => user.status === "active" && user.role === "team_lead")
      .map((user) => ({
        userid: user.dingtalk_userid,
        username: user.dingtalk_username || user.dingtalk_userid,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [users]);
  const groupMemberOptions = useMemo(() => {
    return users
      .filter((user) => user.status === "active")
      .map((user) => ({
        userid: user.dingtalk_userid,
        username: user.dingtalk_username || user.dingtalk_userid,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [users]);
  const allGroupMembersSelected = groupMemberOptions.length > 0 && newGroupMemberUserIds.length === groupMemberOptions.length;
  const newGroupMembersLabel = useMemo(() => {
    if (allGroupMembersSelected) return "全部成员";
    if (newGroupMemberUserIds.length === 0) return "";
    const names = newGroupMemberUserIds
      .map((userid) => groupMemberOptions.find((item) => item.userid === userid)?.username || "")
      .filter(Boolean);
    if (names.length === 0) return "";
    if (names.length <= 2) return names.join("、");
    return `${names[0]}、${names[1]} 等${names.length}人`;
  }, [allGroupMembersSelected, newGroupMemberUserIds, groupMemberOptions]);
  const groupMembersMap = useMemo(() => {
    const map = new Map<string, TeamMemberRow[]>();
    teamGroups.forEach((group) => {
      map.set(
        group.team_name,
        [...group.members].sort((a, b) => {
          if (a.member_role === b.member_role) {
            return String(a.username || "").localeCompare(String(b.username || ""));
          }
          return a.member_role === "lead" ? -1 : 1;
        })
      );
    });
    return map;
  }, [teamGroups]);

  const stats = useMemo(() => {
    const total = users.length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const teamLeadCount = users.filter((u) => u.role === "team_lead").length;
    const operatorCount = users.filter((u) => u.role === "operator").length;
    return { total, adminCount, teamLeadCount, operatorCount };
  }, [users]);

  useEffect(() => {
    if (activeTab !== "统计" || !weeklyTrendRef.current || weeklyTrend.length === 0) return;

    const chart = echarts.init(weeklyTrendRef.current);
    const option = {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        borderWidth: 0,
        shadowBlur: 10,
        shadowColor: "rgba(0, 0, 0, 0.1)",
        padding: [8, 12],
        textStyle: { color: "#1F2937", fontSize: 12 },
        formatter: (params: unknown) => {
          const normalized = (Array.isArray(params) ? params : [params]) as Array<{
            name?: string;
            value?: string | number;
          }>;
          const item = normalized[0] || {};
          return `
            <div style="font-weight: 600; margin-bottom: 2px;">${item.name}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
              <span style="color: #6B7280;">访问次数</span>
              <span style="font-weight: 500; color: #3B82F6;">${item.value}</span>
            </div>
          `;
        },
      },
      grid: {
        top: 20,
        left: 40,
        right: 15,
        bottom: 25,
        containLabel: false,
      },
      xAxis: {
        type: "category",
        data: weeklyTrend.map((item) => item.date.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#9CA3AF", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#F3F4F6", width: 1 } },
        axisLabel: { color: "#9CA3AF", fontSize: 10 },
      },
      series: [
        {
          data: weeklyTrend.map((item) => item.count),
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          itemStyle: { color: "#3B82F6" },
          lineStyle: { width: 3, color: "#3B82F6" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(59, 130, 246, 0.25)" },
              { offset: 1, color: "rgba(59, 130, 246, 0)" },
            ]),
          },
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [weeklyTrend, activeTab]);

  const topOperators = useMemo(() => usageRows, [usageRows]);
  const visibilityOptions = useMemo(() => {
    const map = new Map<string, ProductOption>();
    productOptions.forEach((item) => {
      map.set(buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE), item);
    });
    editSelectedAsins.forEach((token) => {
      const { asin, site } = splitPermissionKey(token);
      if (!asin) return;
      const key = buildPermissionKey(asin, site);
      if (!map.has(key)) {
        map.set(key, { asin, site, name: "" });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const brandA = String(a.brand || "").trim();
      const brandB = String(b.brand || "").trim();
      const brandCompare = brandA.localeCompare(brandB, undefined, { sensitivity: "base" });
      if (brandCompare !== 0) return brandCompare;
      const asinCompare = String(a.asin || "").localeCompare(String(b.asin || ""), undefined, { sensitivity: "base" });
      if (asinCompare !== 0) return asinCompare;
      return String(a.site || DEFAULT_PERMISSION_SITE).localeCompare(
        String(b.site || DEFAULT_PERMISSION_SITE),
        undefined,
        { sensitivity: "base" }
      );
    });
  }, [productOptions, editSelectedAsins]);
  const addVisibilityOptions = useMemo(() => {
    const map = new Map<string, ProductOption>();
    productOptions.forEach((item) => {
      map.set(buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE), item);
    });
    newUserSelectedAsins.forEach((token) => {
      const { asin, site } = splitPermissionKey(token);
      if (!asin) return;
      const key = buildPermissionKey(asin, site);
      if (!map.has(key)) {
        map.set(key, { asin, site, name: "" });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const brandA = String(a.brand || "").trim();
      const brandB = String(b.brand || "").trim();
      const brandCompare = brandA.localeCompare(brandB, undefined, { sensitivity: "base" });
      if (brandCompare !== 0) return brandCompare;
      const asinCompare = String(a.asin || "").localeCompare(String(b.asin || ""), undefined, { sensitivity: "base" });
      if (asinCompare !== 0) return asinCompare;
      return String(a.site || DEFAULT_PERMISSION_SITE).localeCompare(
        String(b.site || DEFAULT_PERMISSION_SITE),
        undefined,
        { sensitivity: "base" }
      );
    });
  }, [productOptions, newUserSelectedAsins]);
  const filteredVisibilityOptions = useMemo(() => {
    const keyword = permissionSearch.trim().toLowerCase();
    const selectedCategories = new Set(editCategoryFilters);
    const selectedBrands = new Set(editBrandFilters);
    return visibilityOptions.filter((item) => {
      const asin = String(item.asin || "").toLowerCase();
      const name = String(item.name || "").toLowerCase();
      const category = normalizeCategoryToLeaf(item.category);
      const brand = String(item.brand || "").trim();
      const matchesKeyword = !keyword || asin.includes(keyword) || name.includes(keyword);
      const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(category);
      const matchesBrand = selectedBrands.size === 0 || selectedBrands.has(brand);
      return matchesKeyword && matchesCategory && matchesBrand;
    });
  }, [visibilityOptions, permissionSearch, editCategoryFilters, editBrandFilters]);
  const filteredVisibilityKeys = useMemo(() => {
    return filteredVisibilityOptions.map((item) =>
      buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE)
    );
  }, [filteredVisibilityOptions]);
  const filteredAddVisibilityOptions = useMemo(() => {
    const keyword = newPermissionSearch.trim().toLowerCase();
    if (!keyword) return addVisibilityOptions;
    return addVisibilityOptions.filter((item) => {
      const asin = String(item.asin || "").toLowerCase();
      const name = String(item.name || "").toLowerCase();
      return asin.includes(keyword) || name.includes(keyword);
    });
  }, [addVisibilityOptions, newPermissionSearch]);

  const isMemberTab = activeTab === "成员";
  const isGroupTab = activeTab === "组";
  const isStatsTab = activeTab === "统计";
  const isLogTab = activeTab === "操作日志";
  const monthlyTrendMax = Math.max(1, ...monthlyTrend.map((row) => row.count));
  const maxMemberVisits = Math.max(1, ...topOperators.map((row) => row.thirtyDays));
  const fieldLabelClass = "text-sm font-semibold text-[#3D4757] mb-2";
  const staticFieldClass =
    "h-11 rounded-xl border border-[#E9EDF3] bg-[#F4F6FA] px-4 flex items-center text-[#5D6778] font-semibold";
  const permissionEditable = editRole === "operator" || editRole === "team_lead";
  const newPermissionEditable = newUserRole === "operator" || newUserRole === "team_lead";
  const editCategoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        visibilityOptions
          .map((item) => normalizeCategoryToLeaf(item.category))
          .filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [visibilityOptions]);
  const editBrandOptions = useMemo(() => {
    return Array.from(
      new Set(
        visibilityOptions
          .map((item) => String(item.brand || "").trim())
          .filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [visibilityOptions]);

  const loadProductVisibility = async (userid: string) => {
    if (!userid) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`${apiBase}/api/users/${encodeURIComponent(userid)}/product-visibility`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const item = data?.item || {};
      const scope = item?.product_scope === "restricted" ? "restricted" : "all";
      const permissions = Array.isArray(item?.permissions)
        ? item.permissions
          .map((entry: any) => buildPermissionKey(entry?.asin, entry?.site))
          .filter(Boolean)
        : [];
      const asins = permissions.length > 0
        ? permissions
        : (Array.isArray(item?.asins) ? item.asins : []).map((token: string) => {
          const { asin, site } = splitPermissionKey(token);
          return buildPermissionKey(asin, site);
        });
      setEditScope(scope);
      setEditSelectedAsins(asins);
    } catch (err) {
      setEditError("加载产品权限失败，请检查后端服务。");
      setEditScope("all");
      setEditSelectedAsins([]);
    } finally {
      setEditLoading(false);
    }
  };

  const loadProductOptions = async (
    sites: string[],
    setErrorMessage?: (value: string | null) => void
  ) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setProductOptionsLoading(true);
    try {
      const normalizedSites = Array.from(
        new Set(
          (sites || [])
            .map((item) => String(item || "").trim().toUpperCase())
            .filter((item) => bsrSiteOptions.includes(item as (typeof bsrSiteOptions)[number]))
        )
      );
      const targetSites = normalizedSites.length > 0 ? normalizedSites : [...bsrSiteOptions];
      const results = await Promise.allSettled(
        targetSites.map((site) =>
          fetch(`${apiBase}/api/yida-products/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ site, limit: 2000, offset: 0 }),
          })
        )
      );
      const dedup = new Map<string, ProductOption>();
      let hasError = false;

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const fallbackSite = targetSites[index];
        if (result.status !== "fulfilled") {
          hasError = true;
          continue;
        }
        const res = result.value;
        if (!res.ok) {
          hasError = true;
          continue;
        }
        const data = await res.json();
        const items = Array.isArray(data?.items) ? (data.items as ProductQueryRow[]) : [];
        items.forEach((item) => {
          const asin = String(item?.asin || "").toUpperCase().trim();
          if (!asin) return;
          const site = normalizeSite(item?.site || item?.bsr?.site || fallbackSite || DEFAULT_PERMISSION_SITE);
          const name = String(item?.product || item?.name || "").trim();
          const brand = String(item?.brand || item?.bsr?.brand || "").trim();
          const category = String(item?.category || item?.bsr?.category || "").trim();
          const imageUrl = item?.bsr?.image_url || "";
          const key = buildPermissionKey(asin, site);

          const existing = dedup.get(key);
          if (!existing) {
            dedup.set(key, {
              asin,
              name,
              brand,
              category,
              imageUrl,
              site,
            });
            return;
          }
          if (!existing.name && name) existing.name = name;
          if (!existing.brand && brand) existing.brand = brand;
          if (!existing.category && category) existing.category = category;
          if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
        });
      }

      const mapped = Array.from(dedup.values())
        .sort((a, b) => {
          const siteCompare = String(a.site || "").localeCompare(String(b.site || ""));
          if (siteCompare !== 0) return siteCompare;
          return a.asin.localeCompare(b.asin);
        });

      setProductOptions(mapped);
      if (hasError) {
        setErrorMessage?.("部分站点加载可选产品失败，请检查后端服务。");
      } else {
        setErrorMessage?.(null);
      }
    } catch (err) {
      const msg = "加载可选产品失败，请检查后端服务。";
      setErrorMessage?.(msg);
      if (!setErrorMessage) setEditError(msg);
      setProductOptions([]);
    } finally {
      setProductOptionsLoading(false);
    }
  };

  const openEditModal = async (user: UserRow) => {
    const defaultSites = [...bsrSiteOptions];
    setShowEditModal(true);
    setEditUserId(user.dingtalk_userid);
    setEditUserName(user.dingtalk_username);
    setEditRole(user.role === "admin" ? "admin" : user.role === "team_lead" ? "team_lead" : "operator");
    setEditStatus(user.status === "disabled" ? "disabled" : "active");
    setEditScope(user.product_scope === "restricted" ? "restricted" : "all");
    setPermissionSearch("");
    setPermissionSites(defaultSites);
    setEditSiteDropdownOpen(false);
    setEditCategoryDropdownOpen(false);
    setEditBrandDropdownOpen(false);
    setEditCategoryPath([]);
    setEditCategoryFilters([]);
    setEditBrandFilters([]);
    setEditSelectedAsins([]);
    setEditError(null);

    if (user.role === "operator" || user.role === "team_lead") {
      await Promise.all([
        loadProductOptions(defaultSites, setEditError),
        loadProductVisibility(user.dingtalk_userid),
      ]);
    } else {
      await loadProductOptions(defaultSites, setEditError);
    }
  };

  const openAddUserModal = () => {
    const defaultSites = [...bsrSiteOptions];
    setShowAddUser(true);
    setCreateError(null);
    setNewUserId("");
    setNewUserName("");
    setNameLookupLoading(false);
    setNameLookupHint(null);
    setNameLookupError(null);
    setNewUserRole("operator");
    setNewUserStatus("active");
    setNewUserScope("restricted");
    setNewPermissionSearch("");
    setNewPermissionSites(defaultSites);
    setNewSiteDropdownOpen(false);
    setNewUserSelectedAsins([]);
  };

  const closeAddUserModal = () => {
    if (creating) return;
    setShowAddUser(false);
    setImagePreview(null);
    setCreateError(null);
    setNameLookupLoading(false);
    setNameLookupHint(null);
    setNameLookupError(null);
    setNewPermissionSearch("");
    setNewSiteDropdownOpen(false);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setImagePreview(null);
    setPermissionSearch("");
    setEditError(null);
    setEditSiteDropdownOpen(false);
    setEditCategoryDropdownOpen(false);
    setEditBrandDropdownOpen(false);
    setEditCategoryPath([]);
    setEditCategoryFilters([]);
    setEditBrandFilters([]);
  };

  useEffect(() => {
    if (!showEditModal) return;
    loadProductOptions(permissionSites, setEditError);
  }, [showEditModal, permissionSites]);

  useEffect(() => {
    if (!showAddUser) return;
    loadProductOptions(newPermissionSites, setCreateError);
  }, [showAddUser, newPermissionSites]);

  useEffect(() => {
    if (!showAddGroup) return;
    loadProductOptions([...bsrSiteOptions], setNewGroupError);
  }, [showAddGroup]);

  useEffect(() => {
    if (!showEditModal) return;
    if (editScope !== "all") return;
    if (productOptions.length === 0) return;
    const allAsins = productOptions.map((item) =>
      buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE)
    );
    setEditSelectedAsins((prev) => {
      if (
        prev.length === allAsins.length &&
        allAsins.every((asin) => prev.includes(asin))
      ) {
        return prev;
      }
      return allAsins;
    });
  }, [showEditModal, editScope, productOptions]);

  useEffect(() => {
    if (!showAddUser) return;
    if (newUserScope !== "all") return;
    if (productOptions.length === 0) return;
    const allAsins = productOptions.map((item) =>
      buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE)
    );
    setNewUserSelectedAsins((prev) => {
      if (
        prev.length === allAsins.length &&
        allAsins.every((asin) => prev.includes(asin))
      ) {
        return prev;
      }
      return allAsins;
    });
  }, [showAddUser, newUserScope, productOptions]);

  useEffect(() => {
    if (!showEditModal) return;
    if (editRole === "operator" || editRole === "team_lead") return;
    setEditScope("all");
  }, [showEditModal, editRole]);

  useEffect(() => {
    if (!showAddUser) return;
    if (newUserRole === "operator" || newUserRole === "team_lead") return;
    setNewUserScope("all");
  }, [showAddUser, newUserRole]);

  useEffect(() => {
    const hasModal =
      showEditModal ||
      showAddUser ||
      showAddGroup ||
      deleteTarget !== null ||
      groupDeleteTarget !== null;
    if (!hasModal) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showEditModal, showAddUser, showAddGroup, deleteTarget, groupDeleteTarget]);

  useEffect(() => {
    if (!showEditModal && !showAddUser && !showAddGroup) {
      setImagePreview(null);
    }
  }, [showEditModal, showAddUser, showAddGroup]);

  useEffect(() => {
    if (!newGroupMemberDropdownOpen) return;
    const updateDropdownPosition = () => {
      const trigger = newGroupMemberTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(220, rect.width);
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const left = Math.min(Math.max(8, rect.left), maxLeft);
      const top = rect.bottom + 6;
      setNewGroupMemberDropdownPos({ left, top, width });
    };
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [newGroupMemberDropdownOpen]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (
        newSiteDropdownRef.current &&
        !newSiteDropdownRef.current.contains(event.target as Node)
      ) {
        setNewSiteDropdownOpen(false);
      }
      if (
        editSiteDropdownRef.current &&
        !editSiteDropdownRef.current.contains(event.target as Node)
      ) {
        setEditSiteDropdownOpen(false);
      }
      if (
        editCategoryDropdownRef.current &&
        !editCategoryDropdownRef.current.contains(event.target as Node)
      ) {
        setEditCategoryDropdownOpen(false);
      }
      if (
        editBrandDropdownRef.current &&
        !editBrandDropdownRef.current.contains(event.target as Node)
      ) {
        setEditBrandDropdownOpen(false);
      }
      if (
        newGroupMemberTriggerRef.current &&
        !newGroupMemberTriggerRef.current.contains(event.target as Node) &&
        !newGroupMemberDropdownRef.current?.contains(event.target as Node)
      ) {
        setNewGroupMemberDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  useEffect(() => {
    setEditBrandFilters((prev) =>
      prev.filter((item) => editBrandOptions.includes(item))
    );
  }, [editBrandOptions]);

  const saveEditModal = async () => {
    if (!editUserId) {
      setEditError("缺少成员ID，无法保存。");
      return;
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setEditSaving(true);
    setEditError(null);
    try {
      const updateRes = await fetch(`${apiBase}/api/users/${encodeURIComponent(editUserId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole, status: editStatus }),
      });
      if (!updateRes.ok) {
        throw new Error(`HTTP ${updateRes.status}`);
      }

      let scopeForList: "all" | "restricted" = "all";
      if (editRole === "operator" || editRole === "team_lead") {
        const normalizedAsins = Array.from(
          new Set(
            editSelectedAsins
              .map((item) => {
                const { asin, site } = splitPermissionKey(String(item || ""));
                return buildPermissionKey(asin, site);
              })
              .filter(Boolean)
          )
        );
        const totalOptions = productOptions.length;
        const selectedAll =
          totalOptions > 0 &&
          productOptions.every((item) =>
            normalizedAsins.includes(buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE))
          );
        const scope: "all" | "restricted" =
          selectedAll || (totalOptions === 0 && editScope === "all")
            ? "all"
            : "restricted";
        const asins = scope === "all" ? [] : normalizedAsins;
        const visibilityRes = await fetch(`${apiBase}/api/users/${encodeURIComponent(editUserId)}/product-visibility`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_scope: scope,
            asins,
          }),
        });
        if (!visibilityRes.ok) {
          throw new Error(`HTTP ${visibilityRes.status}`);
        }
        scopeForList = scope;
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.dingtalk_userid === editUserId
            ? { ...item, role: editRole, status: editStatus, product_scope: scopeForList }
            : item
        )
      );
      setShowEditModal(false);
      setImagePreview(null);
    } catch (err) {
      setEditError("保存失败，请检查后端服务。");
    } finally {
      setEditSaving(false);
    }
  };

  const createUser = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    const username = newUserName.trim();
    if (!username) {
      setCreateError("请填写成员姓名。");
      return;
    }
    setCreating(true);
    setCreateError(null);
    setNameLookupError(null);
    setNameLookupHint(null);
    setNameLookupLoading(true);
    try {
      const lookupRes = await fetch(`${apiBase}/api/users/dingtalk/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: username, limit: 8 }),
      });
      const lookupData = await lookupRes.json().catch(() => ({}));
      if (!lookupRes.ok || !lookupData?.ok) {
        const lookupMessage = lookupData?.error?.message || lookupData?.detail || `HTTP ${lookupRes.status}`;
        throw new Error(`姓名查询失败：${lookupMessage}`);
      }
      const matchedItems: DingTalkLookupItem[] = Array.isArray(lookupData?.items)
        ? (lookupData.items as DingTalkLookupResponseItem[])
          .map((item) => ({
            userid: String(item?.userid || "").trim(),
            name: String(item?.name || "").trim(),
          }))
          .filter((item: DingTalkLookupItem) => Boolean(item.userid))
        : [];
      if (matchedItems.length === 0) {
        throw new Error("未找到该成员姓名对应的钉钉账号。");
      }
      const exact = matchedItems.find((item) => item.name === username);
      const selected = exact || matchedItems[0];
      const userid = selected.userid;
      setNewUserId(userid);
      setNameLookupHint(
        matchedItems.length === 1
          ? `已匹配成员ID：${userid}`
          : `匹配到${matchedItems.length}个成员，创建时使用ID：${userid}`
      );

      const res = await fetch(`${apiBase}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dingtalk_userid: userid,
          dingtalk_username: username,
          role: newUserRole,
          status: newUserStatus,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      let scopeForList: "all" | "restricted" =
        newUserRole === "operator" || newUserRole === "team_lead" ? "restricted" : "all";
      if (newUserRole === "operator" || newUserRole === "team_lead") {
        const normalizedAsins = Array.from(
          new Set(
            newUserSelectedAsins
              .map((item) => {
                const { asin, site } = splitPermissionKey(String(item || ""));
                return buildPermissionKey(asin, site);
              })
              .filter(Boolean)
          )
        );
        const totalOptions = productOptions.length;
        const selectedAll =
          totalOptions > 0 &&
          productOptions.every((item) =>
            normalizedAsins.includes(buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE))
          );
        const scope: "all" | "restricted" =
          selectedAll || (totalOptions === 0 && newUserScope === "all")
            ? "all"
            : "restricted";
        const asins = scope === "all" ? [] : normalizedAsins;
        const visibilityRes = await fetch(`${apiBase}/api/users/${encodeURIComponent(userid)}/product-visibility`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_scope: scope,
            asins,
          }),
        });
        if (!visibilityRes.ok) {
          throw new Error(`HTTP ${visibilityRes.status}`);
        }
        scopeForList = scope;
      }

      const data = await res.json();
      const item = data?.item;
      if (item) {
        setUsers((prev) => [{ ...(item as UserRow), product_scope: scopeForList }, ...prev]);
      } else {
        setUsers((prev) => [
          {
            dingtalk_userid: userid,
            dingtalk_username: username,
            role: newUserRole,
            status: newUserStatus,
            product_scope: scopeForList,
          },
          ...prev,
        ]);
      }
      setShowAddUser(false);
      setImagePreview(null);
      setNewUserId("");
      setNewUserName("");
      setNameLookupLoading(false);
      setNameLookupHint(null);
      setNameLookupError(null);
      setNewUserRole("operator");
      setNewUserStatus("active");
      setNewUserScope("restricted");
      setNewPermissionSearch("");
      setNewUserSelectedAsins([]);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "新增成员失败，请检查后端服务。";
      setCreateError(message);
      setNameLookupError(message.includes("未找到") ? message : null);
      setNameLookupHint(null);
    } finally {
      setNameLookupLoading(false);
      setCreating(false);
    }
  };

  const requestDeleteUser = (user: UserRow) => {
    setDeleteTarget(user);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const toggleSelectedAsin = (asin: string, checked: boolean) => {
    setEditSelectedAsins((prev) => {
      if (checked) {
        if (prev.includes(asin)) return prev;
        return [...prev, asin];
      }
      return prev.filter((item) => item !== asin);
    });
  };

  const toggleNewSelectedAsin = (asin: string, checked: boolean) => {
    setNewUserSelectedAsins((prev) => {
      if (checked) {
        if (prev.includes(asin)) return prev;
        return [...prev, asin];
      }
      return prev.filter((item) => item !== asin);
    });
  };

  const normalizeSiteList = (sites: string[]) =>
    Array.from(
      new Set(
        sites
          .map((item) => String(item || "").trim().toUpperCase())
          .filter((item) => bsrSiteOptions.includes(item as (typeof bsrSiteOptions)[number]))
      )
    );

  const allNewSitesSelected = normalizeSiteList(newPermissionSites).length === bsrSiteOptions.length;
  const allEditSitesSelected = normalizeSiteList(permissionSites).length === bsrSiteOptions.length;

  const newSitesLabel = allNewSitesSelected
    ? "全部站点"
    : normalizeSiteList(newPermissionSites).join(",");
  const editSitesLabel = allEditSitesSelected
    ? "全部站点"
    : normalizeSiteList(permissionSites).join(",");
  const editBrandLabel =
    editBrandFilters.length === 0
      ? "全部品牌"
      : editBrandFilters.join(",");

  const toggleNewSite = (site: string) => {
    setNewPermissionSites((prev) => {
      const normalized = normalizeSiteList(prev);
      if (normalized.includes(site)) {
        if (normalized.length === 1) return normalized;
        return normalized.filter((item) => item !== site);
      }
      return [...normalized, site];
    });
  };

  const toggleEditSite = (site: string) => {
    setPermissionSites((prev) => {
      const normalized = normalizeSiteList(prev);
      if (normalized.includes(site)) {
        if (normalized.length === 1) return normalized;
        return normalized.filter((item) => item !== site);
      }
      return [...normalized, site];
    });
  };

  const toggleEditBrand = (brand: string) => {
    setEditBrandFilters((prev) => {
      if (prev.includes(brand)) {
        return prev.filter((item) => item !== brand);
      }
      return [...prev, brand];
    });
  };

  const openAddGroupModal = () => {
    setGroupModalMode("create");
    setEditingTeamName("");
    setShowAddGroup(true);
    setNewGroupCode("");
    setNewGroupLeadUserId("");
    setNewGroupMemberUserIds([]);
    setNewGroupMemberDropdownOpen(false);
    setNewGroupError(null);
  };

  const openEditGroupModal = (group: TeamGroupRow) => {
    const members = Array.isArray(group.members) ? group.members : [];
    const leadMember = members.find((member) => member.member_role === "lead");
    setGroupModalMode("edit");
    setEditingTeamName(group.team_name);
    setShowAddGroup(true);
    setNewGroupCode(group.team_name);
    setNewGroupLeadUserId(leadMember?.userid || "");
    setNewGroupMemberUserIds(
      Array.from(
        new Set(
          members
            .map((member) => String(member.userid || "").trim())
            .filter(Boolean)
        )
      )
    );
    setNewGroupMemberDropdownOpen(false);
    setNewGroupError(null);
  };

  const closeAddGroupModal = () => {
    if (newGroupSubmitting) return;
    setShowAddGroup(false);
    setGroupModalMode("create");
    setEditingTeamName("");
    setNewGroupMemberDropdownOpen(false);
    setNewGroupError(null);
  };

  const toggleNewGroupMember = (userid: string) => {
    setNewGroupMemberUserIds((prev) => {
      if (prev.includes(userid)) {
        return prev.filter((item) => item !== userid);
      }
      return [...prev, userid];
    });
  };

  const submitAddGroup = async () => {
    const teamCode = newGroupCode.trim();
    const leadUserId = newGroupLeadUserId.trim();
    if (!teamCode) {
      setNewGroupError("组名不能为空。");
      return;
    }
    if (!leadUserId) {
      setNewGroupError("请选择组长。");
      return;
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setNewGroupSubmitting(true);
    setNewGroupError(null);
    try {
      const payloadMembers = Array.from(new Set([leadUserId, ...newGroupMemberUserIds]));
      const isEditMode = groupModalMode === "edit";
      const targetTeamName = isEditMode ? editingTeamName : teamCode;
      const res = await fetch(
        isEditMode
          ? `${apiBase}/api/teams/${encodeURIComponent(targetTeamName)}`
          : `${apiBase}/api/teams`,
        {
          method: isEditMode ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEditMode ? { new_team_name: teamCode } : { team_name: teamCode }),
            lead_userid: leadUserId,
            member_userids: payloadMembers,
          }),
        }
      );
      if (!res.ok) {
        let detail = "";
        try {
          const data = await res.json();
          detail = String(data?.detail || "");
        } catch {
          // ignore
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      setShowAddGroup(false);
      setGroupModalMode("create");
      setEditingTeamName("");
      await fetchTeamGroups();
    } catch (err) {
      const fallback = groupModalMode === "edit" ? "修改组失败，请稍后重试。" : "新增组失败，请稍后重试。";
      const message = err instanceof Error ? err.message : fallback;
      setNewGroupError(message || fallback);
    } finally {
      setNewGroupSubmitting(false);
    }
  };

  const requestDeleteGroup = (teamName: string) => {
    const target = String(teamName || "").trim();
    if (!target) return;
    setGroupDeleteTarget(target);
    setGroupDeleteError(null);
  };

  const closeDeleteGroupModal = () => {
    if (groupDeleteSubmitting) return;
    setGroupDeleteTarget(null);
    setGroupDeleteError(null);
  };

  const confirmDeleteGroup = async () => {
    if (!groupDeleteTarget) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setGroupDeleteSubmitting(true);
    setGroupDeleteError(null);
    try {
      const res = await fetch(`${apiBase}/api/teams/${encodeURIComponent(groupDeleteTarget)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setGroupDeleteTarget(null);
      await fetchTeamGroups();
    } catch (err) {
      setGroupDeleteError("删除组失败，请检查后端服务。");
    } finally {
      setGroupDeleteSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${apiBase}/api/users/${encodeURIComponent(deleteTarget.dingtalk_userid)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setUsers((prev) => prev.filter((item) => item.dingtalk_userid !== deleteTarget.dingtalk_userid));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError("删除成员失败，请检查后端服务。");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <main className={`flex-1 ${collapsed ? "ml-20" : "ml-56"} p-8 transition-all duration-300`}>
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
          <span className="text-gray-900 font-medium">Permissions</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
            onClick={handleToggleFullscreen}
            title="全屏"
          >
            <CornersOut size={18} />
          </button>
        </div>
      </header>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-6 text-sm">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                className={`pb-2 ${tab === activeTab
                  ? "text-gray-900 font-semibold border-b-2 border-blue-500"
                  : "text-gray-400 hover:text-gray-600"
                  }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {isMemberTab && null}
            {isGroupTab && null}
            {isLogTab && (
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
              >
                刷新
              </button>
            )}
          </div>
        </div>
      </div>

      {isMemberTab && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {[
            { label: "成员总数", value: String(stats.total), icon: <UsersThree size={18} />, tone: "bg-[#1C1C1E] text-white" },
            { label: "管理员", value: String(stats.adminCount), icon: <UsersThree size={18} />, tone: "bg-[#3B9DF8] text-white" },
            { label: "运营组长", value: String(stats.teamLeadCount), icon: <UsersThree size={18} />, tone: "bg-[#1C1C1E] text-white" },
            { label: "运营人员", value: String(stats.operatorCount), icon: <CheckCircle size={18} />, tone: "bg-[#3B9DF8] text-white" },
          ].map((item) => (
            <div key={item.label} className={`p-6 rounded-3xl shadow-lg ${item.tone} card-hover-lift`}>
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium opacity-90">{item.label}</span>
                <div className="bg-white/10 p-1 rounded text-xs">{item.icon}</div>
              </div>
              <div className="flex justify-between items-end">
                <h2 className="text-3xl font-semibold">{item.value}</h2>
                <span className="text-xs font-medium opacity-80">本周</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {isMemberTab && (
        <section className="bg-white p-5 rounded-3xl shadow-sm mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">成员列表</h3>
            <div className="flex items-center gap-2">
              <div className="relative w-[300px]">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <FormInput
                  size="sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索用户ID/成员名"
                  className="pl-9"
                />
              </div>
              <button
                className="h-[34px] min-w-[86px] px-2.5 rounded-lg bg-[#0C1731] hover:bg-[#162443] text-white text-xs font-semibold flex items-center justify-center whitespace-nowrap shrink-0 shadow-sm transition"
                onClick={openAddUserModal}
              >
                新增成员
              </button>
            </div>
          </div>
          {loading && (
            <div className="py-8 text-center text-xs text-gray-400">正在加载成员...</div>
          )}
          {!loading && error && (
            <div className="py-8 text-center text-xs text-red-500">{error}</div>
          )}
          <table className="w-full text-sm text-center table-fixed">
            <thead className="text-gray-400 font-normal text-xs">
              <tr>
                <th className="font-normal py-3 px-2 w-[170px] text-left">用户ID</th>
                <th className="font-normal py-3 px-2 w-[170px]">成员</th>
                <th className="font-normal py-3 px-2 w-[110px]">角色</th>
                <th className="font-normal py-3 px-2 w-[110px]">状态</th>
                <th className="font-normal py-3 px-2 w-[130px]">产品权限</th>
                <th className="font-normal py-3 px-2 w-[180px]">最近活动</th>
                <th className="font-normal py-3 px-2 w-[120px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!loading && !error && filteredUsers.map((item) => (
                <tr key={item.dingtalk_userid} className="hover:bg-gray-50 transition">
                  <td className="py-4 px-2 text-sm text-gray-900 font-medium text-left">{item.dingtalk_userid}</td>
                  <td className="py-4 px-2 text-center">
                    <div className="font-medium text-gray-900">{item.dingtalk_username}</div>
                  </td>
                  <td className="py-4 px-2 text-gray-900">{roleLabel(item.role)}</td>
                  <td className="py-4 px-2">
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold ${item.status === "active"
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-100 text-gray-500"
                        }`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="py-4 px-2">
                    {item.role === "admin" ? (
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600">
                        全部可见
                      </span>
                    ) : item.role === "operator" || item.role === "team_lead" ? (
                      <span
                        className={`px-2 py-1 rounded-full text-[10px] font-bold ${item.product_scope === "restricted"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-600"
                          }`}
                      >
                        {item.product_scope === "restricted" ? "指定可见" : "全部可见"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="py-4 px-2 text-black text-xs">{formatDateTime(item.last_active_at)}</td>
                  <td className="py-4 px-2 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button className="text-xs text-blue-600 font-semibold" onClick={() => openEditModal(item)}>
                        编辑
                      </button>
                      <button className="text-xs text-red-500 font-semibold" onClick={() => requestDeleteUser(item)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isGroupTab && (
        <section className="bg-white p-5 rounded-3xl shadow-sm mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">组列表</h3>
            <div className="flex items-center gap-2">
              <div className="relative w-[300px]">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <FormInput
                  size="sm"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="搜索组名"
                  className="pl-9"
                />
              </div>
              {canViewAdminTabs && (
                <button
                  className="h-[34px] min-w-[86px] px-2.5 rounded-lg bg-[#0C1731] hover:bg-[#162443] text-white text-xs font-semibold flex items-center justify-center whitespace-nowrap shrink-0 shadow-sm transition"
                  onClick={openAddGroupModal}
                >
                  新增组
                </button>
              )}
            </div>
          </div>
          {teamGroupsLoading && (
            <div className="py-8 text-center text-xs text-gray-400">正在加载组信息...</div>
          )}
          {!teamGroupsLoading && teamGroupsError && (
            <div className="py-8 text-center text-xs text-red-500">{teamGroupsError}</div>
          )}
          <table className="w-full text-sm text-center table-fixed">
            <thead className="text-gray-400 font-normal text-xs">
              <tr>
                <th className="font-normal py-3 px-2 w-[180px] text-left">组名</th>
                <th className="font-normal py-3 px-2 w-[160px] text-left">组长</th>
                <th className="font-normal py-3 px-2 w-[120px] text-left">状态</th>
                <th className="font-normal py-3 px-2 w-[120px] text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!teamGroupsLoading && !teamGroupsError && filteredTeamGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-gray-400">
                    暂无组数据
                  </td>
                </tr>
              )}
              {!teamGroupsLoading && !teamGroupsError &&
                filteredTeamGroups.map((group) => {
                  const members = groupMembersMap.get(group.team_name) || [];
                  const leaderMember = members.find((member) => member.member_role === "lead");
                  const leaderName = leaderMember?.username || "-";
                  const leaderStatus = leaderMember?.status || "";
                  return (
                    <tr key={group.team_name} className="hover:bg-gray-50 transition align-top">
                      <td className="py-4 px-2 text-sm text-gray-900 font-medium text-left">{group.team_name}</td>
                      <td className="py-4 px-2 text-sm text-gray-700 text-left">{leaderName}</td>
                      <td className="py-4 px-2 text-left">
                        {leaderMember ? (
                          <span
                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${leaderStatus === "active"
                              ? "bg-green-100 text-green-600"
                              : "bg-gray-100 text-gray-500"
                              }`}
                          >
                            {leaderStatus === "active" ? "Active" : "Paused"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-2 text-left">
                        {canViewAdminTabs ? (
                          <div className="flex items-center gap-3">
                            <button
                              className="text-xs text-blue-600 font-semibold"
                              onClick={() => openEditGroupModal(group)}
                            >
                              编辑
                            </button>
                            <button
                              className="text-xs text-red-500 font-semibold"
                              onClick={() => requestDeleteGroup(group.team_name)}
                            >
                              删除
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}

      {isStatsTab && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {[
              { label: "访问总数", value: String(statsSummary.actionCount), icon: <UsersThree size={18} />, tone: "bg-[#1C1C1E] text-white", period: "累计" },
              { label: "今日活跃", value: String(statsSummary.activeToday), icon: <CheckCircle size={18} />, tone: "bg-[#3B9DF8] text-white", period: "今日" },
              { label: "本周活跃", value: String(statsSummary.activeWeek), icon: <CheckCircle size={18} />, tone: "bg-[#1C1C1E] text-white", period: "本周" },
              { label: "近30天访问", value: String(statsSummary.visitCount), icon: <UsersThree size={18} />, tone: "bg-[#3B9DF8] text-white", period: "近30天" },
            ].map((item) => (
              <div key={item.label} className={`p-6 rounded-3xl shadow-lg ${item.tone} card-hover-lift`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium opacity-90">{item.label}</span>
                  <div className="bg-white/10 p-1 rounded text-xs">{item.icon}</div>
                </div>
                <div className="flex justify-between items-end">
                  <h2 className="text-3xl font-semibold">{item.value}</h2>
                  <span className="text-xs font-medium opacity-80">{item.period}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white p-5 rounded-3xl shadow-sm mb-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">近30天使用趋势</h3>
            </div>
            {statsLoading && (
              <div className="py-8 text-center text-xs text-gray-400">正在加载统计...</div>
            )}
            {!statsLoading && statsError && (
              <div className="py-8 text-center text-xs text-red-500">{statsError}</div>
            )}
            {!statsLoading && !statsError && (
              <div className="overflow-x-auto custom-scrollbar-thin pb-2">
                <div className="flex items-end gap-2 h-36 min-w-[1080px]">
                  {monthlyTrend.map((item) => {
                    const normalizedHeight = (item.count / monthlyTrendMax) * 120;
                    const height = item.count > 0 ? Math.max(6, normalizedHeight) : 0;
                    return (
                      <div key={item.date} className="flex-1 min-w-[28px] flex flex-col items-center gap-2">
                        <div className="relative w-full group">
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                            访问次数: {item.count}
                          </div>
                          <div className="w-full bg-blue-100 rounded-md flex items-end" style={{ height: 120 }}>
                            {height > 0 && <div className="w-full bg-blue-500 rounded-md" style={{ height }} />}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400">{item.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[860px_1fr] gap-6 mb-6">
            <div className="bg-white p-5 rounded-3xl shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">近7天使用趋势</h3>
              </div>
              {statsLoading && (
                <div className="py-8 text-center text-xs text-gray-400">正在加载统计...</div>
              )}
              {!statsLoading && statsError && (
                <div className="py-8 text-center text-xs text-red-500">{statsError}</div>
              )}
              {!statsLoading && !statsError && (
                <div>
                  <div ref={weeklyTrendRef} className="h-44 w-full" />
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">模块使用分布</h3>
                <span className="text-xs text-gray-400">近30天</span>
              </div>
              {statsLoading && (
                <div className="py-8 text-center text-xs text-gray-400">正在加载统计...</div>
              )}
              {!statsLoading && statsError && (
                <div className="py-8 text-center text-xs text-red-500">{statsError}</div>
              )}
              {!statsLoading && !statsError && (
                <div className="space-y-4">
                  {moduleUsage.length === 0 && (
                    <div className="text-xs text-gray-400">暂无数据</div>
                  )}
                  {moduleUsage.map((item) => (
                    <div key={item.module}>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{moduleLabel(item.module)}</span>
                        <span>{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${Math.round(item.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[860px_1fr] gap-6 mb-6">
            <div className="bg-white p-5 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">使用情况</h3>
              </div>
              {statsLoading && (
                <div className="py-8 text-center text-xs text-gray-400">正在加载统计...</div>
              )}
              {!statsLoading && statsError && (
                <div className="py-8 text-center text-xs text-red-500">{statsError}</div>
              )}
              {!statsLoading && !statsError && (
                <table className="w-full text-sm text-center">
                  <thead className="text-gray-400 font-normal text-xs">
                    <tr>
                      <th className="font-normal py-2">成员</th>
                      <th className="font-normal py-2">近7天访问次数</th>
                      <th className="font-normal py-2">近30天访问次数</th>
                      <th className="font-normal py-2">总访问次数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usageRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-gray-400">
                          暂无数据
                        </td>
                      </tr>
                    )}
                    {usageRows.map((item) => (
                      <tr key={item.userid} className="hover:bg-gray-50 transition">
                        <td className="py-3 text-gray-900 font-medium">{item.name}</td>
                        <td className="py-3 text-gray-700">{item.sevenDays}</td>
                        <td className="py-3 text-gray-700">{item.thirtyDays}</td>
                        <td className="py-3 text-gray-700">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">访问排行</h3>
                <span className="text-xs text-gray-400">近30天</span>
              </div>
              {statsLoading && (
                <div className="py-8 text-center text-xs text-gray-400">正在加载统计...</div>
              )}
              {!statsLoading && statsError && (
                <div className="py-8 text-center text-xs text-red-500">{statsError}</div>
              )}
              {!statsLoading && !statsError && (
                <div className="space-y-4">
                  {topOperators.length === 0 && (
                    <div className="text-xs text-gray-400">暂无数据</div>
                  )}
                  {topOperators.map((item) => (
                    <div key={`rank-${item.userid}`}>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span className="truncate pr-2">{item.name}</span>
                        <span>{item.thirtyDays}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${Math.round((item.thirtyDays / maxMemberVisits) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {isLogTab && (
        <section className="bg-white p-5 rounded-3xl shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">操作日志</h3>
            <div className="text-xs text-gray-400">共 {auditCount} 条</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <FormSelect
              size="sm"
              className="w-auto text-gray-600 font-medium"
              value={logModule}
              onChange={(e) => setLogModule(e.target.value)}
            >
              <option value="">全部模块</option>
              <option value="strategy">策略</option>
              <option value="bsr">Best Sellers</option>
              <option value="product">产品</option>
              <option value="user">用户</option>
              <option value="permission">权限</option>
            </FormSelect>
            <FormSelect
              size="sm"
              className="w-auto text-gray-600 font-medium"
              value={logAction}
              onChange={(e) => setLogAction(e.target.value)}
            >
              <option value="">全部动作</option>
              <option value="create">创建</option>
              <option value="update">更新</option>
              <option value="delete">删除</option>
              <option value="update_state">更新状态</option>
              <option value="update_tags">更新标签</option>
              <option value="update_mapping">更新映射</option>
            </FormSelect>
            <FormInput
              size="sm"
              placeholder="操作者ID"
              className="w-32 text-gray-600"
              value={logUserId}
              onChange={(e) => setLogUserId(e.target.value)}
            />
            <FormInput
              size="sm"
              placeholder="关键词"
              className="w-32 text-gray-600"
              value={logKeyword}
              onChange={(e) => setLogKeyword(e.target.value)}
            />
            <div className="w-32">
              <AppDatePicker
                size="sm"
                value={logDateFrom}
                onChange={(val) => setLogDateFrom(val)}
                placeholder="开始日期"
                align="left"
              />
            </div>
            <span className="text-xs text-gray-400">~</span>
            <div className="w-32">
              <AppDatePicker
                size="sm"
                value={logDateTo}
                onChange={(val) => setLogDateTo(val)}
                placeholder="结束日期"
                align="left"
              />
            </div>
            <button
              className="px-4 py-2 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg"
              onClick={fetchAuditLogs}
              disabled={auditLoading}
            >
              查询
            </button>
            <button
              className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              onClick={resetAuditFilters}
              disabled={auditLoading}
            >
              重置
            </button>
          </div>
          {auditLoading && (
            <div className="py-8 text-center text-xs text-gray-400">正在加载日志...</div>
          )}
          {!auditLoading && auditError && (
            <div className="py-8 text-center text-xs text-red-500">{auditError}</div>
          )}
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-normal text-xs">
              <tr>
                <th className="font-normal py-2">时间</th>
                <th className="font-normal py-2">操作者</th>
                <th className="font-normal py-2">模块</th>
                <th className="font-normal py-2">动作</th>
                <th className="font-normal py-2">目标</th>
                <th className="font-normal py-2">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-gray-400">
                    暂无日志
                  </td>
                </tr>
              )}
              {!auditLoading && !auditError && auditLogs.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition">
                  <td className="py-3 text-xs text-gray-500">{row.created_at || "-"}</td>
                  <td className="py-3">
                    <div className="text-gray-900 font-medium text-sm">{row.operator_name || "-"}</div>
                    <div className="text-xs text-gray-400">{row.operator_userid || "-"}</div>
                  </td>
                  <td className="text-gray-700">{moduleLabel(row.module)}</td>
                  <td className="text-gray-700">{actionLabel(row.action)}</td>
                  <td className="text-gray-700">{row.target_id || "-"}</td>
                  <td className="text-gray-500 text-xs max-w-[320px] truncate">{row.detail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {showAddGroup && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] shadow-[0_12px_40px_rgba(15,23,42,0.14)] w-full max-w-2xl p-5 md:p-6 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">{groupModalMode === "edit" ? "编辑组" : "新增组"}</h3>
              <button
                className="text-[30px] leading-none text-[#C3CAD5] hover:text-[#7F8A9B]"
                onClick={closeAddGroupModal}
                disabled={newGroupSubmitting}
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <div>
                <div className={fieldLabelClass}>组名</div>
                <FormInput
                  value={newGroupCode}
                  onChange={(e) => setNewGroupCode(e.target.value)}
                  placeholder={groupModalMode === "edit" ? "" : "例如：运营组A"}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={newGroupSubmitting}
                />
              </div>
              <div>
                <div className={fieldLabelClass}>组长</div>
                <FormSelect
                  value={newGroupLeadUserId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewGroupLeadUserId(value);
                    if (value) {
                      setNewGroupMemberUserIds((prev) => (prev.includes(value) ? prev : [...prev, value]));
                    }
                  }}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={newGroupSubmitting}
                >
                  <option value="">请选择组长</option>
                  {groupLeadOptions.map((item) => (
                    <option key={item.userid} value={item.userid}>
                      {item.username}
                    </option>
                  ))}
                </FormSelect>
              </div>
            </div>

            <div className="mb-5">
              <div className={fieldLabelClass}>组成员</div>
              <div className="relative w-full" ref={newGroupMemberTriggerRef}>
                <button
                  type="button"
                  onClick={() => setNewGroupMemberDropdownOpen((prev) => !prev)}
                  disabled={newGroupSubmitting}
                  className="w-full h-11 px-3 rounded-xl bg-[#F4F6FA] border border-[#E9EDF3] text-[13px] text-[#3D4757] font-medium flex items-center justify-between hover:border-[#D5DBE6] disabled:opacity-60"
                >
                  <span className="truncate">{newGroupMembersLabel || "请选择组成员"}</span>
                  <CaretDown
                    size={14}
                    className={`text-[#7A8596] transition-transform ${newGroupMemberDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              <div className="mt-2 text-xs text-[#7A8596]">
                已选 {newGroupMemberUserIds.length} 人
              </div>
            </div>

            {newGroupError && (
              <div className="mb-4 text-sm text-red-500">{newGroupError}</div>
            )}

            <div className="flex items-center justify-end gap-3 mt-5 border-t border-[#EEF1F5] pt-4">
              <button
                className="h-11 w-24 text-sm font-semibold text-[#6B7280] hover:bg-[#F5F7FA] rounded-lg transition"
                onClick={closeAddGroupModal}
                disabled={newGroupSubmitting}
              >
                取消
              </button>
              <button
                className="h-11 w-24 text-sm font-semibold text-white bg-[#0C1731] hover:bg-[#081022] rounded-lg disabled:opacity-60 transition shadow-sm"
                onClick={submitAddGroup}
                disabled={newGroupSubmitting}
              >
                {newGroupSubmitting
                  ? (groupModalMode === "edit" ? "保存中..." : "创建中...")
                  : (groupModalMode === "edit" ? "保存" : "创建组")}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddGroup && newGroupMemberDropdownOpen && createPortal(
        <div
          ref={newGroupMemberDropdownRef}
          style={{
            position: "fixed",
            left: newGroupMemberDropdownPos.left,
            top: newGroupMemberDropdownPos.top,
            width: newGroupMemberDropdownPos.width,
          }}
          className="z-[70] rounded-xl border border-[#E6EBF2] bg-white shadow-lg p-2 max-h-64 overflow-y-auto"
        >
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0C1731]"
              checked={allGroupMembersSelected}
              onChange={() =>
                setNewGroupMemberUserIds(
                  allGroupMembersSelected ? [] : groupMemberOptions.map((item) => item.userid)
                )
              }
            />
            全部成员
          </label>
          <div className="my-1 h-px bg-[#EEF2F7]" />
          {groupMemberOptions.map((item) => (
            <label
              key={`group-member-${item.userid}`}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0C1731]"
                checked={newGroupMemberUserIds.includes(item.userid)}
                onChange={() => toggleNewGroupMember(item.userid)}
              />
              {item.username}
            </label>
          ))}
        </div>,
        document.body
      )}

      {showAddUser && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] shadow-[0_12px_40px_rgba(15,23,42,0.14)] w-full max-w-5xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-7">
              <h3 className="text-lg font-bold text-gray-900">新增成员</h3>
              <button
                className="text-[30px] leading-none text-[#C3CAD5] hover:text-[#7F8A9B]"
                onClick={closeAddUserModal}
                disabled={creating}
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <div>
                <div className={fieldLabelClass}>成员ID</div>
                <FormInput
                  value={newUserId}
                  placeholder="创建时自动匹配"
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#EEF2F7] text-[#8A94A6] font-semibold"
                  disabled
                  readOnly
                />
              </div>
              <div>
                <div className={fieldLabelClass}>成员姓名</div>
                <FormInput
                  value={newUserName}
                  onChange={(e) => {
                    setNewUserName(e.target.value);
                    setNewUserId("");
                    setNameLookupError(null);
                    setNameLookupHint(null);
                  }}
                  placeholder="请输入成员姓名"
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={creating}
                />
                <div className="mt-1 min-h-[18px] text-xs">
                  {nameLookupLoading && <span className="text-gray-400">正在根据姓名匹配成员ID...</span>}
                  {!nameLookupLoading && nameLookupError && <span className="text-red-500">{nameLookupError}</span>}
                  {!nameLookupLoading && !nameLookupError && nameLookupHint && (
                    <span className="text-[#6A7383]">{nameLookupHint}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              <div>
                <div className={fieldLabelClass}>角色</div>
                <FormSelect
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as "admin" | "team_lead" | "operator")}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={creating}
                >
                  <option value="admin">管理员</option>
                  <option value="team_lead">运营组长</option>
                  <option value="operator">运营人员</option>
                </FormSelect>
              </div>
              <div>
                <div className={fieldLabelClass}>状态</div>
                <FormSelect
                  value={newUserStatus}
                  onChange={(e) => setNewUserStatus(e.target.value as "active" | "disabled")}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={creating}
                >
                  <option value="active">在岗</option>
                  <option value="disabled">禁用</option>
                </FormSelect>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[15px] font-semibold text-[#3D4757] mb-3 ml-1">产品权限</div>
              <div className="mt-2">
                <div className="flex items-center justify-end mb-3">
                  {productOptionsLoading && <div className="text-xs text-gray-400">正在加载产品权限...</div>}
                </div>

                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="h-7 px-3 rounded-full text-xs font-semibold text-[#6A7383] bg-[#F2F4F8] hover:bg-[#E9ECF2] transition"
                      onClick={() =>
                        setNewUserSelectedAsins(
                          addVisibilityOptions.map((item) =>
                            buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE)
                          )
                        )
                      }
                      disabled={creating || productOptionsLoading || addVisibilityOptions.length === 0 || !newPermissionEditable}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="h-7 px-3 rounded-full text-xs font-semibold text-[#6A7383] bg-[#F2F4F8] hover:bg-[#E9ECF2] transition"
                      onClick={() => setNewUserSelectedAsins([])}
                      disabled={creating || productOptionsLoading || newUserSelectedAsins.length === 0 || !newPermissionEditable}
                    >
                      清空
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-1 max-w-xl">
                    <div className="relative w-[148px]" ref={newSiteDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setNewSiteDropdownOpen((prev) => !prev)}
                        disabled={creating || productOptionsLoading}
                        className="w-full h-9 px-3 rounded-xl bg-[#F4F6FA] border border-[#E9EDF3] text-[13px] text-[#3D4757] font-medium flex items-center justify-between hover:border-[#D5DBE6] disabled:opacity-60"
                      >
                        <span className="truncate">{newSitesLabel || "全部站点"}</span>
                        <CaretDown
                          size={14}
                          className={`text-[#7A8596] transition-transform ${newSiteDropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {newSiteDropdownOpen && (
                        <div className="absolute left-0 top-[42px] z-30 w-full rounded-xl border border-[#E6EBF2] bg-white shadow-lg p-2">
                          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#0C1731]"
                              checked={allNewSitesSelected}
                              onChange={() =>
                                setNewPermissionSites(
                                  allNewSitesSelected ? ["US"] : [...bsrSiteOptions]
                                )
                              }
                            />
                            全部站点
                          </label>
                          <div className="my-1 h-px bg-[#EEF2F7]" />
                          {bsrSiteOptions.map((site) => (
                            <label
                              key={`new-site-${site}`}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#0C1731]"
                                checked={newPermissionSites.includes(site)}
                                onChange={() => toggleNewSite(site)}
                              />
                              {site}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative flex-1 group">
                      <MagnifyingGlass
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#97A0AF] transition-colors group-focus-within:text-[#3B82F6]"
                      />
                      <input
                        type="text"
                        placeholder="搜索 产品名称, ASIN..."
                        value={newPermissionSearch}
                        onChange={(e) => setNewPermissionSearch(e.target.value)}
                        disabled={creating || productOptionsLoading}
                        className="w-full h-9 pl-11 pr-6 rounded-xl bg-[#F4F6FA] border-none text-[13px] text-gray-700 placeholder:text-[#97A0AF] outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="w-full rounded-xl border border-[#E9EDF3] bg-white overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm text-left table-fixed">
                      <thead className="sticky top-0 bg-[#F8FAFD] text-[#8A94A6] text-xs">
                        <tr>
                          <th className="font-normal py-2 px-3 w-[80px] text-center">站点</th>
                          <th className="font-normal py-2 px-3 w-[80px] text-center">图片</th>
                          <th className="font-normal py-2 px-3 w-[140px]">ASIN</th>
                          <th className="font-normal py-2 px-3 w-[110px]">品牌</th>
                          <th className="font-normal py-2 px-3">产品名称</th>
                          <th className="font-normal py-2 px-3 w-[84px] text-center">选择</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredAddVisibilityOptions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-xs text-[#97A0AF]">
                              {addVisibilityOptions.length === 0 ? "暂无可选 ASIN" : "无匹配结果"}
                            </td>
                          </tr>
                        )}
                        {filteredAddVisibilityOptions.map((item) => {
                          const permissionKey = buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE);
                          const checked = newUserSelectedAsins.includes(permissionKey);
                          return (
                            <tr
                              key={`${item.asin}-${item.site || DEFAULT_PERMISSION_SITE}`}
                              className={`${checked ? "bg-blue-50/70 text-[#111827]" : "hover:bg-gray-50 text-[#111827]"}`}
                            >
                              <td className="py-2.5 px-3 text-center text-[12px] font-semibold">
                                {String(item.site || "US").toUpperCase().replace(/,/g, " / ")}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex justify-center">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.asin}
                                      className="w-10 h-10 object-contain rounded border border-gray-100 bg-white cursor-zoom-in"
                                      onMouseEnter={(e) =>
                                        showImagePreview(
                                          (e.currentTarget as HTMLImageElement).getBoundingClientRect(),
                                          item.imageUrl || "",
                                          item.asin
                                        )
                                      }
                                      onMouseMove={(e) =>
                                        showImagePreview(
                                          (e.currentTarget as HTMLImageElement).getBoundingClientRect(),
                                          item.imageUrl || "",
                                          item.asin
                                        )
                                      }
                                      onMouseLeave={() => setImagePreview(null)}
                                      onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNGNEY2RkEiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgZm9udC1zaXplPSIxMCIgZmlsbD0iIzk3QTBBRiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPklNRzwvdGV4dD48L3N2Zz4='; }}
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                                      无图
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-[#1F2937]">{item.asin}</td>
                              <td className="py-2.5 px-3 truncate max-w-[120px]">{item.brand || "-"}</td>
                              <td className="py-2.5 px-3 truncate max-w-[300px]">{item.name || "-"}</td>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[#0C1731]"
                                  checked={checked}
                                  onChange={(e) => toggleNewSelectedAsin(permissionKey, e.target.checked)}
                                  disabled={creating || productOptionsLoading || !newPermissionEditable}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[#7A8596]">
                  {productOptionsLoading
                    ? "正在加载可选产品..."
                    : newPermissionEditable
                      ? `已选 ${newUserSelectedAsins.length} 个 / 可选 ${addVisibilityOptions.length} 个`
                      : `已选 ${newUserSelectedAsins.length} 个 / 可选 ${addVisibilityOptions.length} 个（当前角色默认全部可见）`}
                </div>
              </div>
            </div>

            {createError && (
              <div className="mt-3 text-sm text-red-500">{createError}</div>
            )}

            <div className="flex items-center justify-end gap-3 mt-7 border-t border-[#EEF1F5] pt-5">
              <button
                className="px-4 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F5F7FA] rounded-lg"
                onClick={closeAddUserModal}
                disabled={creating}
              >
                取消
              </button>
              <button
                className="px-6 py-2.5 text-sm font-semibold text-white bg-[#0C1731] hover:bg-[#081022] rounded-lg disabled:opacity-60 transition shadow-sm"
                onClick={createUser}
                disabled={creating || productOptionsLoading}
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[4px] transition-all">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 transform transition-all scale-100 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除成员？</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                您确定要删除成员 <span className="font-bold text-gray-900">{deleteTarget.dingtalk_username}</span>
                （<span className="font-bold text-gray-900">{deleteTarget.dingtalk_userid}</span>）吗？<br />
                此操作无法撤销。
              </p>
              {deleteError && (
                <div className="w-full mb-4 text-center text-sm text-red-500">{deleteError}</div>
              )}
              <div className="flex gap-3 w-full">
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition-all active:scale-95"
                  onClick={closeDeleteModal}
                  disabled={deleteSubmitting}
                >
                  取消
                </button>
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-br from-red-500 to-red-600 hover:shadow-lg hover:shadow-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={confirmDeleteUser}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {groupDeleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[4px] transition-all">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 transform transition-all scale-100 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除组？</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                您确定要删除组 <span className="font-bold text-gray-900">{groupDeleteTarget}</span> 吗？<br />
                此操作无法撤销。
              </p>
              {groupDeleteError && (
                <div className="w-full mb-4 text-center text-sm text-red-500">{groupDeleteError}</div>
              )}
              <div className="flex gap-3 w-full">
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition-all active:scale-95"
                  onClick={closeDeleteGroupModal}
                  disabled={groupDeleteSubmitting}
                >
                  取消
                </button>
                <button
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-br from-red-500 to-red-600 hover:shadow-lg hover:shadow-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={confirmDeleteGroup}
                  disabled={groupDeleteSubmitting}
                >
                  {groupDeleteSubmitting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] shadow-[0_12px_40px_rgba(15,23,42,0.14)] w-full max-w-5xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-7">
              <h3 className="text-lg font-bold text-gray-900">编辑成员</h3>
              <button
                className="text-[30px] leading-none text-[#C3CAD5] hover:text-[#7F8A9B]"
                onClick={closeEditModal}
                disabled={editSaving}
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <div>
                <div className={fieldLabelClass}>成员ID</div>
                <div className={staticFieldClass}>
                  {editUserId || "-"}
                </div>
              </div>
              <div>
                <div className={fieldLabelClass}>成员姓名</div>
                <div className={staticFieldClass}>
                  {editUserName || "-"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              <div>
                <div className={fieldLabelClass}>角色</div>
                <FormSelect
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "admin" | "team_lead" | "operator")}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={editSaving}
                >
                  <option value="admin">管理员</option>
                  <option value="team_lead">运营组长</option>
                  <option value="operator">运营人员</option>
                </FormSelect>
              </div>
              <div>
                <div className={fieldLabelClass}>状态</div>
                <FormSelect
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "active" | "disabled")}
                  className="h-11 !rounded-xl border-[#E9EDF3] bg-[#F4F6FA] text-[#1F2937] font-semibold"
                  disabled={editSaving}
                >
                  <option value="active">在岗</option>
                  <option value="disabled">禁用</option>
                </FormSelect>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[15px] font-semibold text-[#3D4757] mb-3 ml-1">产品权限</div>
              <div className="mt-2">
                <div className="flex items-center justify-end mb-3">
                  {editLoading && <div className="text-xs text-gray-400">正在加载产品权限...</div>}
                </div>

                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-3 w-full">
                    <div className="relative w-[120px]" ref={editSiteDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditSiteDropdownOpen((prev) => !prev);
                          setEditCategoryDropdownOpen(false);
                          setEditBrandDropdownOpen(false);
                        }}
                        disabled={editSaving || editLoading || productOptionsLoading}
                        className="w-full h-9 px-3 rounded-xl bg-[#F4F6FA] border border-[#E9EDF3] text-[13px] text-[#3D4757] font-medium flex items-center justify-between hover:border-[#D5DBE6] disabled:opacity-60"
                      >
                        <span className="truncate">{editSitesLabel || "全部站点"}</span>
                        <CaretDown
                          size={14}
                          className={`text-[#7A8596] transition-transform ${editSiteDropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {editSiteDropdownOpen && (
                        <div className="absolute left-0 top-[42px] z-30 w-full rounded-xl border border-[#E6EBF2] bg-white shadow-lg p-2">
                          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#0C1731]"
                              checked={allEditSitesSelected}
                              onChange={() =>
                                setPermissionSites(
                                  allEditSitesSelected ? ["US"] : [...bsrSiteOptions]
                                )
                              }
                            />
                            全部站点
                          </label>
                          <div className="my-1 h-px bg-[#EEF2F7]" />
                          {bsrSiteOptions.map((site) => (
                            <label
                              key={`edit-site-${site}`}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#0C1731]"
                                checked={permissionSites.includes(site)}
                                onChange={() => toggleEditSite(site)}
                              />
                              {site}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative w-[148px]" ref={editBrandDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditBrandDropdownOpen((prev) => !prev);
                          setEditSiteDropdownOpen(false);
                          setEditCategoryDropdownOpen(false);
                        }}
                        disabled={editSaving || editLoading || productOptionsLoading || editBrandOptions.length === 0}
                        className="w-full h-9 px-3 rounded-xl bg-[#F4F6FA] border border-[#E9EDF3] text-[13px] text-[#3D4757] font-medium flex items-center justify-between hover:border-[#D5DBE6] disabled:opacity-60"
                      >
                        <span className="truncate">{editBrandLabel}</span>
                        <CaretDown
                          size={14}
                          className={`text-[#7A8596] transition-transform ${editBrandDropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {editBrandDropdownOpen && (
                        <div className="absolute left-0 top-[42px] z-30 w-full rounded-xl border border-[#E6EBF2] bg-white shadow-lg p-2 max-h-60 overflow-y-auto">
                          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#0C1731]"
                              checked={editBrandFilters.length === 0}
                              onChange={() => setEditBrandFilters([])}
                            />
                            全部品牌
                          </label>
                          <div className="my-1 h-px bg-[#EEF2F7]" />
                          {editBrandOptions.map((brand) => (
                            <label
                              key={`edit-brand-${brand}`}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#3D4757] hover:bg-[#F7F9FC] rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#0C1731]"
                                checked={editBrandFilters.includes(brand)}
                                onChange={() => toggleEditBrand(brand)}
                              />
                              <span className="truncate">{brand}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative w-[380px]">
                      <Cascader
                        options={categoryTreeOptions}
                        value={(editCategoryPath.length > 0 ? editCategoryPath : undefined) as any}
                        onChange={(value) => {
                          const nextPath = Array.isArray(value) ? (value as string[]).map((item) => String(item || "")) : [];
                          setEditCategoryPath(nextPath);
                          const leaf = getCategoryLeafFromPath(nextPath);
                          setEditCategoryFilters(leaf ? [leaf] : []);
                          setEditCategoryDropdownOpen(false);
                        }}
                        placeholder="全部类目"
                        allowClear
                        showSearch
                        expandTrigger="hover"
                        placement="bottomLeft"
                        open={editCategoryDropdownOpen}
                        onDropdownVisibleChange={(open) => {
                          setEditCategoryDropdownOpen(open);
                          if (open) {
                            setEditSiteDropdownOpen(false);
                            setEditBrandDropdownOpen(false);
                          }
                        }}
                        popupClassName="permission-category-cascader-dropdown"
                        getPopupContainer={() => document.body}
                        className="w-full category-cascader permission-category-cascader"
                        disabled={editSaving || editLoading || productOptionsLoading || editCategoryOptions.length === 0}
                      />
                    </div>
                    <div className="relative flex-1 group">
                      <MagnifyingGlass
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#97A0AF] transition-colors group-focus-within:text-[#3B82F6]"
                      />
                      <input
                        type="text"
                        placeholder="搜索 产品名称, ASIN..."
                        value={permissionSearch}
                        onChange={(e) => setPermissionSearch(e.target.value)}
                        disabled={editSaving || editLoading || productOptionsLoading}
                        className="w-full h-9 pl-11 pr-6 rounded-xl bg-[#F4F6FA] border-none text-[13px] text-gray-700 placeholder:text-[#97A0AF] outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all font-medium"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="h-7 px-3 rounded-full text-xs font-semibold text-[#6A7383] bg-[#F2F4F8] hover:bg-[#E9ECF2] transition"
                      onClick={() =>
                        setEditSelectedAsins((prev) =>
                          Array.from(new Set([...prev, ...filteredVisibilityKeys]))
                        )
                      }
                      disabled={editSaving || editLoading || productOptionsLoading || filteredVisibilityKeys.length === 0 || !permissionEditable}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="h-7 px-3 rounded-full text-xs font-semibold text-[#6A7383] bg-[#F2F4F8] hover:bg-[#E9ECF2] transition"
                      onClick={() => setEditSelectedAsins([])}
                      disabled={editSaving || editLoading || productOptionsLoading || editSelectedAsins.length === 0 || !permissionEditable}
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="w-full rounded-xl border border-[#E9EDF3] bg-white overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm text-left table-fixed">
                      <thead className="sticky top-0 bg-[#F8FAFD] text-[#8A94A6] text-xs">
                        <tr>
                          <th className="font-normal py-2 px-3 w-[80px] text-center">站点</th>
                          <th className="font-normal py-2 px-3 w-[80px] text-center">图片</th>
                          <th className="font-normal py-2 px-3 w-[140px]">ASIN</th>
                          <th className="font-normal py-2 px-3 w-[110px]">品牌</th>
                          <th className="font-normal py-2 px-3">产品名称</th>
                          <th className="font-normal py-2 px-3 w-[84px] text-center">选择</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredVisibilityOptions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-xs text-[#97A0AF]">
                              {visibilityOptions.length === 0 ? "暂无可选 ASIN" : "无匹配结果"}
                            </td>
                          </tr>
                        )}
                        {filteredVisibilityOptions.map((item) => {
                          const permissionKey = buildPermissionKey(item.asin, item.site || DEFAULT_PERMISSION_SITE);
                          const checked = editSelectedAsins.includes(permissionKey);
                          return (
                            <tr
                              key={`${item.asin}-${item.site || DEFAULT_PERMISSION_SITE}`}
                              className={`${checked ? "bg-blue-50/70 text-[#111827]" : "hover:bg-gray-50 text-[#111827]"}`}
                            >
                              <td className="py-2.5 px-3 text-center text-[12px] font-semibold">
                                {String(item.site || "US").toUpperCase().replace(/,/g, " / ")}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex justify-center">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.asin}
                                      className="w-10 h-10 object-contain rounded border border-gray-100 bg-white cursor-zoom-in"
                                      onMouseEnter={(e) =>
                                        showImagePreview(
                                          (e.currentTarget as HTMLImageElement).getBoundingClientRect(),
                                          item.imageUrl || "",
                                          item.asin
                                        )
                                      }
                                      onMouseMove={(e) =>
                                        showImagePreview(
                                          (e.currentTarget as HTMLImageElement).getBoundingClientRect(),
                                          item.imageUrl || "",
                                          item.asin
                                        )
                                      }
                                      onMouseLeave={() => setImagePreview(null)}
                                      onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNGNEY2RkEiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgZm9udC1zaXplPSIxMCIgZmlsbD0iIzk3QTBBRiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPklNRzwvdGV4dD48L3N2Zz4='; }}
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                                      无图
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-[#1F2937]">{item.asin}</td>
                              <td className="py-2.5 px-3 truncate max-w-[120px]">{item.brand || "-"}</td>
                              <td className="py-2.5 px-3 truncate max-w-[300px]">{item.name || "-"}</td>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[#0C1731]"
                                  checked={checked}
                                  onChange={(e) => toggleSelectedAsin(permissionKey, e.target.checked)}
                                  disabled={editSaving || editLoading || productOptionsLoading || !permissionEditable}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[#7A8596]">
                  {productOptionsLoading
                    ? "正在加载可选产品..."
                    : permissionEditable
                      ? `已选 ${editSelectedAsins.length} 个 / 可选 ${visibilityOptions.length} 个`
                      : `已选 ${editSelectedAsins.length} 个 / 可选 ${visibilityOptions.length} 个（当前角色默认全部可见）`}
                </div>
              </div>
            </div>

            {editError && (
              <div className="mt-3 text-sm text-red-500">{editError}</div>
            )}

            <div className="flex items-center justify-end gap-3 mt-7 border-t border-[#EEF1F5] pt-5">
              <button
                className="h-11 w-24 text-sm font-semibold text-[#6B7280] hover:bg-[#F5F7FA] rounded-lg transition"
                onClick={closeEditModal}
                disabled={editSaving}
              >
                取消
              </button>
              <button
                className="h-11 w-24 text-sm font-semibold text-white bg-[#0C1731] hover:bg-[#081022] rounded-lg disabled:opacity-60 transition shadow-sm"
                onClick={saveEditModal}
                disabled={editSaving || editLoading}
              >
                {editSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div
          className="fixed z-[120] pointer-events-none"
          style={{ left: `${imagePreview.left}px`, top: `${imagePreview.top}px` }}
        >
          <div className="w-[320px] h-[360px] rounded-2xl bg-white border border-gray-200 shadow-2xl p-3">
            <div className="w-full h-full rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
              <img
                src={imagePreview.src}
                alt={imagePreview.asin}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
