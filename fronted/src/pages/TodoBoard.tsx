import {
  CalendarBlank,
  CheckCircle,
  SidebarSimple,
  Star,
  CornersOut,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { AppDatePicker } from "../components/AppDatePicker";
import { FormInput, FormSelect } from "../components/FormControls";

type Status = "todo" | "doing" | "done" | "hold";

type Task = {
  id: string;
  title: string;
  asin: string;
  owner: string;
  priority: string;
  status: Status;
};

type StrategyDetail = {
  id: string;
  title: string;
  detail: string;
  competitor_asin: string;
  yida_asin: string;
  brand: string;
  owner: string;
  owner_userid: string;
  userid: string;
  priority: string;
  state: string;
  review_date: string | null;
  created_at: string | null;
};

const statusMeta: Record<Status, { label: string; tone: string }> = {
  todo: { label: "待开始", tone: "bg-gray-50" },
  doing: { label: "进行中", tone: "bg-blue-50" },
  done: { label: "已完成", tone: "bg-green-50" },
  hold: { label: "搁置", tone: "bg-yellow-50" },
};

export function TodoBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<StrategyDetail | null>(null);
  const [detailDraft, setDetailDraft] = useState<StrategyDetail | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailDeleting, setDetailDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  const totals = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((item) => item.status === "done").length;
    const hold = tasks.filter((item) => item.status === "hold").length;
    const doing = tasks.filter((item) => item.status === "doing").length;
    return { total, completed, hold, doing };
  }, [tasks]);

  const todoStats = [
    { label: "Total Tasks", value: String(totals.total), sub: "All priorities", tone: "dark" },
    { label: "In Progress", value: String(totals.doing), sub: "Active tasks", tone: "blue" },
    { label: "Completed", value: String(totals.completed), sub: "Done", tone: "blue" },
    { label: "On Hold", value: String(totals.hold), sub: "Need review", tone: "dark" },
  ];

  const columns = useMemo(() => {
    return (Object.keys(statusMeta) as Status[]).map((status) => ({
      status,
      title: statusMeta[status].label,
      tone: statusMeta[status].tone,
      items: tasks.filter((item) => item.status === status),
    }));
  }, [tasks]);

  const mapStateToStatus = (state?: string): Status => {
    if (state === "进行中") return "doing";
    if (state === "已完成") return "done";
    if (state === "搁置") return "hold";
    return "todo";
  };

  const mapStatusToState = (status: Status) => {
    if (status === "doing") return "进行中";
    if (status === "done") return "已完成";
    if (status === "hold") return "搁置";
    return "待开始";
  };

  const loadTasks = async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/yida-strategy/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 500, offset: 0 }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const data = await res.json();
          detail = data?.detail ? String(data.detail) : "";
        } catch {
          // ignore
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const mapped = items.map((item: any) => ({
        id: String(item.id ?? ""),
        title: item.title || "未命名任务",
        asin: item.competitor_asin || item.yida_asin || "-",
        owner: item.owner || item.owner_userid || item.userid || "-",
        priority: item.priority || "P2",
        status: mapStateToStatus(item.state),
      }));
      setTasks(mapped);
    } catch (err) {
      setError("加载任务失败，请检查后端服务。");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailOpen]);

  const openDetail = async (id: string) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`${apiBase}/api/yida-strategy/${id}`);
      if (!res.ok) {
        let detailMessage = "";
        try {
          const data = await res.json();
          detailMessage = data?.detail ? String(data.detail) : "";
        } catch {
          // ignore
        }
        throw new Error(detailMessage || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const item = data?.item;
      if (!item) {
        throw new Error("未找到策略详情");
      }
      setDetail({
        id: String(item.id ?? ""),
        title: item.title || "",
        detail: item.detail || "",
        competitor_asin: item.competitor_asin || "",
        yida_asin: item.yida_asin || "",
        brand: item.brand || "",
        owner: item.owner || "",
        owner_userid: item.owner_userid || "",
        userid: item.userid || "",
        priority: item.priority || "",
        state: item.state || "",
        review_date: item.review_date || null,
        created_at: item.created_at || null,
      });
      setDetailDraft({
        id: String(item.id ?? ""),
        title: item.title || "",
        detail: item.detail || "",
        competitor_asin: item.competitor_asin || "",
        yida_asin: item.yida_asin || "",
        brand: item.brand || "",
        owner: item.owner || "",
        owner_userid: item.owner_userid || "",
        userid: item.userid || "",
        priority: item.priority || "",
        state: item.state || "",
        review_date: item.review_date || null,
        created_at: item.created_at || null,
      });
    } catch (err) {
      setDetailError("加载策略详情失败，请稍后重试。");
      setDetail(null);
      setDetailDraft(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDetailChange = (key: keyof StrategyDetail, value: string | null) => {
    setDetailDraft((prev) => (prev ? { ...prev, [key]: value ?? "" } : prev));
  };

  const saveDetail = async () => {
    if (!detailDraft) return;
    if (!detailDraft.title || !detailDraft.detail) {
      setDetailError("策略标题和详细方案说明不能为空。");
      return;
    }
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDetailSaving(true);
    setDetailError(null);
    try {
      const res = await fetch(`${apiBase}/api/yida-strategy/${detailDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yida_asin: detailDraft.yida_asin,
          title: detailDraft.title,
          detail: detailDraft.detail,
          owner: detailDraft.owner,
          owner_userid: detailDraft.owner_userid,
          review_date: detailDraft.review_date || null,
          priority: detailDraft.priority,
          state: detailDraft.state,
        }),
      });
      if (!res.ok) {
        let detailMessage = "";
        try {
          const data = await res.json();
          detailMessage = data?.detail ? String(data.detail) : "";
        } catch {
          // ignore
        }
        throw new Error(detailMessage || `HTTP ${res.status}`);
      }
      setDetail(detailDraft);
      setTasks((prev) =>
        prev.map((item) =>
          item.id === detailDraft.id
            ? {
                ...item,
                title: detailDraft.title,
                priority: detailDraft.priority,
                status: mapStateToStatus(detailDraft.state),
              }
            : item
        )
      );
    } catch (err) {
      setDetailError("保存失败，请稍后重试。");
    } finally {
      setDetailSaving(false);
    }
  };

  const openDeleteConfirm = () => {
    if (!detailDraft) return;
    setDeleteConfirmOpen(true);
  };

  const deleteDetail = async () => {
    if (!detailDraft) return;
    setDeleteConfirmOpen(false);
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setDetailDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/yida-strategy/${detailDraft.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setTasks((prev) => prev.filter((item) => item.id !== detailDraft.id));
      closeDetail();
    } catch (err) {
      setDetailError("删除失败，请稍后重试。");
    } finally {
      setDetailDeleting(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailDraft(null);
    setDetailError(null);
    setDeleteConfirmOpen(false);
  };

  const moveTask = async (id: string, status: Status) => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setNotice(null);
    try {
      const res = await fetch(`${apiBase}/api/yida-strategy/${id}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: mapStatusToState(status) }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setTasks((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    } catch (err) {
      setNotice("更新任务状态失败。");
    }
  };

  const handleAddTask = () => {
    setNotice("请在 BSR 页面创建策略任务。");
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
          <span className="text-gray-900 font-medium">ToDo</span>
        </div>

        <div className="flex items-center gap-4">
          {loading && <span className="text-xs text-gray-400">加载中...</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
          {notice && !error && <span className="text-xs text-amber-600">{notice}</span>}
          <button
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
            onClick={handleToggleFullscreen}
            title="全屏"
          >
            <CornersOut size={18} />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {todoStats.map((item, index) => (
          <div
            key={item.label}
            className={`p-6 rounded-3xl relative overflow-hidden shadow-lg ${index % 2 === 0
              ? "bg-[#1C1C1E]"
              : "bg-[#3B9DF8] shadow-blue-200"
              } text-white card-hover-lift`}
          >
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium opacity-90">
                {item.label}
              </span>
              <div className="bg-white/20 p-1 rounded text-xs">
                <CalendarBlank size={14} />
              </div>
            </div>
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-semibold">{item.value}</h2>
              <span className="text-xs font-medium opacity-80">{item.sub}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {columns.map((col) => (
          <div key={col.status} className="bg-white p-5 rounded-3xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">{col.title}</h3>
              <span className="text-xs text-gray-400">{col.items.length}</span>
            </div>
            <div className="space-y-4">
              {col.items.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl ${col.tone} cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => openDetail(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{item.priority}</span>
                    <CheckCircle size={14} className="text-gray-400" />
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{item.owner}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 text-[10px]">
                    {item.status === "todo" && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTask(item.id, "doing");
                          }}
                          className="px-3 py-1 rounded-full bg-gray-900 text-white"
                        >
                          开始
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTask(item.id, "hold");
                          }}
                          className="px-3 py-1 rounded-full bg-gray-200 text-gray-600"
                        >
                          搁置
                        </button>
                      </>
                    )}
                    {item.status === "doing" && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTask(item.id, "done");
                          }}
                          className="px-3 py-1 rounded-full bg-green-500 text-white"
                        >
                          完成
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTask(item.id, "hold");
                          }}
                          className="px-3 py-1 rounded-full bg-gray-200 text-gray-600"
                        >
                          搁置
                        </button>
                      </>
                    )}
                    {item.status === "done" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTask(item.id, "doing");
                        }}
                        className="px-3 py-1 rounded-full bg-gray-200 text-gray-600"
                      >
                        回退
                      </button>
                    )}
                    {item.status === "hold" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTask(item.id, "todo");
                        }}
                        className="px-3 py-1 rounded-full bg-gray-900 text-white"
                      >
                        恢复
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">策略详情</h3>
              <button
                className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition-colors"
                onClick={closeDetail}
              >
                ✕
              </button>
            </div>

            {detailLoading && (
              <div className="py-10 text-center text-gray-400 text-sm">加载中...</div>
            )}
            {detailError && !detailLoading && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm">
                {detailError}
              </div>
            )}
            {!detailLoading && detailDraft && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">策略标题</label>
                  <FormInput
                    value={detailDraft.title}
                    onChange={(e) => handleDetailChange("title", e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    创建于 {detailDraft.created_at || "-"}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-2">负责人</label>
                    <FormInput value={detailDraft.owner || detailDraft.owner_userid || "-"} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">竞品ASIN</label>
                    <FormInput value={detailDraft.competitor_asin} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">品牌</label>
                    <FormInput value={detailDraft.brand || "-"} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">优先级</label>
                    <FormSelect
                      value={detailDraft.priority || "中"}
                      onChange={(e) => handleDetailChange("priority", e.target.value)}
                    >
                      {["高", "中", "低"].map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </FormSelect>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">执行状态</label>
                    <FormSelect
                      value={detailDraft.state || "待开始"}
                      onChange={(e) => handleDetailChange("state", e.target.value)}
                    >
                      {["待开始", "进行中", "已完成", "搁置"].map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </FormSelect>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">计划复盘</label>
                    <AppDatePicker
                      value={detailDraft.review_date || ""}
                      onChange={(val) => handleDetailChange("review_date", val || "")}
                      size="sm"
                      className="bg-white border border-gray-100 text-[12px] font-bold text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">详细方案说明</label>
                  <textarea
                    value={detailDraft.detail}
                    onChange={(e) => handleDetailChange("detail", e.target.value)}
                    className="w-full min-h-[160px] bg-gray-50 p-4 rounded-2xl border border-gray-100 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed shadow-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={saveDetail}
                    disabled={detailSaving}
                    className="flex-1 py-3 bg-[#1C1C1E] text-white text-xs font-bold rounded-2xl hover:bg-black transition-all shadow-xl shadow-black/10 disabled:opacity-50"
                  >
                    {detailSaving ? "保存中..." : "确定"}
                  </button>
                  <button
                    onClick={openDeleteConfirm}
                    disabled={detailDeleting}
                    className="flex-1 py-3 bg-red-50 text-red-500 text-xs font-bold rounded-2xl hover:bg-red-100 transition-all disabled:opacity-50"
                  >
                    {detailDeleting ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteConfirmOpen && detailDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除策略</h3>
            <p className="text-sm text-gray-500 mb-6">
              确定删除策略「{detailDraft.title}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={deleteDetail}
                disabled={detailDeleting}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#1C1C1E] hover:bg-black disabled:opacity-50 transition"
              >
                {detailDeleting ? "删除中..." : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
