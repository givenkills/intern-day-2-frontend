import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, DEFAULT_REQUEST_TIMEOUT_MS, onUnauthorized, request } from "./client";

/**
 * 后端不可达时，WebView 可能长时间不返回错误。
 * 这里锁住两条行为：请求有超时上限；超时与连接失败的提示能区分。
 */

const localStorageStub = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: localStorageStub });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request", () => {
  it("正常响应返回解析后的 JSON，并释放超时定时器", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })),
    );

    await expect(request("/health", { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })).resolves.toEqual({
      ok: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("超过超时时间后中断请求，并提示连接超时", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      ),
    );

    const pending = request("/slow", { timeoutMs: 1_000 });
    const assertion = expect(pending).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("超时"),
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("连接被拒绝时保留原来的网络错误提示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const failure = request("/activity/today");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("无法连接后端"),
    });
  });

  it("HTTP 错误优先使用后端返回的 detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ detail: "任务队列暂不可用，总结未提交，请稍后重试" }),
      })),
    );

    await expect(request("/reports/2026-11-03/generate", { method: "POST" })).rejects.toMatchObject({
      status: 503,
      message: "任务队列暂不可用，总结未提交，请稍后重试",
    });
  });

  it("204 不读取 body，正常释放定时器", async () => {
    vi.useFakeTimers();
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 204, json })),
    );

    await expect(request("/no-content", { timeoutMs: 1_000 })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("非 JSON 错误响应回退到 HTTP 状态提示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("not json");
        },
      })),
    );

    await expect(request("/broken-error")).rejects.toMatchObject({
      status: 500,
      message: "请求失败（HTTP 500）",
    });
  });

  it(
    "成功响应头返回后 body 一直不结束，也会被超时中止",
    async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const signal = init?.signal;
          return {
            ok: true,
            status: 200,
            json: () => hangingJson(signal),
          } as unknown as Response;
        }),
      );

      const pending = request("/slow-success-body", { timeoutMs: 1_000 });
      const assertion = expect(pending).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining("超时"),
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    },
    1_000,
  );

  it(
    "错误响应头返回后 body 一直不结束，也按网络超时处理",
    async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const signal = init?.signal;
          return {
            ok: false,
            status: 503,
            json: () => hangingJson(signal),
          } as unknown as Response;
        }),
      );

      const pending = request("/slow-error-body", { timeoutMs: 1_000 });
      const assertion = expect(pending).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining("超时"),
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    },
    1_000,
  );

  it(
    "401 即使 body 读取超时也触发全局登出回调",
    async () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      const unregister = onUnauthorized(handler);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const signal = init?.signal;
          return {
            ok: false,
            status: 401,
            json: () => hangingJson(signal),
          } as unknown as Response;
        }),
      );

      const pending = request("/expired", { timeoutMs: 1_000 });
      const assertion = expect(pending).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining("超时"),
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
      expect(handler).toHaveBeenCalledTimes(1);
      unregister();
      expect(vi.getTimerCount()).toBe(0);
    },
    1_000,
  );
});

function hangingJson(signal: AbortSignal | null | undefined): Promise<unknown> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
