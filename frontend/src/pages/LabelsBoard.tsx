import {
  CaretDown,
  DotsThree,
  MagnifyingGlass,
  Palette,
  SidebarSimple,
  Star,
  Tag,
  CornersOut,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import {
  mockLabelColorOptions,
  mockLabelItems,
  mockLabels,
} from "../mock/data";

type LabelItem = {
  name: string;
  color: string;
};

type LabelEntry = {
  asin: string;
  title: string;
};

export function LabelsBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [labels, setLabels] = useState<LabelItem[]>(mockLabels);
  const [labelItems, setLabelItems] = useState<Record<string, LabelEntry[]>>(mockLabelItems);
  const [selectedLabel, setSelectedLabel] = useState<string>(mockLabels[0]?.name ?? "");
  const [search, setSearch] = useState("");
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };

  const filteredLabels = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return labels;
    }
    return labels.filter((label) => label.name.toLowerCase().includes(keyword));
  }, [labels, search]);

  const stats = useMemo(() => {
    const totalLabels = labels.length;
    const totalAsin = Object.values(labelItems).reduce((sum, items) => sum + items.length, 0);
    const mostUsed = labels
      .map((label) => ({
        name: label.name,
        count: labelItems[label.name]?.length ?? 0,
      }))
      .sort((a, b) => b.count - a.count)[0];
    return {
      totalLabels,
      totalAsin,
      mostUsed: mostUsed ? `${mostUsed.name}` : "-",
      pending: 5,
    };
  }, [labels, labelItems]);

  const handleAddLabel = () => {
    const newName = `New-${labels.length + 1}`;
    setLabels((prev) => [
      ...prev,
      { name: newName, color: mockLabelColorOptions[prev.length % mockLabelColorOptions.length] },
    ]);
    setLabelItems((prev) => ({ ...prev, [newName]: [] }));
    setSelectedLabel(newName);
  };

  const handleColorChange = (color: string) => {
    setLabels((prev) => prev.map((label) => (label.name === selectedLabel ? { ...label, color } : label)));
  };

  const handleAddAsin = () => {
    const newEntry = { asin: `B0NEW${Date.now().toString().slice(-3)}`, title: "New tagged item" };
    setLabelItems((prev) => ({
      ...prev,
      [selectedLabel]: [newEntry, ...(prev[selectedLabel] ?? [])],
    }));
  };

  const selectedItems = labelItems[selectedLabel] ?? [];
  const selectedColor = labels.find((label) => label.name === selectedLabel)?.color ?? mockLabelColorOptions[0];

  const labelStats = [
    { label: "Total Labels", value: String(stats.totalLabels), sub: "Active tags", tone: "dark" },
    { label: "Labeled ASIN", value: String(stats.totalAsin), sub: "Top100 covered", tone: "blue" },
    { label: "Most Used", value: stats.mostUsed, sub: "Highest usage", tone: "blue" },
    { label: "Pending Review", value: String(stats.pending), sub: "Need merge", tone: "dark" },
  ];

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
          <span className="text-gray-900 font-medium">标签管理</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search label / ASIN"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {labelStats.map((item) => (
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
                <Tag size={14} />
              </div>
            </div>
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-semibold">{item.value}</h2>
              <span className="text-xs font-medium opacity-80">{item.sub}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <aside className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">标签列表</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <div className="space-y-3">
            {filteredLabels.map((label) => (
              <button
                type="button"
                key={label.name}
                onClick={() => setSelectedLabel(label.name)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition ${selectedLabel === label.name ? "border-blue-200" : "border-gray-100"
                  }`}
              >
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${label.color}`}>
                  {label.name}
                </span>
                <span className="text-xs text-gray-400">{labelItems[label.name]?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddLabel}
            className="mt-6 w-full text-xs px-3 py-2 rounded-full bg-gray-900 text-white"
          >
            新建标签
          </button>
        </aside>

        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-gray-900">标签详情</h3>
                <p className="text-xs text-gray-400 mt-1">当前选择：{selectedLabel}</p>
              </div>
              <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
                <Palette size={18} />
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              {mockLabelColorOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => handleColorChange(option)}
                  className={`text-[10px] px-3 py-1 rounded-full ${option} ${selectedColor === option ? "ring-2 ring-offset-2 ring-blue-300" : ""
                    }`}
                >
                  {selectedLabel}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {selectedItems.map((item) => (
                <div key={item.asin} className="p-4 border border-gray-100 rounded-2xl">
                  <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                  <div className="text-xs text-gray-400 mt-1">ASIN {item.asin}</div>
                </div>
              ))}
              {selectedItems.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-6">暂无 ASIN 关联</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleAddAsin}
              className="mt-6 w-full text-xs px-3 py-2 rounded-full bg-gray-900 text-white"
            >
              添加 ASIN
            </button>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-900">标签应用规则</h3>
              <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
                <DotsThree size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                "品牌匹配",
                "材质匹配",
                "场景匹配",
                "评分阈值",
              ].map((rule) => (
                <div key={rule} className="p-4 rounded-2xl bg-gray-50">
                  <div className="text-sm font-semibold text-gray-900">{rule}</div>
                  <div className="text-xs text-gray-500 mt-1">规则说明占位</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
