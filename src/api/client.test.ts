import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, DEFAULT_REQUEST_TIMEOUT_MS, request } from "./client";

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
});
