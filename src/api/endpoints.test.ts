import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveApiBaseUrl, resolveRuntimeUrl } from "./endpoints";

/**
 * 地址解析是本次唯一的"配置型业务逻辑"，三种运行环境各一条路径，
 * 且 WebView 里算错的代价很高（登录页能打开但一提交就失败），所以逐条断言。
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveApiBaseUrl", () => {
  it("显式配置优先，并去掉末尾斜杠", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test:9000/");

    expect(resolveApiBaseUrl()).toBe("http://example.test:9000");
  });

  it("Capacitor 容器内固定走宿主机别名，不按 location 推导", () => {
    vi.stubEnv("VITE_TARGET", "android");
    vi.stubEnv("VITE_API_PORT", "8000");

    expect(resolveApiBaseUrl()).toBe("http://10.0.2.2:8000");
  });

  it("浏览器环境沿用主机名推导，只换端口", () => {
    vi.stubGlobal("window", { location: { protocol: "http:", hostname: "192.168.0.12" } });
    vi.stubEnv("VITE_API_PORT", "8000");

    expect(resolveApiBaseUrl()).toBe("http://192.168.0.12:8000");
  });

  it("没有 window 时回落到 localhost", () => {
    expect(resolveApiBaseUrl()).toBe("http://localhost:8000");
  });
});

describe("resolveRuntimeUrl", () => {
  it("Capacitor 下指向宿主机 8787，且保留 /copilotkit 前缀", () => {
    vi.stubEnv("VITE_TARGET", "android");
    vi.stubEnv("VITE_RUNTIME_PORT", "8787");

    expect(resolveRuntimeUrl()).toBe("http://10.0.2.2:8787/copilotkit");
  });

  it("浏览器下按当前主机推导", () => {
    vi.stubGlobal("window", { location: { protocol: "https:", hostname: "app.test" } });

    expect(resolveRuntimeUrl()).toBe("https://app.test:8787/copilotkit");
  });
});
