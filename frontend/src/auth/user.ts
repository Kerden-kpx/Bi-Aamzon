export type AuthUser = {
  dingtalk_userid?: string;
  dingtalk_username?: string;
  avatar_url?: string;
  avatar?: string;
  userid?: string;
  username?: string;
  role?: string;
};

export type DebugActor = "user_a" | "user_b";
const DEBUG_ACTOR_STORAGE_KEY = "debug_actor_override";

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("auth_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const getUserRole = (user: AuthUser | null): string => {
  return user?.role || "operator";
};

export const getUserId = (user: AuthUser | null): string => {
  return user?.dingtalk_userid || user?.userid || "";
};

export const getUserName = (user: AuthUser | null): string => {
  return user?.dingtalk_username || user?.username || "";
};

export const getUserAvatar = (user: AuthUser | null): string => {
  return user?.avatar_url || user?.avatar || "";
};

export const getDebugActor = (): DebugActor | null => {
  if (typeof window === "undefined") return null;
  const value = String(window.localStorage.getItem(DEBUG_ACTOR_STORAGE_KEY) || "").trim().toLowerCase();
  if (value === "user_a" || value === "user_b") return value;
  return null;
};

export const setDebugActor = (actor: DebugActor | null): void => {
  if (typeof window === "undefined") return;
  if (actor) {
    window.localStorage.setItem(DEBUG_ACTOR_STORAGE_KEY, actor);
  } else {
    window.localStorage.removeItem(DEBUG_ACTOR_STORAGE_KEY);
  }
  window.dispatchEvent(new Event("debug_actor_updated"));
};
