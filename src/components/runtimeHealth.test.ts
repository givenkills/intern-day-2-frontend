import { describe, expect, it } from "vitest";

import {
  AGENT_ID,
  assessRuntimeInfo,
  describeRuntimeTransportError,
  runtimeInfoUrl,
} from "./runtimeHealth";

const INFO_BODY = {
  version: "1.82.0",
  agents: {
    [AGENT_ID]: { name: AGENT_ID, description: "" },
  },
};

describe("runtimeInfoUrl", () => {
  it("拼在接口前缀后，并容忍末尾斜杠", () => {
    expect(runtimeInfoUrl("http://10.0.2.2:8787/copilotkit")).toBe(
      "http://10.0.2.2:8787/copilotkit/info",
    );
    expect(runtimeInfoUrl("http://10.0.2.2:8787/copilotkit///")).toBe(
      "http://10.0.2.2:8787/copilotkit/info",
    );
  });
});

describe("assessRuntimeInfo", () => {
  it("200 + JSON 且注册了 agent 时视为可用", () => {
    expect(
      assessRuntimeInfo({
        status: 200,
        contentType: "application/json; charset=utf-8",
        payload: INFO_BODY,
      }),
    ).toEqual({ ok: true });
  });

  it("200 + text/html 不能被当成成功", () => {
    const result = assessRuntimeInfo({
      status: 200,
      contentType: "text/html; charset=utf-8",
      payload: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("text/html");
      expect(result.message).toContain("HTTP 200");
    }
  });

  it("非 200 时给出状态码", () => {
    const result = assessRuntimeInfo({
      status: 503,
      contentType: "application/json",
      payload: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("HTTP 503");
  });

  it("JSON 损坏时提示无法解析，而不是缺 agent", () => {
    const result = assessRuntimeInfo({
      status: 200,
      contentType: "application/json",
      parseFailed: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("无法解析");
  });

  it("Runtime 在线但没有注册目标 agent 时提示配置问题", () => {
    const result = assessRuntimeInfo({
      status: 200,
      contentType: "application/json",
      payload: { agents: { another_agent: { name: "another_agent" } } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(AGENT_ID);
  });

  it("payload 不是对象时也按 agent 缺失处理", () => {
    const result = assessRuntimeInfo({
      status: 200,
      contentType: "application/json",
      payload: null,
    });

    expect(result.ok).toBe(false);
  });
});

describe("describeRuntimeTransportError", () => {
  it("超时提示与普通连接失败区分开", () => {
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const refused = new TypeError("Failed to fetch");

    expect(describeRuntimeTransportError(timeout, "http://h:8787/copilotkit")).toContain("超时");
    expect(describeRuntimeTransportError(refused, "http://h:8787/copilotkit")).toContain(
      "连不上",
    );
  });
});
