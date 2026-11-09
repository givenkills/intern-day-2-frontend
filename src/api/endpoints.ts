/**
 * 后端与 CopilotKit Runtime 的地址解析。
 *
 * 三种运行环境的差别很大，集中在这里处理，避免两处各写一份又走样：
 *   1. 显式配置（VITE_API_BASE_URL / VITE_COPILOT_RUNTIME_URL）优先级最高；
 *   2. Capacitor（VITE_TARGET=android）：页面来自 https://localhost，
 *      location 指向的是手机自己，不能按主机名推导，必须用宿主机别名 10.0.2.2；
 *   3. 浏览器：沿用"主机名不变、只换端口"的推导，桌面与局域网真机都还能用。
 */

/** MuMu / AOSP 模拟器访问宿主机环回的固定别名，不是个人 IP，可以入库。 */
const ANDROID_HOST = "10.0.2.2";

const DEFAULT_API_PORT = "8000";
const DEFAULT_RUNTIME_PORT = "8787";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isAndroidTarget(): boolean {
  return import.meta.env.VITE_TARGET === "android";
}

/** 浏览器里取当前主机名；预渲染等无 window 的场景回落到 localhost。 */
function currentHostname(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname;
}

function currentProtocol(): string {
  if (typeof window === "undefined") return "http:";
  return window.location.protocol;
}

/** 后端 API 基地址（不带末尾斜杠）。 */
export function resolveApiBaseUrl(): string {
  // 单元测试里 .env.local 的联调代理值会盖掉推导逻辑；用 stubEnv 注入的显式值仍要生效。
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  const explicit =
    import.meta.env.MODE === "test" && configured === "/api" ? "" : configured;
  if (explicit) return stripTrailingSlash(explicit);

  const port = import.meta.env.VITE_API_PORT?.trim() || DEFAULT_API_PORT;
  if (isAndroidTarget()) return `http://${ANDROID_HOST}:${port}`;

  return `${currentProtocol()}//${currentHostname()}:${port}`;
}

/**
 * CopilotKit Runtime 的接口前缀（带 /copilotkit）。
 * 从 1.82 起 runtimeUrl 就是前缀本身，客户端会在后面直接拼 /info、/agent/xxx/run。
 */
export function resolveRuntimeUrl(): string {
  const explicit = import.meta.env.VITE_COPILOT_RUNTIME_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const port = import.meta.env.VITE_RUNTIME_PORT?.trim() || DEFAULT_RUNTIME_PORT;
  if (isAndroidTarget()) return `http://${ANDROID_HOST}:${port}/copilotkit`;

  return `${currentProtocol()}//${currentHostname()}:${port}/copilotkit`;
}
