import {
  ChartLineUp,
  ChartPieSlice,
  CheckCircle,
  Cube,
  ShoppingBag,
  Shield,
  Snowflake,
} from "@phosphor-icons/react";
import { Suspense, lazy, useEffect, useState } from "react";

import { getStoredUser, getUserAvatar, getUserName, getUserRole } from "./auth/user";

type Page =
  | "overview"
  | "bsr"
  | "todo"
  | "products"
  | "permissions"
  | "ai-insights";

const OverviewBoard = lazy(() =>
  import("./pages/OverviewBoard").then((module) => ({ default: module.OverviewBoard })),
);
const BsrBoard = lazy(() =>
  import("./pages/BsrBoard").then((module) => ({ default: module.BsrBoard })),
);
const ProductBoard = lazy(() =>
  import("./pages/ProductBoard").then((module) => ({ default: module.ProductBoard })),
);
const TodoBoard = lazy(() =>
  import("./pages/TodoBoard").then((module) => ({ default: module.TodoBoard })),
);
const PermissionBoard = lazy(() =>
  import("./pages/PermissionBoard").then((module) => ({ default: module.PermissionBoard })),
);
const AiInsightsBoard = lazy(() =>
  import("./pages/AiInsightsBoard").then((module) => ({ default: module.AiInsightsBoard })),
);

function PageLoading({ collapsed }: { collapsed: boolean }) {
  return (
    <main
      className={`flex-1 ${collapsed ? "ml-20" : "ml-56"} p-8 transition-all duration-300 bg-[#F7F9FB] min-h-screen text-gray-800`}
    >
      <div className="text-sm text-gray-500">页面加载中...</div>
    </main>
  );
}

export default function App() {
  const [, setUserVersion] = useState(0);
  const storedUser = getStoredUser();
  const [currentPage, setCurrentPage] = useState<Page>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [userRole] = useState(() => getUserRole(storedUser));
  const isAdmin = userRole === "admin";
  const displayName = getUserName(storedUser) || "未登录";
  const avatarUrl = getUserAvatar(storedUser);
  const fallbackAvatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(displayName)}`;
  const handleToggleCollapsed = () => setCollapsed((prev) => !prev);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setUserVersion((version) => version + 1);
    window.addEventListener("auth_user_updated", handler);
    return () => window.removeEventListener("auth_user_updated", handler);
  }, []);

  const navItems = [
    { key: "overview" as Page, icon: <ChartPieSlice weight="fill" />, label: "Overview" },
    { key: "bsr" as Page, icon: <ShoppingBag />, label: "BSR" },
    { key: "products" as Page, icon: <Cube />, label: "Products" },
    { key: "todo" as Page, icon: <CheckCircle />, label: "ToDo" },
    { key: "ai-insights" as Page, icon: <ChartLineUp />, label: "AI Insights" },
    ...(isAdmin ? [{ key: "permissions" as Page, icon: <Shield />, label: "Permissions" }] : []),
  ];

  const renderCurrentPage = () => {
    if (currentPage === "permissions" && !isAdmin) {
      return <OverviewBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    if (currentPage === "bsr") {
      return (
        <BsrBoard
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapsed}
          onViewAllProducts={() => setCurrentPage("products")}
          onOpenAiInsights={() => setCurrentPage("ai-insights")}
        />
      );
    }
    if (currentPage === "todo") {
      return <TodoBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    if (currentPage === "products") {
      return <ProductBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    if (currentPage === "ai-insights") {
      return <AiInsightsBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    if (currentPage === "permissions") {
      return <PermissionBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    return <OverviewBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-gray-800">
      <div className="flex">
        <aside className={`${collapsed ? "w-20" : "w-56"} bg-white border-r border-gray-100 flex flex-col fixed h-full z-10 left-0 top-0 overflow-y-auto no-scrollbar transition-all duration-300`}>
          <div className={`p-6 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
            <div className="flex items-center gap-2">
              <div className="text-blue-500 text-3xl">
                <Snowflake weight="fill" />
              </div>
              {!collapsed && (
                <h1 className="text-xl font-bold tracking-tight text-gray-900">
                  Dashboards
                </h1>
              )}
            </div>
          </div>

          <nav className={`flex-1 ${collapsed ? "px-2" : "px-4"} space-y-1`}>
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => setCurrentPage(item.key)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-4 py-3 rounded-xl text-sm font-medium transition ${currentPage === item.key
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
              >
                <span className="text-lg">{item.icon}</span>
                {!collapsed && item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <img
                src={avatarUrl || fallbackAvatar}
                alt="User"
                className="w-8 h-8 rounded-full bg-gray-200"
              />
              {!collapsed && <span className="text-sm font-medium text-gray-700">{displayName}</span>}
            </div>
          </div>
        </aside>

        <Suspense fallback={<PageLoading collapsed={collapsed} />}>
          {renderCurrentPage()}
        </Suspense>
      </div>
    </div>
  );
}
