export type AuthUser = {
  dingtalk_userid?: string;
  dingtalk_username?: string;
  avatar_url?: string;
  avatar?: string;
  userid?: string;
  username?: string;
  role?: string;
};

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
