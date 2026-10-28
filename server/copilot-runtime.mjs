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

import express from "express";

import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express";
import { HttpAgent } from "@ag-ui/client";

const PORT = Number(process.env.RUNTIME_PORT ?? 8787);

// Python 端 AG-UI 入口。容器内用服务名，本机直跑用 127.0.0.1。
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8000/agent";

// 前端 Provider 里登记的 agentId 必须和这里的键一致。
const AGENT_ID = process.env.AGENT_ID ?? "todo_assistant";

// 允许哪些浏览器来源访问 Runtime，多个用英文逗号分隔。
const ALLOWED_ORIGINS = (process.env.RUNTIME_CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

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
});

const app = express();

// 每条请求打一行日志：演示时可以当场说明「浏览器到底调了哪个地址、带没带认证」。
// 只记录方法、路径和是否带 Authorization，不打印令牌内容。
app.use((req, _res, next) => {
  const hasAuth = Boolean(req.headers.authorization);
  console.log(`[runtime] ${req.method} ${req.originalUrl} auth=${hasAuth ? "yes" : "no"}`);
  next();
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
      origin: ALLOWED_ORIGINS,
      // 浏览器要带 Authorization，预检必须显式放行。
      // 注意 Access-Control-Allow-Headers: * 并不能覆盖 Authorization，必须写出来。
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "OPTIONS"],
    },
  }),
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[runtime] CopilotKit Runtime 已启动: http://0.0.0.0:${PORT}/copilotkit`);
  console.log(`[runtime] 转发到 AG-UI: ${AGENT_URL} (agentId=${AGENT_ID})`);
  console.log(`[runtime] 允许的前端来源: ${ALLOWED_ORIGINS.join(", ")}`);
});
