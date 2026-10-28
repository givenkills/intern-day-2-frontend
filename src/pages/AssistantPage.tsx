import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

import { tokenStorage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/**
 * CopilotKit Runtime 的接口前缀，浏览器直接访问宿主机端口。
 * 注意：从 1.82 起 runtimeUrl 就是接口前缀本身，客户端会在它后面直接拼 /info、
 * /agent/<id>/run，所以这里必须带上 /copilotkit，不能只写主机地址。
 */
const RUNTIME_URL = (import.meta.env.VITE_COPILOT_RUNTIME_URL ?? "http://localhost:8787/copilotkit").replace(
  /\/+$/,
  "",
);

/** 与 Runtime 里注册的 agents 键、Python 端 Agent 的 name 保持一致。 */
const AGENT_ID = "todo_assistant";

/** 每个用户单独存一份 threadId，避免换账号后接上前一个人的会话。 */
function threadStorageKey(userId: number | undefined): string {
  return `intern-day-3.thread.${userId ?? "anonymous"}`;
}

function readThreadId(userId: number | undefined): string {
  const stored = window.sessionStorage.getItem(threadStorageKey(userId));
  if (stored) return stored;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(threadStorageKey(userId), created);
  return created;
}

export function AssistantPage() {
  const { user, logout } = useAuth();

  // threadId 只用于区分会话，它不是登录凭证：
  // 后端会用 Authorization 里的用户身份校验这个 thread 归谁所有。
  const [threadId, setThreadId] = useState(() => readThreadId(user?.id));
  const [expired, setExpired] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const startNewThread = useCallback(() => {
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(threadStorageKey(user?.id), next);
    setThreadId(next);
    setRunError(null);
  }, [user?.id]);

  /**
   * 每次请求现取一次令牌：退出登录后 tokenStorage 已经清空，
   * 这里自然拿不到，不会用旧令牌继续请求。
   */
  const headers = useCallback(() => {
    const token = tokenStorage.get();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  /**
   * 运行失败统一在这里收口：
   * - 建流前被拒绝（401）：提示重新登录；
   * - 其他错误（后端没起、模型报错）：给出明确原因并结束等待，不让气泡空挂着。
   * 事件流一旦开始，错误只能以事件的形式回来，HTTP 状态码已经改不了了，
   * 所以这一层是唯一能让用户看到「失败了」的地方。
   */
  const handleError = useCallback(({ error }: { error: Error }) => {
    const message = `${error.name} ${error.message}`;

    if (/401|unauthor/i.test(message)) {
      setExpired(true);
      return;
    }

    const detail = /fetch failed|EAI_AGAIN|ECONNREFUSED|network/i.test(message)
      ? "连不上后端服务"
      : /timeout|timed out/i.test(message)
        ? "后端响应超时"
        : "运行失败";

    setRunError(`${detail}：请确认后端与模型服务已启动，然后重新发送。`);
  }, []);

  const chatLabels = useMemo(
    () => ({
      chatInputPlaceholder: "问点什么，比如「我还有哪些待办没做完」",
    }),
    [],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">
              ✓
            </span>
            <div>
              <h1>学习助手</h1>
              <p className="brand-sub">Agent 只能读到你自己名下的数据</p>
            </div>
          </div>

          <div className="header-user">
            <Link className="btn btn-ghost" to="/todos">
              返回待办
            </Link>
            <div className="user-chip" title={`账号 ${user?.username ?? ""}`}>
              <span className="avatar" aria-hidden="true">
                {(user?.display_name ?? "?").slice(0, 1)}
              </span>
              <span className="user-meta">
                <strong>{user?.display_name ?? "未知用户"}</strong>
                <small>{user?.username ?? "-"}</small>
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main app-main-wide">
        <section className="panel agent-panel">
          <div className="panel-head agent-panel-head">
            <div>
              <h2>对话</h2>
              <p className="panel-sub">
                同一个会话里可以连续追问；点「新建对话」会清空当前上下文并换一个 thread。
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={startNewThread}>
              新建对话
            </button>
          </div>

          {expired ? (
            <div className="alert" role="alert">
              <span>登录状态已失效，请重新登录后再使用助手。</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void logout()}>
                重新登录
              </button>
            </div>
          ) : null}

          {runError ? (
            <div className="alert" role="alert">
              <span>{runError}</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRunError(null)}>
                知道了
              </button>
            </div>
          ) : null}

          <div className="agent-chat">
            {/* key 换成新的 threadId 时整个 Provider 重新挂载，客户端消息列表随之清空 */}
            <CopilotKitProvider
              key={threadId}
              runtimeUrl={RUNTIME_URL}
              agentId={AGENT_ID}
              headers={headers}
              onError={handleError}
              // 开发环境默认会浮出 CopilotKit 的检查器，演示时关掉，避免挡住对话
              enableInspector={false}
            >
              <CopilotChat threadId={threadId} className="agent-chat-inner" labels={chatLabels} />
            </CopilotKitProvider>
          </div>
        </section>

        <p className="footnote">
          浏览器 → CopilotKit Runtime <code>{RUNTIME_URL}</code> → Python AG-UI
          <code> POST /agent</code>。Runtime 只转发你这一次请求的登录凭证。
        </p>
      </main>
    </div>
  );
}
