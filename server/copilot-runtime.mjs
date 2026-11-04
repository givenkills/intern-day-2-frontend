/**
 * CopilotKit Runtime（前端仓库里的轻量 Node 服务）。
 *
 * 它做三件事：
 * 1. 在浏览器和 Python Agent 之间做协议搬运：浏览器说 CopilotKit 的接口，
 *    它把请求翻译成 AG-UI 的 RunAgentInput 发给 POST {AGENT_URL}。
 * 2. 按请求解析 Agent：每个请求都新建一个 HttpAgent，并把「这个用户自己的」
 *    Authorization 头带过去。Runtime 不持有任何万能令牌。
 * 3. 把 Python 返回的 AG-UI 事件流原样转回浏览器，不做整段缓冲。
 *
 * 为什么不能用 Vite：Vite 是静态资源服务器 + HMR，它没有 CopilotKit 的
 * 运行时接口（/copilotkit 下的 agent、run、thread 等路由），也不会帮我们转发认证头。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { pathToFileURL } from "node:url";

import express from "express";

import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express";
import { HttpAgent } from "@ag-ui/client";

const PORT = Number(process.env.RUNTIME_PORT ?? 8787);

// Python 端 AG-UI 入口。容器内用服务名，本机直跑用 127.0.0.1。
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8000/agent";

// 校验令牌用的后端地址；和 AGENT_URL 分开配置，容器里可以指向服务名。
const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

// 前端 Provider 里登记的 agentId 必须和这里的键一致。
const AGENT_ID = process.env.AGENT_ID ?? "todo_assistant";

// 允许哪些浏览器来源访问 Runtime，多个用英文逗号分隔。
const ALLOWED_ORIGINS = (process.env.RUNTIME_CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

// 局域网来源放行规则：手机/模拟器通过 http://<内网IP>:5173 访问时，
// 来源既不是 localhost 也不在白名单里，不放行会直接白屏。
// 仅用于内网演示，正式环境应把这里收紧。
const LAN_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

function isAllowedOrigin(origin) {
  // 没有 Origin 头（同源请求、curl、服务端调用）不涉及跨域，直接放行
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin) || LAN_ORIGIN_PATTERN.test(origin);
}

const THREAD_PATH_PATTERN = /^\/copilotkit\/threads(?:\/|$)/;
const CONNECT_PATH_PATTERN = /^\/copilotkit\/agent\/[^/]+\/connect(?:\/|$)/;
const STOP_PATH_PATTERN = /^\/copilotkit\/agent\/[^/]+\/stop(?:\/|$)/;
const RUN_PATH_PATTERN = /^\/copilotkit\/agent\/[^/]+\/run(?:\/|$)/;

/**
 * 用这次请求自己的 Bearer 令牌去后端换用户 id。
 * 后端 /auth/me 是唯一权威：Runtime 不解析令牌内容，也不缓存身份，避免令牌
 * 退出登录后仍在 Runtime 里“活着”。超时或后端不可达时返回 null。
 */
async function resolveUserFromBackend(authorization) {
  if (!authorization) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id === undefined || user?.id === null ? null : String(user.id);
  } catch {
    return null;
  }
}

/**
 * 默认的 InMemoryAgentRunner 把会话保存在进程级共享仓库里，但自带的
 * /threads、/threads/:id/messages、agent 的 connect 接口既不校验 Authorization，
 * 也不记录线程归属；共享 Runtime 上任何人都能读取或清空所有会话。
 *
 * 这里保留 Runner 的内存实现，只补一层“按登录用户隔离”：
 * - run() 记录 threadId 属于哪个用户；换用户复用同一 threadId 会直接被拒绝；
 * - listThreads / messages / events / state / connect / stop 只对本人的线程生效；
 * - clearThreads() 关闭：清空操作无法按用户隔离，本应用也不需要。
 *
 * 仍然是内部 API 依赖：InMemoryAgentRunner 来自 @copilotkit/runtime 的公开导出，
 * 但线程仓库本身是进程级内存，升级 1.82.0 之后需要重新跑本文件的回归测试。
 */
export class UserScopedAgentRunner extends InMemoryAgentRunner {
  constructor({ userContext }) {
    super();
    this.userContext = userContext;
    this.threadOwners = new Map();
  }

  run(request) {
    const userId = this.userContext.getStore();
    if (!userId) {
      // 没有用户上下文时不放行：否则 /auth/me 超时的一瞬间，
      // 仍可能用别人的 threadId 写入历史，造成跨用户污染。
      throw new Error("Thread access denied");
    }
    const owner = this.threadOwners.get(request.threadId);
    if (owner !== undefined && owner !== userId) {
      throw new Error("Thread access denied");
    }
    this.threadOwners.set(request.threadId, userId);
    return super.run(request);
  }

  listThreads() {
    const userId = this.userContext.getStore();
    if (!userId) return [];
    return super.listThreads().filter((thread) => this.threadOwners.get(thread.id) === userId);
  }

  getThreadMessages(threadId) {
    return this.owns(threadId) ? super.getThreadMessages(threadId) : [];
  }

  getThreadEvents(threadId) {
    return this.owns(threadId) ? super.getThreadEvents(threadId) : [];
  }

  getThreadState(threadId) {
    return this.owns(threadId) ? super.getThreadState(threadId) : null;
  }

  connect(request) {
    if (this.owns(request.threadId)) return super.connect(request);
    // 用一个不存在的线程 id 让父类返回“立即完成、没有事件”的流，不泄露任何历史。
    return super.connect({ ...request, threadId: `__not_owned__:${request.threadId}` });
  }

  stop(request) {
    if (!this.owns(request.threadId)) return Promise.resolve(false);
    return super.stop(request);
  }

  clearThreads() {
    // 故意保留为空：清空全部会话无法按用户隔离，且本应用不使用该能力。
  }

  owns(threadId) {
    const userId = this.userContext.getStore();
    return Boolean(userId) && this.threadOwners.get(threadId) === userId;
  }
}

export function createRuntimeApp({ resolveUser = resolveUserFromBackend } = {}) {
  const requestUser = new AsyncLocalStorage();

  const runtime = new CopilotRuntime({
    // 写成函数：每个请求调用一次，才能读到这一次请求自己的登录凭证。
    // 如果写成固定对象，就只有一份头信息，所有用户会被当成同一个人。
    agents: ({ request }) => {
      const authorization = request.headers.get("authorization") ?? "";

      if (!authorization) {
        // 没带凭证也要把请求发下去，让 Python 端统一返回 401，
        // 这样前端只需要处理一种错误来源。
        console.warn("[runtime] 请求未携带 Authorization，将由后端拒绝");
      }

      return {
        [AGENT_ID]: new HttpAgent({
          url: AGENT_URL,
          headers: authorization ? { Authorization: authorization } : {},
        }),
      };
    },
    runner: new UserScopedAgentRunner({ userContext: requestUser }),
  });

  const app = express();

  // 每条请求打一行日志：演示时可以当场说明「浏览器到底调了哪个地址、带没带认证」。
  // 只记录方法、路径和是否带 Authorization，不打印令牌内容和对话正文。
  app.use((req, _res, next) => {
    const hasAuth = Boolean(req.headers.authorization);
    console.log(`[runtime] ${req.method} ${req.originalUrl} auth=${hasAuth ? "yes" : "no"}`);
    next();
  });

  /**
   * 历史接口和 run 都必须带有效令牌：threads / connect / stop 缺少归属会泄漏数据，
   * run 缺少归属则可能写入别人的 thread。统一先用后端 /auth/me 换用户 id，
   * 失败返回 401，不把“解析失败”当成匿名放行。
   * OPTIONS 预检直接放行，交给 CopilotKit 的 CORS 中间件处理。
   */
  app.use(async (req, res, next) => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const requiresUser =
      THREAD_PATH_PATTERN.test(req.path) ||
      CONNECT_PATH_PATTERN.test(req.path) ||
      STOP_PATH_PATTERN.test(req.path) ||
      RUN_PATH_PATTERN.test(req.path);
    if (!requiresUser) {
      next();
      return;
    }

    let userId = null;
    try {
      userId = await resolveUser(req.headers.authorization);
    } catch {
      userId = null;
    }

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    requestUser.run(userId, next);
  });

  // 健康检查给 compose 用，不经过 CopilotKit。
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", agentUrl: AGENT_URL, agentId: AGENT_ID });
  });

  app.use(
    createCopilotExpressHandler({
      runtime,
      basePath: "/copilotkit",
      cors: {
        // 用函数而不是数组，才能同时支持显式白名单和内网来源匹配
        origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
        // 浏览器要带 Authorization，预检必须显式放行。
        // 注意 Access-Control-Allow-Headers: * 并不能覆盖 Authorization，必须写出来。
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "OPTIONS"],
      },
    }),
  );

  return app;
}

// 直接 `node server/copilot-runtime.mjs` 时启动监听；被测试 import 时只导出工厂函数。
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  createRuntimeApp().listen(PORT, "0.0.0.0", () => {
    console.log(`[runtime] CopilotKit Runtime 已启动: http://0.0.0.0:${PORT}/copilotkit`);
    console.log(`[runtime] 转发到 AG-UI: ${AGENT_URL} (agentId=${AGENT_ID})`);
    console.log(`[runtime] 允许的前端来源: ${ALLOWED_ORIGINS.join(", ")}`);
  });
}
