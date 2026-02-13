import { CaretDown, CornersOut, MagnifyingGlass, SidebarSimple, Star } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type JobItem = {
  job_id: string;
  asin: string;
  site: string;
  status: "pending" | "running" | "success" | "failed" | string;
  operator_userid?: string;
  created_at?: string;
  report_text?: string;
  report_preview?: string;
};

const siteOptions = ["US", "CA", "UK", "DE"];
function formatTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function AiInsightsBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [asinFilter, setAsinFilter] = useState("");
  const [debouncedAsinFilter, setDebouncedAsinFilter] = useState("");
  const [selectedSites, setSelectedSites] = useState<string[]>([...siteOptions]);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef<HTMLDivElement | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAsinFilter(asinFilter);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [asinFilter]);

  const loadJobs = useCallback(async () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { limit: 200, offset: 0 };
      if (debouncedAsinFilter.trim()) payload.asin = debouncedAsinFilter.trim().toUpperCase();
      const res = await fetch(`${apiBase}/api/ai-insights/jobs/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data?.error?.message || data?.detail || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setJobs(items);
      setSelectedJobId((prev) => (prev || items.length === 0 ? prev : String(items[0].job_id)));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "加载 AI 分析任务失败";
      setError(message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedAsinFilter]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const allSitesSelected = selectedSites.length === siteOptions.length;
  const selectedSiteLabel = allSitesSelected || selectedSites.length === 0 ? "全部站点" : selectedSites.join(",");

  const filteredJobs = useMemo(() => {
    const allowed = new Set(selectedSites.map((site) => String(site || "").toUpperCase()));
    return jobs.filter((job) => allowed.has(String(job.site || "").toUpperCase()));
  }, [jobs, selectedSites]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => String(job.job_id) === String(selectedJobId)) || null,
    [filteredJobs, selectedJobId]
  );

  useEffect(() => {
    if (!filteredJobs.length) return;
    const exists = filteredJobs.some((item) => String(item.job_id) === String(selectedJobId));
    if (!exists) {
      setSelectedJobId(String(filteredJobs[0].job_id));
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    const hasRunning = jobs.some((job) => job.status === "pending" || job.status === "running");
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!siteDropdownRef.current) return;
      if (!siteDropdownRef.current.contains(event.target as Node)) {
        setSiteDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

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

  return (
    <main className={`flex-1 ${collapsed ? "ml-20" : "ml-56"} p-8 transition-all duration-300 bg-[#F7F9FB] h-screen overflow-hidden text-gray-800 flex flex-col`}>
      <header className="flex justify-between items-center mb-6">
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
          <span className="text-gray-900 font-medium">AI Insights</span>
        </div>
        <div className="flex items-center gap-3">
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
            <input
              value={asinFilter}
              onChange={(e) => setAsinFilter(e.target.value)}
              placeholder="搜索 ASIN"
              className="w-full h-[34px] pl-11 pr-4 text-xs rounded-full bg-[#F4F6FA] border border-[#E9EDF3] outline-none focus:border-blue-300"
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

      <section className="grid items-start lg:items-stretch grid-cols-1 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] gap-6 flex-1 min-h-0">
        <div className="bg-white p-5 rounded-3xl shadow-sm lg:h-full min-h-[320px] lg:min-h-0 flex flex-col">
          {loading && (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
              正在加载任务...
            </div>
          )}
          {!loading && error && (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-red-500">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-auto custom-scrollbar flex-1 min-h-0">
              <table className="w-full text-sm table-auto">
                <thead className="text-xs text-gray-400">
                  <tr>
                    <th className="text-center font-normal py-3 px-2 w-[72px]">序号</th>
                    <th className="text-center font-normal py-3 px-2 w-[64px]">站点</th>
                    <th className="text-center font-normal py-3 px-2 w-[140px]">ASIN</th>
                    <th className="text-center font-normal py-3 px-2 w-[190px] whitespace-nowrap">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredJobs.map((item, index) => (
                    <tr
                      key={item.job_id}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedJobId === item.job_id ? "bg-blue-50/40" : ""}`}
                      onClick={() => setSelectedJobId(item.job_id)}
                    >
                      <td className="py-3 px-2 text-gray-900 text-center">{index + 1}</td>
                      <td className="py-3 px-2 text-gray-900 text-center">{item.site}</td>
                      <td className="py-3 px-2 text-gray-900 font-medium text-center">{item.asin}</td>
                      <td className="py-3 px-2 text-gray-900 text-center whitespace-nowrap">{formatTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredJobs.length && (
                <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-gray-400">
                  暂无任务
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm lg:h-full min-h-[320px] lg:min-h-0 flex flex-col">
          {!selectedJob && (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
              请选择左侧任务查看报告
            </div>
          )}
          {selectedJob?.status === "failed" && (
            <div className="flex-1 min-h-0 flex items-center justify-center p-3 rounded-lg bg-red-50 text-red-500 text-sm">
              分析失败
            </div>
          )}
          {selectedJob && (selectedJob.status === "pending" || selectedJob.status === "running") && (
            <div className="flex-1 min-h-0 flex items-center justify-center p-3 rounded-lg bg-blue-50 text-blue-600 text-sm">
              任务执行中，请稍候刷新...
            </div>
          )}
          {selectedJob?.status === "success" && !String(selectedJob.report_text || "").trim() && (
            <div className="flex-1 min-h-0 flex items-center justify-center p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
              任务已完成，但暂无报告内容
            </div>
          )}
          {selectedJob?.status === "success" && String(selectedJob.report_text || "").trim() && (
            <div className="mt-3 border border-gray-100 rounded-2xl px-6 pt-6 pb-2 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <div className="ai-report-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {String(selectedJob.report_text || "").trim()}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
