import {
  CaretDown,
  CornersOut,
  SidebarSimple,
  Star,
} from "@phosphor-icons/react";
import { PieChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef, useState } from "react";

import { mockBsrItems } from "../mock/data";

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

interface BrandStat {
    brand: string;
    count: number;
    countShare: number;
    sales: number;
    salesShare: number;
    salesVolume: number;
    salesVolumeShare: number;
    deltaCount: number | null;
}

type DonutValueKey = "sales" | "salesVolume";
type BrandSortKey = "count" | "sales" | "salesVolume";

const DONUT_CORE_COLORS: Record<string, string> = {
    Diablo: "#1D39C4",
    EZARC: "#3B9DF8",
    TOLESA: "#111827",
};

const DONUT_PRESET_COLORS = [
    "#0050B3",
    "#096DD9",
    "#1890FF",
    "#40A9FF",
    "#69C0FF",
    "#91D5FF",
    "#006D75",
    "#08979C",
    "#13C2C2",
    "#36CFC9",
    "#5CDBD3",
    "#87E8DE",
    "#2F54EB",
    "#597EF7",
    "#85A5FF",
    "#ADC6FF",
];

const DONUT_OTHER_COLOR = "#BFBFBF";

const aggregateStats = (
    stats: BrandStat[],
    topN: number,
    totals: { count: number; sales: number; volume: number },
    key: BrandSortKey,
    pinnedBrands: string[] = []
) => {
    const sorted = [...stats].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    if (topN <= 0 || topN >= sorted.length) {
        return sorted;
    }
    const top = sorted.slice(0, topN);
    const rest = sorted.slice(topN);
    const pinnedSet = new Set(pinnedBrands);
    const topBrands = new Set(top.map((item) => item.brand));
    const pinnedItems = rest.filter((item) => pinnedSet.has(item.brand) && !topBrands.has(item.brand));
    const restForOthers = rest.filter((item) => !pinnedSet.has(item.brand));
    const others = restForOthers.reduce(
        (acc, item) => {
            acc.count += item.count;
            acc.sales += item.sales;
            acc.salesVolume += item.salesVolume;
            return acc;
        },
        { count: 0, sales: 0, salesVolume: 0 }
    );
    if (others.count === 0 && others.sales === 0 && others.salesVolume === 0) {
        return top;
    }
    const countShare = totals.count > 0 ? (others.count / totals.count) * 100 : 0;
    const salesShare = totals.sales > 0 ? (others.sales / totals.sales) * 100 : 0;
    const salesVolumeShare = totals.volume > 0 ? (others.salesVolume / totals.volume) * 100 : 0;
    const result: BrandStat[] = [...top, ...pinnedItems];
    if (others.count || others.sales || others.salesVolume) {
        result.push({
            brand: "其他 (Others)",
            count: others.count,
            countShare,
            sales: others.sales,
            salesShare,
            salesVolume: others.salesVolume,
            salesVolumeShare,
            deltaCount: null,
        });
    }
    return result;
};

const selectTopStats = (stats: BrandStat[], topN: number, key: BrandSortKey) => {
    const sorted = [...stats].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    if (topN <= 0 || topN >= sorted.length) return sorted;
    return sorted.slice(0, topN);
};

const buildDonutData = (stats: BrandStat[], key: DonutValueKey, pinnedBrands: string[] = []) => {
    const total = stats.reduce((sum, stat) => sum + (stat[key] || 0), 0);
    const sorted = [...stats].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const entries: { name: string; value: number; isOthers?: boolean }[] = [];
    let othersValue = 0;
    const pinnedSet = new Set(pinnedBrands);

    sorted.forEach((stat) => {
        if (stat.brand === "其他 (Others)") {
            othersValue += stat[key] || 0;
            return;
        }
        if (pinnedSet.has(stat.brand)) {
            entries.push({ name: stat.brand, value: stat[key] || 0 });
            return;
        }
        const value = stat[key] || 0;
        const share = total > 0 ? (value / total) * 100 : 0;
        if (share < 1) {
            othersValue += value;
            return;
        }
        entries.push({ name: stat.brand, value });
    });

    if (othersValue > 0) {
        entries.push({ name: "其他 (Others)", value: othersValue, isOthers: true });
    }

    const palette = DONUT_PRESET_COLORS.filter(
        (color) => !Object.values(DONUT_CORE_COLORS).includes(color)
    );
    let paletteIndex = 0;

    return entries.map((entry) => {
        if (entry.isOthers) {
            return {
                ...entry,
                itemStyle: { color: DONUT_OTHER_COLOR },
            };
        }
        const coreColor = DONUT_CORE_COLORS[entry.name];
        if (coreColor) {
            return {
                ...entry,
                itemStyle: { color: coreColor },
            };
        }
        const color = palette[paletteIndex % palette.length];
        paletteIndex += 1;
        return {
            ...entry,
            itemStyle: { color },
        };
    });
};

export function OverviewBoard({
    collapsed = false,
    onToggleCollapse,
}: {
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}) {
    const chartRefRevenue = useRef<HTMLDivElement>(null);
    const chartRefVolume = useRef<HTMLDivElement>(null);
    const dateDropdownRef = useRef<HTMLDivElement>(null);
    const [dateOptions, setDateOptions] = useState<string[]>([]);
    const [dateFilter, setDateFilter] = useState("");
    const [dateLoading, setDateLoading] = useState(false);
    const [dateError, setDateError] = useState<string | null>(null);
    const [dateOpen, setDateOpen] = useState(false);
    const [bsrItems, setBsrItems] = useState<any[]>([]);
    const [prevBsrItems, setPrevBsrItems] = useState<any[]>([]);
    const [bsrLoading, setBsrLoading] = useState(false);
    const [bsrError, setBsrError] = useState<string | null>(null);
    const [positionTopN, setPositionTopN] = useState(10);
    const [volumeTopN, setVolumeTopN] = useState(10);
    const [revenueTopN, setRevenueTopN] = useState(10);
    const handleToggleCollapse = () => onToggleCollapse?.();
    const handleToggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
            return;
        }
        document.documentElement.requestFullscreen?.();
    };

    const prevDate = useMemo(() => {
        if (!dateFilter) return "";
        const idx = dateOptions.indexOf(dateFilter);
        if (idx >= 0 && idx + 1 < dateOptions.length) {
            return dateOptions[idx + 1];
        }
        return "";
    }, [dateOptions, dateFilter]);

    // 1. 数据聚合与处理
    const { brandStats, totalCount, ezarcCount, tolesaCount, ezarcVolume, tolesaVolume, ezarcSales, tolesaSales } = useMemo(() => {
        const sourceItems = bsrItems.length > 0 ? bsrItems : mockBsrItems;
        const prevItems = prevBsrItems.length > 0 ? prevBsrItems : [];
        const prevCountMap = new Map<string, number>();
        prevItems.forEach((item: any) => {
            const brand = item.brand || "Unknown";
            prevCountMap.set(brand, (prevCountMap.get(brand) || 0) + 1);
        });

        const statsMap = new Map<string, { count: number; sales: number; volume: number }>();
        let totalSales = 0;
        let totalVolume = 0;
        let totalCount = 0;

        sourceItems.forEach((item: any) => {
            const sales = item.sales ?? item.estRevenue ?? 0;
            const volume = item.sales_volume ?? item.estSales ?? 0;
            const current = statsMap.get(item.brand) || { count: 0, sales: 0, volume: 0 };
            statsMap.set(item.brand, {
                count: current.count + 1,
                sales: current.sales + sales,
                volume: current.volume + volume,
            });
            totalSales += sales;
            totalVolume += volume;
            totalCount += 1;
        });

        const stats: BrandStat[] = Array.from(statsMap.entries()).map(([brand, data]) => {
            const prevCount = prevDate ? prevCountMap.get(brand) || 0 : 0;
            const delta = prevDate ? data.count - prevCount : null;
            return {
                brand,
                count: data.count,
                sales: data.sales,
                countShare: (data.count / totalCount) * 100,
                salesShare: totalSales > 0 ? (data.sales / totalSales) * 100 : 0,
                salesVolume: data.volume,
                salesVolumeShare: totalVolume > 0 ? (data.volume / totalVolume) * 100 : 0,
                deltaCount: delta,
            };
        });

        // Sort by count descending
        stats.sort((a, b) => b.count - a.count);

        const ezarc = stats.find(s => s.brand === "EZARC");
        const tolesa = stats.find(s => s.brand === "TOLESA");

        return {
            brandStats: stats,
            totalCount,
            ezarcCount: ezarc?.count || 0,
            tolesaCount: tolesa?.count || 0,
            ezarcVolume: ezarc?.salesVolume || 0,
            tolesaVolume: tolesa?.salesVolume || 0,
            ezarcSales: ezarc?.sales || 0,
            tolesaSales: tolesa?.sales || 0,
        };
    }, [bsrItems, prevBsrItems, prevDate]);

    const totals = useMemo(
        () => ({
            count: brandStats.reduce((sum, item) => sum + item.count, 0),
            sales: brandStats.reduce((sum, item) => sum + item.sales, 0),
            volume: brandStats.reduce((sum, item) => sum + item.salesVolume, 0),
        }),
        [brandStats]
    );

    const displayByCount = useMemo(
        () => selectTopStats(brandStats, positionTopN, "count"),
        [brandStats, positionTopN]
    );
    const displayByVolume = useMemo(
        () => aggregateStats(brandStats, volumeTopN, totals, "salesVolume", ["EZARC", "TOLESA"]),
        [brandStats, volumeTopN, totals]
    );
    const displayByRevenue = useMemo(
        () => aggregateStats(brandStats, revenueTopN, totals, "sales", ["EZARC", "TOLESA"]),
        [brandStats, revenueTopN, totals]
    );

    const salesRevenueDonutData = useMemo(
        () => buildDonutData(displayByRevenue, "sales", ["EZARC", "TOLESA"]),
        [displayByRevenue]
    );
    const salesVolumeDonutData = useMemo(
        () => buildDonutData(displayByVolume, "salesVolume", ["EZARC", "TOLESA"]),
        [displayByVolume]
    );

    const buildDonutOption = (
        data: { name: string; value: number }[],
        formatValue: (value: number) => string
    ) => {
        const valueMap = new Map<string, number>();
        data.forEach((item) => valueMap.set(item.name, item.value));

        return {
            tooltip: {
                trigger: "item",
                backgroundColor: "rgba(255, 255, 255, 0.98)",
                borderWidth: 0,
                shadowBlur: 10,
                shadowColor: "rgba(0, 0, 0, 0.1)",
                padding: [12, 16],
                textStyle: { color: "#1F2937", fontSize: 13 },
                formatter: (params: any) => {
                    return `
                        <div style="font-weight: 600; margin-bottom: 4px;">${params.name}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                            <span style="color: #6B7280; font-size: 12px;">占比</span>
                            <span style="font-weight: 500;">${params.percent}%</span>
                        </div>
                    `;
                },
            },
            legend: {
                type: "scroll",
                orient: "vertical",
                right: 0,
                top: 12,
                bottom: 12,
                itemWidth: 12,
                itemHeight: 12,
                itemGap: 14,
                textStyle: {
                    fontSize: 13,
                    rich: {
                        em: { color: "#111827", fontWeight: 600 },
                        normal: { color: "#6B7280" },
                    },
                },
                pageButtonPosition: "end",
                pageIconSize: 10,
                formatter: (name: string) => {
                    const value = valueMap.get(name) ?? 0;
                    const label = `${name}  ${formatValue(value)}`;
                    return name === "EZARC" || name === "TOLESA" ? `{em|${label}}` : `{normal|${label}}`;
                },
            },
            series: [
                {
                    type: "pie",
                    radius: ["58%", "82%"],
                    center: ["32%", "50%"],
                    padAngle: 4,
                    itemStyle: { borderRadius: 10 },
                    data,
                    label: { show: false },
                    labelLine: { show: false },
                    emphasis: {
                        scale: true,
                        scaleSize: 5,
                    },
                },
            ],
        };
    };

    const getBrandBarStyle = (_brand: string) => ({
        bar: "bg-[#111827]",
        text: "text-gray-900",
    });

    const getBrandColor = (brand: string) => {
        if (brand === "其他 (Others)") return "#D1D5DB";
        if (brand === "Diablo") return "#1D39C4";
        if (brand === "EZARC") return "#3B9DF8";
        if (brand === "TOLESA") return "#111827";
        return "#9CA3AF";
    };

    const formatCountLabel = (count: number) => `${count} 坑位`;

    // 2. ECharts 初始化 - Revenue Share Chart
    useEffect(() => {
        if (!chartRefRevenue.current) return;

        const chart = echarts.init(chartRefRevenue.current);
        chart.setOption(
            buildDonutOption(salesRevenueDonutData, (value) =>
                `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
            )
        );

        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            chart.dispose();
        };
    }, [salesRevenueDonutData]);

    useEffect(() => {
        if (!chartRefVolume.current) return;

        const chart = echarts.init(chartRefVolume.current);
        chart.setOption(
            buildDonutOption(salesVolumeDonutData, (value) => value.toLocaleString())
        );

        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            chart.dispose();
        };
    }, [salesVolumeDonutData]);

    useEffect(() => {
        const controller = new AbortController();
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        const fetchDates = async () => {
            setDateLoading(true);
            setDateError(null);
            try {
                const res = await fetch(`${apiBase}/api/bsr/dates`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ site: "US" }),
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const items = Array.isArray(data.items) ? data.items : [];
                setDateOptions(items);
                if (!dateFilter && items.length > 0) {
                    setDateFilter(items[0]);
                }
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setDateError("日期加载失败");
            } finally {
                setDateLoading(false);
            }
        };
        fetchDates();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!dateFilter) return;
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        const controller = new AbortController();
        const fetchData = async () => {
            setBsrLoading(true);
            setBsrError(null);
            try {
                const currentPromise = fetch(`${apiBase}/api/bsr/query`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 2000, offset: 0, createtime: dateFilter }),
                    signal: controller.signal,
                }).then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                });

                const prevPromise = prevDate
                    ? fetch(`${apiBase}/api/bsr/query`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ limit: 2000, offset: 0, createtime: prevDate }),
                        signal: controller.signal,
                    }).then(res => res.ok ? res.json() : null)
                    : Promise.resolve(null);

                const [currentData, prevData] = await Promise.all([currentPromise, prevPromise]);
                setBsrItems(Array.isArray(currentData.items) ? currentData.items : []);
                setPrevBsrItems(prevData && Array.isArray(prevData.items) ? prevData.items : []);
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setBsrError("BSR 数据加载失败");
                setBsrItems([]);
                setPrevBsrItems([]);
            } finally {
                setBsrLoading(false);
            }
        };
        fetchData();
        return () => controller.abort();
    }, [dateFilter, prevDate]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dateOpen && dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
                setDateOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dateOpen]);


    const combinedShare = ((ezarcCount + tolesaCount) / totalCount * 100).toFixed(0);

    const topCards = [
        {
            title: "Brand Slots",
            value: (ezarcCount + tolesaCount).toString(),
            subLabel: "EZARC + TOLESA",
            bg: "bg-[#3B9DF8]", // Bright Blue
            text: "text-white",
            subText: "text-blue-100",
            iconColor: "text-blue-200",
        },
        {
            title: "Share",
            value: `${combinedShare}%`,
            subLabel: "Top100",
            bg: "bg-[#1C1C1E]", // Black
            text: "text-white",
            subText: "text-gray-400",
            iconColor: "text-gray-600",
        },
        {
            title: "Sales volume",
            value: (ezarcVolume + tolesaVolume).toLocaleString(),
            subLabel: "EZARC + TOLESA",
            bg: "bg-[#3B9DF8]", // Bright Blue
            text: "text-white",
            subText: "text-blue-100",
            iconColor: "text-blue-200",
        },
        {
            title: "Sales",
            value: `$${(ezarcSales + tolesaSales).toLocaleString()}`,
            subLabel: "",
            bg: "bg-[#1C1C1E]", // Black
            text: "text-white",
            subText: "text-gray-400",
            iconColor: "text-gray-600",
        },
    ];

    return (
        <main
            className={`flex-1 ${collapsed ? "ml-20" : "ml-56"} p-8 transition-all duration-300 bg-[#F7F9FB] min-h-screen text-gray-800`}
        >
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
                    <span className="text-gray-900 font-medium">Overview</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400">Date</span>
                        <div className="relative w-40" ref={dateDropdownRef}>
                            <button
                                onClick={() => setDateOpen(!dateOpen)}
                                disabled={dateLoading || dateOptions.length === 0}
                                className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm font-medium text-gray-700 transition disabled:opacity-50"
                            >
                                <span className="truncate">
                                    {dateFilter || (dateLoading ? "加载中..." : dateError ? "加载失败" : "选择日期")}
                                </span>
                                <CaretDown size={14} className={`text-gray-400 transition-transform ${dateOpen ? "rotate-180" : ""}`} />
                            </button>

                            {dateOpen && (
                                <div className="z-20 absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {dateOptions.map((date) => (
                                            <button
                                                key={date}
                                                onClick={() => {
                                                    setDateFilter(date);
                                                    setDateOpen(false);
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
                    {bsrLoading && <span className="text-xs text-gray-400">加载中...</span>}
                    {bsrError && <span className="text-xs text-red-500">{bsrError}</span>}
                    <button
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-600"
                        onClick={handleToggleFullscreen}
                        title="全屏"
                    >
                        <CornersOut size={18} />
                    </button>
                </div>
            </header>

            {/* Top Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {topCards.map((card, index) => {
                    const isDark = index % 2 === 0;
                    const bgClass = isDark ? "bg-[#1C1C1E]" : "bg-[#3B9DF8]";
                    const textClass = "text-white";
                    const subTextClass = isDark ? "text-gray-400" : "text-blue-100";
                    const iconClass = isDark ? "text-gray-600" : "text-blue-200";
                    return (
                        <div
                            key={index}
                            className={`${bgClass} rounded-3xl p-6 relative overflow-hidden shadow-lg card-hover-lift`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <span className={`text-sm font-medium opacity-90 ${textClass}`}>
                                    {card.title}
                                </span>
                                <div className={`p-1 rounded-lg bg-white/10 ${iconClass}`}>
                                    <CornersOut size={16} />
                                </div>
                            </div>
                            <div className="flex justify-between items-end">
                                <h2 className={`text-3xl font-semibold ${textClass}`}>{card.value}</h2>
                                {card.subLabel && (
                                    <span className={`text-xs font-medium ${subTextClass}`}>
                                        {card.subLabel}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </section>

            {/* Charts Section */}
            <section className="space-y-6 mb-6">
                {/* Brand Positioning */}
                <div className="bg-white p-5 rounded-3xl shadow-sm">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">品牌占位</h3>
                            <p className="text-xs text-gray-400 mt-1">Top100 各品牌坑位数与占比</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {[10, 20, 0].map((value) => {
                                const label = value === 0 ? "All" : `Top${value}`;
                                const active = positionTopN === value;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => setPositionTopN(value)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${active
                                            ? "bg-[#111827] text-white border-[#111827]"
                                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                            }`}
                                        type="button"
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-gray-400 mb-4 px-1">
                        <span>Brand</span>
                        <span>Share</span>
                    </div>
                    <div className="space-y-4">
                        {displayByCount.map((stat, idx) => {
                            const style = getBrandBarStyle(stat.brand);
                            const isOwn = stat.brand === "EZARC" || stat.brand === "TOLESA";
                            return (
                                <div key={stat.brand} className="flex items-center gap-4">
                                    <div className="w-48">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-400 w-5">#{idx + 1}</span>
                                            <span className={`text-sm ${style.text}`}>{stat.brand}</span>
                                            {isOwn && (
                                                <span className="bg-[#EEF2FF] text-[#4F46E5] text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                    OWN
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 ml-7">
                                            {formatCountLabel(stat.count)}
                                        </div>
                                    </div>
                                    <div className="flex-1 h-3 bg-gray-50 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${style.bar}`}
                                            style={{ width: `${stat.countShare}%` }}
                                        />
                                    </div>
                                    <div className="w-14 text-right">
                                        <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                                            {stat.countShare.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Sales Share Charts (Below) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm flex flex-col min-h-[420px]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">销量对比</h3>
                            <div className="flex items-center gap-2">
                                {[10, 20, 0].map((value) => {
                                    const label = value === 0 ? "All" : `Top${value}`;
                                    const active = volumeTopN === value;
                                    return (
                                        <button
                                            key={label}
                                            onClick={() => setVolumeTopN(value)}
                                            className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${active
                                                ? "bg-[#111827] text-white border-[#111827]"
                                                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                                }`}
                                            type="button"
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div ref={chartRefVolume} className="w-full h-80" />
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm flex flex-col min-h-[420px]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">销售额对比</h3>
                            <div className="flex items-center gap-2">
                                {[10, 20, 0].map((value) => {
                                    const label = value === 0 ? "All" : `Top${value}`;
                                    const active = revenueTopN === value;
                                    return (
                                        <button
                                            key={label}
                                            onClick={() => setRevenueTopN(value)}
                                            className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${active
                                                ? "bg-[#111827] text-white border-[#111827]"
                                                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                                }`}
                                            type="button"
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="relative">
                            <div ref={chartRefRevenue} className="w-full h-80" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Detailed Table */}
            <section className="bg-white p-5 rounded-3xl shadow-sm mb-12">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">品牌明细</h3>
                    <div />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center table-fixed">
                        <colgroup>
                            <col style={{ width: "72px" }} />
                            <col style={{ width: "200px" }} />
                            <col style={{ width: "90px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "130px" }} />
                            <col style={{ width: "110px" }} />
                        </colgroup>
                        <thead className="text-gray-400 font-normal text-xs uppercase tracking-wider border-b border-gray-100">
                            <tr>
                                <th className="font-medium py-3 px-2 text-center w-16">排名</th>
                                <th className="font-medium py-3 px-2 text-center">品牌</th>
                                <th className="font-medium py-3 px-2 text-center">坑位数</th>
                                <th className="font-medium py-3 px-3 text-center">坑位占比</th>
                                <th className="font-medium py-3 px-3 text-center">
                                    坑位变化{prevDate ? `（vs ${prevDate}）` : ""}
                                </th>
                                <th className="font-medium py-3 px-3 text-center">销量</th>
                                <th className="font-medium py-3 px-3 text-center">销量占比</th>
                                <th className="font-medium py-3 px-3 text-center">销售额</th>
                                <th className="font-medium py-3 px-3 text-center">销售额占比</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {brandStats.map((row, idx) => {
                                const isOwn = row.brand === "EZARC" || row.brand === "TOLESA";
                                return (
                                    <tr
                                        key={row.brand}
                                        className={`hover:bg-gray-50 transition ${isOwn ? "bg-[#EEF2FF]" : ""}`}
                                    >
                                        <td className="py-3 px-2 text-center text-gray-400 font-medium">
                                            #{idx + 1}
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            <div className="flex items-center gap-2 justify-center">
                                                <span className="font-medium text-gray-900">
                                                    {row.brand}
                                                </span>
                                                {isOwn && (
                                                    <span className="bg-[#EEF2FF] text-[#4F46E5] text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                        OWN
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 text-center text-gray-600">
                                            {row.count}
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600">
                                            {row.countShare.toFixed(1)}%
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600">
                                            {row.deltaCount === null ? (
                                                "-"
                                            ) : (
                                                <span
                                                    className={`font-semibold ${row.deltaCount > 0
                                                        ? "text-green-600"
                                                        : row.deltaCount < 0
                                                            ? "text-red-500"
                                                            : "text-gray-500"
                                                        }`}
                                                >
                                                    {row.deltaCount > 0 ? `+${row.deltaCount}` : row.deltaCount}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600">
                                            {row.salesVolume.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600">
                                            {row.salesVolumeShare.toFixed(1)}%
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600 font-mono">
                                            {row.sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-3 px-3 text-center text-gray-600">
                                            {row.salesShare.toFixed(1)}%
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

        </main>
    );
}
