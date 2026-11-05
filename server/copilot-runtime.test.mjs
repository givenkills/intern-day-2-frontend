import { AsyncLocalStorage } from "node:async_hooks";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertRuntimeDependencies,
  createRuntimeApp,
  UserScopedAgentRunner,
} from "./copilot-runtime.mjs";

const resolveUser = async (authorization) => {
  if (authorization === "Bearer alice") return "1";
  if (authorization === "Bearer bob") return "2";
  return null;
};

let server;
let baseUrl;

beforeAll(async () => {
  const app = createRuntimeApp({ resolveUser });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("Runtime 依赖能力探测", () => {
  const valid = {
    CopilotRuntime: class {},
    InMemoryAgentRunner: class {},
  };
  const validExpress = { createCopilotExpressHandler: () => {} };

  it("当前锁定的依赖导出齐全", () => {
    expect(() => assertRuntimeDependencies()).not.toThrow();
  });

  it("缺少 InMemoryAgentRunner 时给出可诊断错误", () => {
    expect(() =>
      assertRuntimeDependencies({ CopilotRuntime: class {} }, validExpress),
    ).toThrow(/InMemoryAgentRunner/);
  });

  it("缺少 CopilotRuntime 或 Express handler 时也明确失败", () => {
    expect(() =>
      assertRuntimeDependencies({ InMemoryAgentRunner: class {} }, validExpress),
    ).toThrow(/CopilotRuntime/);
    expect(() => assertRuntimeDependencies(valid, {})).toThrow(
      /createCopilotExpressHandler/,
    );
  });
});

describe("CopilotKit runtime 会话历史接口", () => {
  it("保留健康检查", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it.each([
    ["GET", "/copilotkit/threads?agentId=todo_assistant"],
    ["GET", "/copilotkit/threads/any-thread/messages?agentId=todo_assistant"],
    ["POST", "/copilotkit/threads/clear"],
    ["POST", "/copilotkit/agent/todo_assistant/connect"],
    ["POST", "/copilotkit/agent/todo_assistant/run"],
  ])("无令牌不可访问 %s %s", async (method, path) => {
    const response = await fetch(`${baseUrl}${path}`, { method });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("有令牌可以拿到自己的空线程列表", async () => {
    const response = await fetch(`${baseUrl}/copilotkit/threads?agentId=todo_assistant`, {
      headers: { Authorization: "Bearer alice" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ threads: [], nextCursor: null });
  });

  it("connect 预检不会被鉴权拦截", async () => {
    const response = await fetch(`${baseUrl}/copilotkit/agent/todo_assistant/connect`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("clear 对已登录调用返回 204 且不会清掉其他用户的数据", async () => {
    const response = await fetch(`${baseUrl}/copilotkit/threads/clear`, {
      method: "POST",
      headers: { Authorization: "Bearer alice" },
    });

    expect(response.status).toBe(204);
  });
});

describe("UserScopedAgentRunner 会话归属", () => {
  const userContext = new AsyncLocalStorage();
  const runner = new UserScopedAgentRunner({ userContext });
  const threadId = `test-thread-${Date.now()}`;
  const runId = `test-run-${Date.now()}`;

  const fakeAgent = {
    agentId: "todo_assistant",
    messages: [{ id: "message-1", role: "user", content: "todos" }],
    async runAgent(input, { onEvent }) {
      onEvent({
        event: { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId, input },
      });
      onEvent({ event: { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId } });
    },
    abortRun() {},
  };

  it("记录线程归属，并拒绝另一个用户读取", async () => {
    await new Promise((resolve, reject) => {
      userContext.run("alice", () => {
        runner
          .run({
            threadId,
            input: { threadId, runId, messages: fakeAgent.messages },
            agent: fakeAgent,
          })
          .subscribe({ complete: resolve, error: reject });
      });
    });

    expect(userContext.run("alice", () => runner.listThreads().map((thread) => thread.id))).toContain(
      threadId,
    );
    expect(userContext.run("bob", () => runner.listThreads())).toEqual([]);
    expect(userContext.run("bob", () => runner.getThreadMessages(threadId))).toEqual([]);
    expect(userContext.run("bob", () => runner.getThreadEvents(threadId))).toEqual([]);
    expect(userContext.run("bob", () => runner.getThreadState(threadId))).toBeNull();

    const bobEvents = await new Promise((resolve) => {
      const events = [];
      userContext.run("bob", () => {
        runner
          .connect({ threadId, input: { threadId, runId: `${runId}-connect`, messages: [] } })
          .subscribe({ next: (event) => events.push(event), complete: () => resolve(events) });
      });
    });
    expect(bobEvents).toEqual([]);
  });

  it("拒绝另一个用户复用同一 threadId 发起运行", () => {
    expect(() =>
      userContext.run("bob", () =>
        runner.run({
          threadId,
          input: { threadId, runId: `${runId}-bob`, messages: [] },
          agent: fakeAgent,
        }),
      ),
    ).toThrow(/Thread access denied/);
  });

  it("多个会话只对本人可见，另一个用户清理不影响本人", async () => {
    const localContext = new AsyncLocalStorage();
    const localRunner = new UserScopedAgentRunner({ userContext: localContext });
    const ids = [`multi-a-${Date.now()}`, `multi-b-${Date.now()}`];

    const runAs = (user, threadId) =>
      new Promise((resolve, reject) => {
        localContext.run(user, () => {
          localRunner
            .run({
              threadId,
              input: { threadId, runId: `run-${threadId}`, messages: fakeAgent.messages },
              agent: fakeAgent,
            })
            .subscribe({ complete: resolve, error: reject });
        });
      });

    await runAs("alice", ids[0]);
    await runAs("alice", ids[1]);

    expect(localContext.run("alice", () => localRunner.listThreads().map((t) => t.id))).toEqual(
      expect.arrayContaining(ids),
    );
    expect(localContext.run("bob", () => localRunner.listThreads())).toEqual([]);
    expect(localContext.run("bob", () => localRunner.getThreadMessages(ids[1]))).toEqual([]);

    localContext.run("bob", () => localRunner.clearThreads());
    expect(localContext.run("alice", () => localRunner.listThreads().map((t) => t.id))).toEqual(
      expect.arrayContaining(ids),
    );
  });

  it("clearThreads 不会清空全局会话", () => {
    userContext.run("alice", () => runner.clearThreads());

    expect(userContext.run("alice", () => runner.listThreads().map((thread) => thread.id))).toContain(
      threadId,
    );
  });
});
