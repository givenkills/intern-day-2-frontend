/**
 * CopilotKit Runtime 连通性自检。
 *
 * Provider 在 /info 拉取失败时只会让输入框一直禁言，页面本身不会报错：
 * 用户看到的是「按钮点不动」，而不是「Runtime 没启动」。这里主动探测一次，
 * 把「连不上 / 返回网页 / JSON 损坏 / agent 未注册」翻译成可读提示，
 * 尤其要避免把 200 + text/html 的代理错误页当成成功响应。
 */

/** 与 Runtime 里注册的 agents 键、Python 端 Agent 的 name 保持一致。 */
export const AGENT_ID = "todo_assistant";

export type RuntimeHealth = { ok: true } | { ok: false; message: string };

export interface RuntimeInfoInput {
  status: number;
  contentType: string | null;
  payload?: unknown;
  /** response.json() 是否抛错，用来区分「JSON 损坏」和「字段缺失」 */
  parseFailed?: boolean;
  agentId?: string;
}

/** runtimeUrl 是接口前缀（如 http://host:8787/copilotkit），/info 直接拼在后面。 */
export function runtimeInfoUrl(runtimeUrl: string): string {
  return `${runtimeUrl.replace(/\/+$/, "")}/info`;
}

export function assessRuntimeInfo({
  status,
  contentType,
  payload,
  parseFailed = false,
  agentId = AGENT_ID,
}: RuntimeInfoInput): RuntimeHealth {
  if (status !== 200) {
    return {
      ok: false,
      message: `助手运行服务返回 HTTP ${status}。请确认 Runtime 已启动，并检查地址是否正确。`,
    };
  }

  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mediaType.includes("application/json")) {
    return {
      ok: false,
      message: `助手运行服务返回了 ${mediaType || "未知类型"}（HTTP 200），不是接口数据。请检查 Runtime 地址是否指向了静态服务器或代理。`,
    };
  }

  if (parseFailed) {
    return {
      ok: false,
      message: "助手运行服务返回的 JSON 无法解析。请检查 Runtime 版本或代理是否改写了响应。",
    };
  }

  const agents =
    typeof payload === "object" && payload !== null
      ? (payload as { agents?: unknown }).agents
      : undefined;
  if (
    !agents ||
    typeof agents !== "object" ||
    !(agentId in (agents as Record<string, unknown>))
  ) {
    return {
      ok: false,
      message: `助手运行服务已连通，但没有注册 agent「${agentId}」。请检查 Runtime 配置。`,
    };
  }

  return { ok: true };
}

/** fetch 本身失败（断网、拒绝连接、5 秒超时）时的用户提示。 */
export function describeRuntimeTransportError(error: unknown, runtimeUrl: string): string {
  const name =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown }).name
      : undefined;
  if (name === "AbortError") {
    return `连接助手运行服务超时（${runtimeUrl}）。请确认 CopilotKit Runtime 已启动，然后重试。`;
  }
  return `连不上助手运行服务（${runtimeUrl}）。请确认 CopilotKit Runtime 已启动，然后重试。`;
}
