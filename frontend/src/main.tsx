import { ConfigProvider, theme } from "antd";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyAuthToken, initDingTalkAuth } from "./auth/dingtalk";
import "./styles.css";

const storedToken = localStorage.getItem("auth_token");
const storedUser = localStorage.getItem("auth_user");
const hasCachedSession = Boolean(storedToken && storedUser);
if (storedToken) {
  applyAuthToken(storedToken);
}

if (import.meta.env.DEV) {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  const sendDevLog = (payload: { level: string; message: string; stack?: string; context?: any }) => {
    try {
      fetch(`${apiBase}/api/dev/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    } catch {
      // ignore
    }
  };

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    sendDevLog({
      level: "error",
      message: event.message || err?.message || "Unknown error",
      stack: err?.stack,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | undefined;
    sendDevLog({
      level: "error",
      message: reason?.message || String(event.reason || "Unhandled rejection"),
      stack: reason?.stack,
    });
  });
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(hasCachedSession);

  useEffect(() => {
    if (hasCachedSession) {
      return;
    }

    let mounted = true;
    initDingTalkAuth()
      .then(async (result) => {
        if (!mounted || !result) return;
        if (result.token) {
          localStorage.setItem("auth_token", result.token);
          applyAuthToken(result.token);
        }
        const updateUser = (user: any) => {
          localStorage.setItem("auth_user", JSON.stringify(user));
          window.dispatchEvent(new Event("auth_user_updated"));
        };
        if (result.user) {
          updateUser(result.user);
          if (!result.user.avatar_url && !result.user.avatar) {
            try {
              const apiBase = import.meta.env.VITE_API_BASE_URL || "";
              const res = await fetch(`${apiBase}/api/auth/dingtalk/refresh-user`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              if (res.ok) {
                const data = await res.json();
                if (data?.user) {
                  updateUser(data.user);
                }
              }
            } catch (err) {
              console.warn("DingTalk avatar refresh skipped:", err);
            }
          }
        }
      })
      .catch((err) => {
        console.warn("DingTalk auth skipped:", err);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FB] text-gray-500 text-sm">
        正在登录...
      </div>
    );
  }

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <AuthGate>
        <App />
      </AuthGate>
    </ConfigProvider>
  </React.StrictMode>
);


