import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from "../api/auth";
import { onUnauthorized, tokenStorage } from "../api/client";
import type { User } from "../api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** 令牌失效等被动登出时给登录页的提示 */
  notice: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);

  const clearSession = useCallback((message?: string) => {
    tokenStorage.clear();
    setUser(null);
    setStatus("anonymous");
    if (message) setNotice(message);
  }, []);

  // 任意接口返回 401 时，清掉本地状态并回到登录页
  useEffect(() => {
    return onUnauthorized(() => {
      clearSession("登录状态已失效，请重新登录");
    });
  }, [clearSession]);

  // 刷新页面：有令牌就向后端重新校验一次，校验不过就当作未登录
  useEffect(() => {
    if (!tokenStorage.get()) {
      setStatus("anonymous");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchCurrentUser();
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await loginRequest(username.trim(), password);
      tokenStorage.set(result.access_token);

      try {
        // 登录成功后仍然以 /auth/me 的结果作为「已登录」的依据
        const me = await fetchCurrentUser();
        setUser(me);
        setStatus("authenticated");
        setNotice(null);
      } catch (error) {
        clearSession();
        throw error;
      }
    },
    [clearSession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // 后端不可用时也要清理前端状态，避免卡在功能页
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, notice, login, logout, clearNotice }),
    [user, status, notice, login, logout, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内部使用");
  }
  return context;
}
