import {
  ArrowRight,
  CaretDown,
  DotsThree,
  MagnifyingGlass,
  SidebarSimple,
  Star,
  Target,
  CornersOut,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

import {
  mockMappingCompetitors,
  mockMappingInitial,
  mockMappingOwn,
  mockMappingStats,
} from "../mock/data";

import type { DragEvent} from "react";

type Mapping = {
  id: string;
  competitorAsin: string;
  ownSku: string;
  gap: string;
};

const getGapHint = (rank: number) => (rank <= 5 ? "-4" : rank <= 10 ? "-6" : "-8");

export function MappingBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [selectedOwn, setSelectedOwn] = useState<string | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>(mockMappingInitial);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) {
      window.clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2400);
  };

  const handleCreateMapping = () => {
    if (!selectedCompetitor || !selectedOwn) {
      showNotice("请选择竞品与自家产品后再创建映射");
      return;
    }
    if (mappings.some((item) => item.competitorAsin === selectedCompetitor)) {
      showNotice("该竞品已完成映射，可调整策略");
      return;
    }
    const competitor = mockMappingCompetitors.find((item) => item.asin === selectedCompetitor);
    const gap = competitor ? getGapHint(competitor.rank) : "-";
    setMappings((prev) => [
      ...prev,
      {
        id: `map-${Date.now()}`,
        competitorAsin: selectedCompetitor,
        ownSku: selectedOwn,
        gap,
      },
    ]);
    showNotice("映射已创建");
    setSelectedCompetitor(null);
    setSelectedOwn(null);
  };

  const handleRemove = (id: string) => {
    setMappings((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDragStart = (type: "competitor" | "own", id: string) =>
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData("application/json", JSON.stringify({ type, id }));
    };

  const handleDrop = (type: "competitor" | "own") =>
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      try {
        const payload = JSON.parse(event.dataTransfer.getData("application/json"));
        if (payload.type !== type) {
          showNotice("拖拽对象不匹配");
          return;
        }
        if (type === "competitor") {
          setSelectedCompetitor(payload.id);
        } else {
          setSelectedOwn(payload.id);
        }
      } catch {
        showNotice("拖拽数据异常");
      }
    };

  const mappedCompetitors = new Set(mappings.map((item) => item.competitorAsin));

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
          <span className="text-gray-900 font-medium">目标坑位映射</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search ASIN / SKU"
              className="pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-56 transition-all"
            />
          </div>
          <button className="px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium flex items-center gap-1 text-gray-600">
            本周 <CaretDown size={12} />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <DotsThree size={18} />
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

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Active Mappings", value: "42", sub: "+5 this week", bg: "bg-[#3B9DF8]", icon: <Target size={16} /> },
          { label: "Unmapped BSR", value: "58", sub: "Need target", bg: "bg-[#1C1C1E]", icon: <Target size={16} /> },
          { label: "Coverage", value: "38%", sub: "EZARC + TOLESA", bg: "bg-[#3B9DF8]", icon: <Target size={16} /> },
          { label: "Avg Gap", value: "-6", sub: "Ranks to target", bg: "bg-[#1C1C1E]", icon: <Target size={16} /> },
        ].map((item, index) => (
          <div
            key={item.label}
            className={`p-6 rounded-3xl relative overflow-hidden shadow-lg ${item.bg} text-white flex flex-col justify-between card-hover-lift`}
          >
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium opacity-90">{item.label}</span>
              <div className="bg-white/10 p-1.5 rounded-lg">
                {item.icon}
              </div>
            </div>
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-semibold">{item.value}</h2>
              <span className="text-xs font-medium opacity-80">{item.sub}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)] gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">竞品 BSR 列表</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <div className="space-y-4">
            {mockMappingCompetitors.map((item) => {
              const selected = selectedCompetitor === item.asin;
              const mapped = mappedCompetitors.has(item.asin);
              return (
                <div
                  key={item.asin}
                  draggable
                  onDragStart={handleDragStart("competitor", item.asin)}
                  onClick={() => setSelectedCompetitor(item.asin)}
                  className={`p-4 border rounded-2xl transition ${selected
                    ? "border-blue-200 shadow-md"
                    : "border-gray-100 hover:shadow-md"
                    } ${mapped ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500">#{item.rank}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {item.brand}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                  <div className="text-xs text-gray-400 mt-1">ASIN {item.asin}</div>
                  {mapped ? (
                    <div className="mt-4 text-[10px] text-gray-400">已映射</div>
                  ) : (
                    <button className="mt-4 w-full text-xs px-3 py-2 rounded-full bg-gray-900 text-white">
                      拖拽到中间映射
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">映射池</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop("competitor")}
              className={`p-4 rounded-2xl border border-dashed ${selectedCompetitor ? "border-blue-200 bg-blue-50" : "border-gray-200"
                }`}
            >
              <div className="text-xs text-gray-500">竞品 ASIN</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">
                {selectedCompetitor || "拖拽或点击选择"}
              </div>
            </div>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop("own")}
              className={`p-4 rounded-2xl border border-dashed ${selectedOwn ? "border-blue-200 bg-blue-50" : "border-gray-200"
                }`}
            >
              <div className="text-xs text-gray-500">自家 SKU</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">
                {selectedOwn || "拖拽或点击选择"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateMapping}
              className="w-full text-xs px-3 py-2 rounded-full bg-gray-900 text-white flex items-center justify-center gap-2"
            >
              创建映射
              <ArrowRight size={12} />
            </button>
            {notice && (
              <div className="text-xs text-blue-500 text-center">{notice}</div>
            )}
          </div>

          <div className="space-y-4">
            {mappings.map((map) => (
              <div key={map.id} className="p-4 rounded-2xl bg-gray-50">
                <div className="text-xs text-gray-500">竞品 {map.competitorAsin}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm font-semibold text-gray-900">{map.ownSku}</div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-600">
                    Gap {map.gap}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button className="flex-1 text-xs px-3 py-2 rounded-full bg-white border border-gray-200 text-gray-600">
                    调整策略
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(map.id)}
                    className="text-xs px-3 py-2 rounded-full bg-gray-200 text-gray-600"
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">自家产品库</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <div className="space-y-4">
            {mockMappingOwn.map((item) => {
              const selected = selectedOwn === item.sku;
              return (
                <div
                  key={item.sku}
                  draggable
                  onDragStart={handleDragStart("own", item.sku)}
                  onClick={() => setSelectedOwn(item.sku)}
                  className={`p-4 border rounded-2xl transition ${selected
                    ? "border-blue-200 shadow-md"
                    : "border-gray-100 hover:shadow-md"
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {item.tag}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{item.sku}</div>
                  <button className="mt-4 w-full text-xs px-3 py-2 rounded-full bg-gray-900 text-white">
                    拖拽到中间映射
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
