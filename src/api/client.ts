/**
 * 统一的后端请求封装。
 *
 * 关键约定：
 * 1. API 地址默认按「当前页面所在主机」推导，这样同一份代码在桌面（localhost）、
 *    安卓模拟器（10.0.2.2）、局域网真机（192.168.x.x）都能连到宿主机后端。
 *    也可以用 VITE_API_BASE_URL 显式覆盖。
 * 2. 令牌存在 localStorage，每次请求放在 Authorization 头里。
 * 3. 任何带令牌的请求返回 401 时，触发全局回调，由 AuthProvider 清理登录状态。
 */

/** 从当前页面地址推导后端地址：把前端端口换成后端端口，主机名保持不变。 */
function inferApiBaseUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || inferApiBaseUrl()).replace(/\/+$/, "");

const TOKEN_KEY = "intern-day-2.access-token";

export class ApiError extends Error {
  /** HTTP 状态码；0 表示网络层失败（后端没启动、端口不通等） */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 把任意异常整理成可以直接展示给用户的一句话。 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}

export const tokenStorage = {
  get(): string | null {
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

let unauthorizedHandler: (() => void) | null = null;

/** 注册「令牌失效」的全局处理，返回的函数用于取消注册。 */
export function onUnauthorized(handler: (() => void) | null): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** 是否携带登录令牌，登录接口本身不需要 */
  auth?: boolean;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object") {
      const payload = data as { detail?: unknown; errors?: unknown };

      if (typeof payload.detail === "string") {
        return payload.detail;
      }
      // FastAPI 默认的校验错误格式：[{loc, msg, type}]
      if (Array.isArray(payload.detail) && payload.detail.length > 0) {
        const first = payload.detail[0] as { msg?: string };
        if (first.msg) return first.msg;
      }
      // 本项目自定义的校验错误格式：{detail, errors: [{field, message}]}
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const first = payload.errors[0] as { field?: string; message?: string };
        return first.field ? `${first.field}：${first.message ?? "格式不正确"}` : "参数格式不正确";
      }
    }
  } catch {
    // 响应不是 JSON，落到下面的兜底提示
  }
  return `请求失败（HTTP ${response.status}）`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "无法连接后端服务，请确认后端已启动（默认 http://localhost:8000）");
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 401 && auth) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
