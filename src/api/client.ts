/**
 * 统一的后端请求封装。
 *
 * 关键约定：
 * 1. 地址解析集中在 api/endpoints.ts：浏览器按当前主机推导，Capacitor 里固定走
 *    10.0.2.2（详见该文件的注释）。这里只消费结果，不再自己拼地址——
 *    之前那版在 WebView 里会把 https://localhost 当成后端主机，登录必失败。
 * 2. 令牌存在 localStorage，每次请求放在 Authorization 头里。
 * 3. 任何带令牌的请求返回 401 时，触发全局回调，由 AuthProvider 清理登录状态。
 */

import { resolveApiBaseUrl } from "./endpoints";

const API_BASE_URL = resolveApiBaseUrl();

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
  /**
   * 单次请求的超时毫秒数。浏览器/WebView 在主机不可达时可能长时间不返回，
   * 没有上限会让按钮一直停在“生成中…”，用户既看不到错误也无法重试。
   */
  timeoutMs?: number;
}

/** 默认请求超时：15 秒足够覆盖正常接口，又不会让用户无限等待。 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

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
  const { method = "GET", body, auth = true, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        0,
        `连接后端超时（${API_BASE_URL}），请检查网络或后端服务状态后重试`,
      );
    }
    throw new ApiError(
      0,
      `无法连接后端（${API_BASE_URL}），请确认后端已启动，且当前设备能访问该地址`,
    );
  } finally {
    clearTimeout(timer);
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
