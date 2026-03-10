import {
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  DotsThree,
  SidebarSimple,
  Star,
  CornersOut,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import {
  mockConfig,
  mockInsightBrandBars,
  mockInsightTrendPoints,
} from "../mock/data";

export function InsightsBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const timeframes = mockConfig.insights.timeframes;
  const [timeIndex, setTimeIndex] = useState(1);
  const [activeBrand, setActiveBrand] = useState(mockInsightBrandBars[0]?.label ?? "");
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  const insightStats = useMemo(
    () => [
      { label: "Brand Slots", value: "27", sub: "EZARC + TOLESA", tone: "blue" },
      { label: "Share", value: "27%", sub: "Top100", tone: "dark" },
      { label: "Avg Price", value: "$19.2", sub: "Own portfolio", tone: "blue" },
      { label: "Avg Rating", value: "4.6", sub: "Top100", tone: "dark" },
    ],
    []
  );

  const handleCycleTime = () => {
    setTimeIndex((prev) => (prev + 1) % timeframes.length);
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
          <span className="text-gray-900 font-medium">经营看板</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleCycleTime}
            className="px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium flex items-center gap-1 text-gray-600"
          >
            {timeframes[timeIndex]} <CaretDown size={12} />
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

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {insightStats.map((item) => (
          <div
            key={item.label}
            className={`p-6 rounded-3xl relative overflow-hidden shadow-lg ${item.tone === "blue"
                ? "bg-[#3B9DF8] shadow-blue-200"
                : "bg-[#1C1C1E]"
              } text-white`}
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

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold text-gray-900">品牌占位</h3>
              <p className="text-xs text-gray-400 mt-1">当前聚焦：{activeBrand}</p>
            </div>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <div className="space-y-4">
            {mockInsightBrandBars.map((bar) => (
              <button
                type="button"
                key={bar.label}
                onClick={() => setActiveBrand(bar.label)}
                className={`w-full flex items-center gap-4 ${activeBrand === bar.label ? "text-gray-900" : "text-gray-500"
                  }`}
              >
                <span className="text-xs w-20 text-left">{bar.label}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${bar.tone}`} style={{ width: `${bar.value}%` }} />
                </div>
                <span className="text-xs w-10 text-right">{bar.value}%</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">占位趋势</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <ChartLineUp size={18} />
            </button>
          </div>
          <div className="relative h-44">
            <svg viewBox="0 0 240 120" className="w-full h-full">
              <path
                d="M0,90 C40,80 60,60 80,60 C100,60 120,50 140,40 C160,30 200,40 240,20"
                fill="none"
                stroke="#3B9DF8"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {mockInsightTrendPoints.map((point, idx) => (
                <circle key={point.month} cx={idx * 60} cy={90 - idx * 15} r="4" fill="#1C1C1E" />
              ))}
            </svg>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              {mockInsightTrendPoints.map((point) => (
                <span key={point.month}>{point.month}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
