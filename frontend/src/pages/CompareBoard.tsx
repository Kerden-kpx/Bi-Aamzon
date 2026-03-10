import {
  ArrowRight,
  CaretDown,
  ChartLineUp,
  DotsThree,
  MagnifyingGlass,
  SidebarSimple,
  Star,
  Target,
  CornersOut,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { mockCompareDataset } from "../mock/data";

type CompareItem = {
  asin: string;
  price: number;
  rating: number;
  reviews: number;
  rank: number;
  sales: number;
};

type ComparePair = {
  competitor: CompareItem;
  own: CompareItem;
};

const formatGap = (value: number, digits = 1) => {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
};

export function CompareBoard({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [competitorInput, setCompetitorInput] = useState("B0C9L7M2");
  const handleToggleCollapse = () => onToggleCollapse?.();
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.();
  };
  const [ownInput, setOwnInput] = useState("B0A1E2Z3");
  const [batchInput, setBatchInput] = useState("2025-W02");
  const [activePair, setActivePair] = useState<ComparePair>(mockCompareDataset[0]);
  const [notice, setNotice] = useState("");

  const handleGenerate = () => {
    const match = mockCompareDataset.find(
      (pair) =>
        pair.competitor.asin === competitorInput && pair.own.asin === ownInput
    );
    if (!match) {
      setNotice("暂无匹配数据，已展示默认对比");
      setActivePair(mockCompareDataset[0]);
      return;
    }
    setNotice("");
    setActivePair(match);
  };

  const compareStats = useMemo(() => {
    const priceGap = activePair.own.price - activePair.competitor.price;
    const ratingGap = activePair.own.rating - activePair.competitor.rating;
    const reviewGap = activePair.own.reviews - activePair.competitor.reviews;
    const rankGap = activePair.own.rank - activePair.competitor.rank;

    return [
      {
        label: "Price Gap",
        value: `${formatGap(priceGap)}`,
        sub: priceGap <= 0 ? "Own cheaper" : "Own higher",
        tone: "blue",
      },
      {
        label: "Rating Gap",
        value: `${formatGap(ratingGap)}`,
        sub: ratingGap >= 0 ? "Own higher" : "Need improve",
        tone: "dark",
      },
      {
        label: "Review Gap",
        value: `${formatGap(reviewGap, 0)}`,
        sub: reviewGap >= 0 ? "Own more" : "Need growth",
        tone: "dark",
      },
      {
        label: "Rank Gap",
        value: `${formatGap(rankGap, 0)}`,
        sub: rankGap <= 0 ? "Ahead" : "Target up",
        tone: "blue",
      },
    ];
  }, [activePair]);

  const rows = useMemo(
    () => [
      {
        metric: "Price",
        competitor: `$${activePair.competitor.price.toFixed(2)}`,
        own: `$${activePair.own.price.toFixed(2)}`,
        gap: formatGap(activePair.own.price - activePair.competitor.price),
      },
      {
        metric: "Star Rating",
        competitor: activePair.competitor.rating.toFixed(1),
        own: activePair.own.rating.toFixed(1),
        gap: formatGap(activePair.own.rating - activePair.competitor.rating),
      },
      {
        metric: "Review Count",
        competitor: activePair.competitor.reviews.toLocaleString(),
        own: activePair.own.reviews.toLocaleString(),
        gap: formatGap(activePair.own.reviews - activePair.competitor.reviews, 0),
      },
      {
        metric: "BSR Rank",
        competitor: `#${activePair.competitor.rank}`,
        own: `#${activePair.own.rank}`,
        gap: formatGap(activePair.own.rank - activePair.competitor.rank, 0),
      },
      {
        metric: "Est. Sales",
        competitor: activePair.competitor.sales.toLocaleString(),
        own: activePair.own.sales.toLocaleString(),
        gap: formatGap(activePair.own.sales - activePair.competitor.sales, 0),
      },
    ],
    [activePair]
  );

  const bars = useMemo(() => {
    const normalize = (value: number, max: number) => Math.round((value / max) * 100);
    const maxPrice = Math.max(activePair.competitor.price, activePair.own.price);
    const maxRating = Math.max(activePair.competitor.rating, activePair.own.rating);
    const maxReviews = Math.max(activePair.competitor.reviews, activePair.own.reviews);
    const maxSales = Math.max(activePair.competitor.sales, activePair.own.sales);
    return [
      {
        label: "Price",
        competitor: normalize(activePair.competitor.price, maxPrice),
        own: normalize(activePair.own.price, maxPrice),
      },
      {
        label: "Rating",
        competitor: normalize(activePair.competitor.rating, maxRating),
        own: normalize(activePair.own.rating, maxRating),
      },
      {
        label: "Reviews",
        competitor: normalize(activePair.competitor.reviews, maxReviews),
        own: normalize(activePair.own.reviews, maxReviews),
      },
      {
        label: "Sales",
        competitor: normalize(activePair.competitor.sales, maxSales),
        own: normalize(activePair.own.sales, maxSales),
      },
    ];
  }, [activePair]);

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
          <span className="text-gray-900 font-medium">对比分析</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search ASIN"
              className="pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-48 transition-all"
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

      <section className="bg-white p-5 rounded-3xl shadow-sm mb-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-gray-900">对比输入</h3>
          <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
            <Target size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "竞品 ASIN",
              value: competitorInput,
              onChange: setCompetitorInput,
            },
            {
              label: "自家 ASIN",
              value: ownInput,
              onChange: setOwnInput,
            },
            {
              label: "批次",
              value: batchInput,
              onChange: setBatchInput,
            },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-2xl px-4 py-3">
              <div className="text-xs text-gray-500 mb-2">{item.label}</div>
              <input
                type="text"
                value={item.value}
                onChange={(event) => item.onChange(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-900 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">{notice}</span>
          <button
            type="button"
            onClick={handleGenerate}
            className="text-xs px-4 py-2 rounded-full bg-gray-900 text-white flex items-center gap-2"
          >
            生成对比
            <ArrowRight size={12} />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {compareStats.map((item) => (
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
                <ChartLineUp size={14} />
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
            <h3 className="font-semibold text-gray-900">核心指标差距</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-normal text-xs">
              <tr>
                <th className="font-normal py-2">Metric</th>
                <th className="font-normal py-2">Competitor</th>
                <th className="font-normal py-2">Own</th>
                <th className="font-normal py-2">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
                <tr key={row.metric} className="hover:bg-gray-50 transition">
                  <td className="py-3 text-gray-900 font-medium">{row.metric}</td>
                  <td className="text-gray-600">{row.competitor}</td>
                  <td className="text-gray-600">{row.own}</td>
                  <td className="text-gray-900 font-semibold">{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">对比视图</h3>
            <button className="bg-gray-100 p-2 rounded-lg text-gray-500">
              <DotsThree size={18} />
            </button>
          </div>
          <div className="space-y-4">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>{bar.label}</span>
                  <span>Competitor vs Own</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-900" style={{ width: `${bar.competitor}%` }} />
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-blue-500" style={{ width: `${bar.own}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
