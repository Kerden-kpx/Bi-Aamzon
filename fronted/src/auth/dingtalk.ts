import axios from "axios";

let fetchWrapped = false;
let activeAuthToken = "";

const purgeStoredAuth = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("auth_token");
  window.localStorage.removeItem("auth_user");
  window.dispatchEvent(new Event("auth_user_updated"));
};

export type DingTalkLoginResult = {
  user?: any;
  token?: string | null;
};

const withApiBase = (path: string) => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  return `${apiBase}${path}`;
};

const DEFAULT_AUTH_TIMEOUT_MS = Number(import.meta.env.VITE_DINGTALK_AUTH_TIMEOUT_MS || 8000);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, stage: string): Promise<T> => {
  let timer = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${stage} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
};

export const applyAuthToken = (token: string) => {
  if (!token) return;
  activeAuthToken = token;
  axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  if (fetchWrapped || typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization") && activeAuthToken) {
      headers.set("Authorization", `Bearer ${activeAuthToken}`);
    }
    return originalFetch(input, { ...init, headers }).then((response) => {
      if (response.status === 401) {
        clearAuthToken();
        purgeStoredAuth();
      }
      return response;
    });
  };
  fetchWrapped = true;
};

export const clearAuthToken = () => {
  activeAuthToken = "";
  delete axios.defaults.headers.common.Authorization;
};

const getAuthCode = (corpId: string) =>
  new Promise<{ code?: string; authCode?: string }>((resolve, reject) => {
    const dd = window.dd as any;
    dd.runtime.permission.requestAuthCode({
      corpId,
      onSuccess: (res: any) => resolve(res),
      onFail: (err: any) => reject(err),
    });
  });

const ddConfigReady = (config: {
  corpId: string;
  agentId?: string | number | null;
  timeStamp: string;
  nonceStr: string;
  signature: string;
}) =>
  new Promise<void>((resolve, reject) => {
    const dd = window.dd as any;
    dd.config({
      corpId: config.corpId,
      agentId: config.agentId ? Number(config.agentId) : undefined,
      timeStamp: config.timeStamp,
      nonceStr: config.nonceStr,
      signature: config.signature,
      jsApiList: ["runtime.permission.requestAuthCode"],
    });
    dd.ready(() => resolve());
    dd.error((err: any) => reject(err));
  });

export const initDingTalkAuth = async (): Promise<DingTalkLoginResult | null> => {
  if (typeof window === "undefined" || !(window as any).dd) {
    return null;
  }

  const timeoutMs =
    Number.isFinite(DEFAULT_AUTH_TIMEOUT_MS) && DEFAULT_AUTH_TIMEOUT_MS > 0
      ? DEFAULT_AUTH_TIMEOUT_MS
      : 8000;

  const signRes = await withTimeout(
    fetch(withApiBase("/api/auth/dingtalk/jsapi-sign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: window.location.href.split("#")[0] }),
    }),
    timeoutMs,
    "dingtalk jsapi-sign",
  );
  if (!signRes.ok) {
    throw new Error(`JSAPI sign failed: HTTP ${signRes.status}`);
  }
  const sign = await signRes.json();
  if (!sign?.corpId) {
    throw new Error("Missing corpId in sign response");
  }

  await withTimeout(ddConfigReady(sign), timeoutMs, "dingtalk config");

  const codeRes = await withTimeout(getAuthCode(sign.corpId), timeoutMs, "dingtalk auth-code");
  const authCode = codeRes.code || codeRes.authCode;
  if (!authCode) {
    throw new Error("Missing auth code");
  }

  const loginRes = await withTimeout(
    fetch(withApiBase("/api/auth/dingtalk/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: authCode }),
    }),
    timeoutMs,
    "dingtalk login",
  );
  if (!loginRes.ok) {
    throw new Error(`Login failed: HTTP ${loginRes.status}`);
  }
  const login = await loginRes.json();
  return login;
};
