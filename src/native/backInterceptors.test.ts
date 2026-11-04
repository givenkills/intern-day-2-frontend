import { afterEach, describe, expect, it, vi } from "vitest";

import { registerBackInterceptor, runBackInterceptors } from "./backInterceptors";

const cleanups: Array<() => void> = [];

function register(interceptor: () => boolean): () => void {
  const cleanup = registerBackInterceptor(interceptor);
  cleanups.push(cleanup);
  return cleanup;
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("backInterceptors", () => {
  it("后注册的拦截器先执行", () => {
    const calls: string[] = [];
    register(() => {
      calls.push("first");
      return false;
    });
    register(() => {
      calls.push("second");
      return false;
    });

    expect(runBackInterceptors()).toBe(false);
    expect(calls).toEqual(["second", "first"]);
  });

  it("任一拦截器消费后立即停止，不再询问更早的拦截器", () => {
    const outer = vi.fn(() => false);
    register(outer);
    register(() => true);

    expect(runBackInterceptors()).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it("全部返回 false 时交还外层处理", () => {
    register(() => false);
    register(() => false);

    expect(runBackInterceptors()).toBe(false);
  });

  it("注销后不再执行，重复注销不报错", () => {
    const handler = vi.fn(() => true);
    const cleanup = register(handler);

    cleanup();
    cleanup();

    expect(runBackInterceptors()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
