import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "../api/auth";
import { ApiError, onUnauthorized, tokenStorage } from "../api/client";
import type { RegisterPayload, User } from "../api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

/**
 * 缓存最近一次校验通过的用户信息。
 * 用途：启动时 /auth/me 因网络不可达失败，仍能把界面撑起来，
 * 而不是把已登录的用户直接踢回登录页（Android 上冷启动抢网很常见）。
 */
const CACHED_USER_KEY = "intern-day-2.cached-user";

function readCachedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  if (!user) {
    window.localStorage.removeItem(CACHED_USER_KEY);
    return;
  }
  window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
}

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** 令牌失效等被动登出时给登录页的提示 */
  notice: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
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
    writeCachedUser(null);
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
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const me = await fetchCurrentUser();
          if (cancelled) return;
          setUser(me);
          writeCachedUser(me);
          setStatus("authenticated");
          return;
        } catch (error) {
          if (cancelled) return;

          // 只有 401 才说明令牌真的失效。网络不可达、网关 5xx 都说明不了问题——
          // 之前这里对任何异常都清会话，结果启动时后端刚重启/还没连上网，
          // 已登录的用户就被踢回登录页，看起来像"登录态没保存住"。
          if (error instanceof ApiError && error.status === 401) {
            clearSession("登录状态已失效，请重新登录");
            return;
          }

          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
            if (cancelled) return;
            continue;
          }

          // 重试仍失败：保留令牌，用缓存里的用户信息先把界面撑起来。
          // 后续任何接口返回 401 时仍会被 onUnauthorized 清掉。
          const cached = readCachedUser();
          if (cached) {
            setUser(cached);
            setStatus("authenticated");
            return;
          }
          setStatus("anonymous");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const adoptSession = useCallback(
    async (accessToken: string) => {
      tokenStorage.set(accessToken);
      try {
        // 拿到令牌后仍然以 /auth/me 的结果作为「已登录」的依据
        const me = await fetchCurrentUser();
        setUser(me);
        writeCachedUser(me);
        setStatus("authenticated");
        setNotice(null);
      } catch (error) {
        clearSession();
        throw error;
      }
    },
    [clearSession],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await loginRequest(username.trim(), password);
      await adoptSession(result.access_token);
    },
    [adoptSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const result = await registerRequest(payload);
      await adoptSession(result.access_token);
    },
    [adoptSession],
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
    () => ({ user, status, notice, login, register, logout, clearNotice }),
    [user, status, notice, login, register, logout, clearNotice],
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
