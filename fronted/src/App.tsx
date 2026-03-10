import {
  ChartLineUp,
  ChartPieSlice,
  CheckCircle,
  Cube,
  ShoppingBag,
  Shield,
} from "@phosphor-icons/react";
import { Suspense, lazy, useEffect, useState } from "react";

import { syncDebugActorHeader } from "./auth/dingtalk";
import {
  getDebugActor,
  getStoredUser,
  getUserAvatar,
  getUserName,
  getUserRole,
  setDebugActor,
  type DebugActor,
} from "./auth/user";

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
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const [currentPage, setCurrentPage] = useState<Page>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [userRole] = useState(() => getUserRole(storedUser));
  const [debugActor, setDebugActorState] = useState<DebugActor | null>(() => getDebugActor());
  const [activeRole, setActiveRole] = useState(userRole);
  const testModeEnabled = String(import.meta.env.VITE_ENABLE_TEST_MODE || "").trim().toLowerCase() === "true";
  const canManagePermissions = activeRole === "admin" || activeRole === "team_lead";
  const displayName = debugActor === "user_a"
    ? "测试用户A"
    : debugActor === "user_b"
      ? "测试用户B"
      : (getUserName(storedUser) || "未登录");
  const avatarUrl = getUserAvatar(storedUser);
  const fallbackAvatar = `https://i.pravatar.cc/150?u=${encodeURIComponent(displayName)}`;
  const handleToggleCollapsed = () => setCollapsed((prev) => !prev);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setUserVersion((version) => version + 1);
    window.addEventListener("auth_user_updated", handler);
    return () => window.removeEventListener("auth_user_updated", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setDebugActorState(getDebugActor());
    window.addEventListener("debug_actor_updated", handler);
    return () => window.removeEventListener("debug_actor_updated", handler);
  }, []);

  useEffect(() => {
    if (userRole === "admin" && testModeEnabled) return;
    if (getDebugActor()) {
      setDebugActor(null);
    }
  }, [userRole, testModeEnabled]);

  useEffect(() => {
    syncDebugActorHeader();
  }, [debugActor]);

  useEffect(() => {
    let cancelled = false;
    const refreshEffectiveUser = async () => {
      try {
        const res = await fetch(`${apiBase}/api/auth/me`);
        if (!res.ok) return;
        const data = await res.json();
        const role = String(data?.user?.role || "").trim().toLowerCase();
        if (!cancelled && (role === "admin" || role === "team_lead" || role === "operator")) {
          setActiveRole(role);
        }
      } catch {
        // keep previous role when request fails
      }
    };
    refreshEffectiveUser();
    return () => {
      cancelled = true;
    };
  }, [apiBase, debugActor, userRole]);

  const navItems = [
    { key: "overview" as Page, icon: <ChartPieSlice weight="fill" />, label: "Overview" },
    { key: "bsr" as Page, icon: <ShoppingBag />, label: "Best Sellers" },
    { key: "products" as Page, icon: <Cube />, label: "Products" },
    { key: "todo" as Page, icon: <CheckCircle />, label: "ToDo" },
    { key: "ai-insights" as Page, icon: <ChartLineUp />, label: "AI Insights" },
    ...(canManagePermissions ? [{ key: "permissions" as Page, icon: <Shield />, label: "Permissions" }] : []),
  ];

  const renderCurrentPage = () => {
    if (currentPage === "permissions" && !canManagePermissions) {
      return <OverviewBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} />;
    }
    if (currentPage === "bsr") {
      return (
        <BsrBoard
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapsed}
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
      return <PermissionBoard collapsed={collapsed} onToggleCollapse={handleToggleCollapsed} currentRole={activeRole} />;
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
                <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain" />
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
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-700">{displayName}</span>
                  {userRole === "admin" && testModeEnabled && (
                    <div className="mt-2">
                      <label className="block text-[10px] text-gray-400 mb-1">测试身份</label>
                      <select
                        value={debugActor || ""}
                        onChange={(e) => {
                          const next = String(e.target.value || "").trim();
                          if (next === "user_a" || next === "user_b") {
                            setDebugActor(next);
                            return;
                          }
                          setDebugActor(null);
                        }}
                        className="w-full text-[11px] rounded-lg border border-gray-200 px-2 py-1 bg-gray-50 text-gray-700 mb-2"
                      >
                        <option value="">真实用户</option>
                        <option value="user_a">测试用户A（运营）</option>
                        <option value="user_b">测试用户B（组长）</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
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
