import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { CopilotChat, CopilotKitProvider, useAgent } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

import { getToday } from "../api/activity";
import { tokenStorage } from "../api/client";
import { resolveRuntimeUrl } from "../api/endpoints";
import { AssistantActions } from "../assistant/AssistantActions";
import { createId, createThreadSession } from "../assistant/threadSession";
import { useAuth } from "../auth/AuthContext";
import { BottomTabBar } from "../components/BottomTabBar";
import { ThemeToggle } from "../components/ThemeToggle";
import {
  AGENT_ID,
  assessRuntimeInfo,
  describeRuntimeTransportError,
  runtimeInfoUrl,
} from "../components/runtimeHealth";

/**
 * CopilotKit Runtime 的接口前缀，与后端共用同一套地址解析（见 api/endpoints.ts）。
 * 注意：从 1.82 起 runtimeUrl 就是接口前缀本身，客户端会在它后面直接拼 /info、
 * /agent/<id>/run，所以这里必须带上 /copilotkit，不能只写主机地址。
 */
const RUNTIME_URL = resolveRuntimeUrl();

/** 自检请求的最长等待时间；超过就当作 Runtime 不可达。 */
const RUNTIME_PROBE_TIMEOUT_MS = 5000;

/** 每个用户单独存一份 threadId；sessionStorage 不可用时由模块内内存兜底。 */
const threadSession = createThreadSession();

/**
 * 把「重试」能力从 Provider 里递出来。
 *
 * 失败提示在页面顶部，而重跑要用 Provider 内部的 agent 实例，所以放一个不渲染任何
 * 东西的桥接组件在 Provider 里，把重跑函数交回给外层。
 */
function RetryBridge({ onReady }: { onReady: (retry: (() => Promise<void>) | null) => void }) {
  const { agent, isReady } = useAgent({ agentId: AGENT_ID });

  useEffect(() => {
    if (!isReady) {
      onReady(null);
      return;
    }
    onReady(async () => {
      const hasUserMessage = (agent.messages ?? []).some((message) => message.role === "user");
      if (!hasUserMessage) return;
      await agent.runAgent({ runId: createId() });
    });
    return () => onReady(null);
  }, [agent, isReady, onReady]);

  return null;
}

export function AssistantPage() {
  const { user, logout } = useAuth();

  const [threadId, setThreadId] = useState(() => threadSession.read(user?.id));
  const [expired, setExpired] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 与今日页共用底部 Tab 栏，角标也要一致；失败时静默降级为无角标 */
  const [todayBadge, setTodayBadge] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getToday()
      .then((data) => {
        if (!cancelled) setTodayBadge(data.summary.planned);
      })
      .catch(() => {
        // 角标是附加信息，接口不可用不该打断助手页
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [runtimeState, setRuntimeState] = useState<"checking" | "ok" | "offline">("checking");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeProbeTick, setRuntimeProbeTick] = useState(0);
  const [providerEpoch, setProviderEpoch] = useState(0);
  const runtimeWasOfflineRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), RUNTIME_PROBE_TIMEOUT_MS);

    setRuntimeState("checking");
    setRuntimeError(null);

    void (async () => {
      try {
        const response = await fetch(runtimeInfoUrl(RUNTIME_URL), {
          signal: controller.signal,
        });
        let payload: unknown;
        let parseFailed = false;
        try {
          payload = await response.json();
        } catch {
          parseFailed = true;
        }
        if (disposed) return;

        const health = assessRuntimeInfo({
          status: response.status,
          contentType: response.headers.get("content-type"),
          payload,
          parseFailed,
        });
        if (health.ok) {
          setRuntimeState("ok");
          if (runtimeWasOfflineRef.current) {
            runtimeWasOfflineRef.current = false;
            setProviderEpoch((value) => value + 1);
          }
        } else {
          runtimeWasOfflineRef.current = true;
          setRuntimeError(health.message);
          setRuntimeState("offline");
        }
      } catch (error) {
        if (disposed) return;
        runtimeWasOfflineRef.current = true;
        setRuntimeError(describeRuntimeTransportError(error, RUNTIME_URL));
        setRuntimeState("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [runtimeProbeTick]);

  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const registerRetry = useCallback((retry: (() => Promise<void>) | null) => {
    retryRef.current = retry;
    setCanRetry(Boolean(retry));
  }, []);

  const handleRetry = useCallback(async () => {
    const retry = retryRef.current;
    if (!retry) {
      setRunError("这条消息已经不在当前会话里了，请重新输入。");
      return;
    }
    setRetrying(true);
    setRunError(null);
    try {
      await retry();
    } catch {
      // 再失败会重新走 onError，由 handleError 统一出提示
    } finally {
      setRetrying(false);
    }
  }, []);

  const startNewThread = useCallback(() => {
    const next = createId();
    threadSession.write(user?.id, next);
    setThreadId(next);
    setRunError(null);
  }, [user?.id]);

  const headers = useCallback(() => {
    const token = tokenStorage.get();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

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
      chatInputPlaceholder: "问点什么，比如「我今天还有哪些活动没完成」",
    }),
    [],
  );

  return (
    <div className="app-shell app-shell-assistant">
      <header className="app-header">
        <div className="header-inner header-inner-wide">
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">
              久
            </span>
            <div>
              <h1>活动助手</h1>
              <p className="brand-sub">只读取你的活动设置与今日安排</p>
            </div>
          </div>

          <div className="header-user">
            <ThemeToggle />
            <div className="account-menu-wrap">
              <button
                className="user-chip"
                type="button"
                aria-label="账户菜单"
                aria-expanded={menuOpen}
                title={`账号 ${user?.username ?? ""}`}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <span className="avatar" aria-hidden="true">
                  {(user?.display_name ?? "?").slice(0, 1)}
                </span>
                <span className="user-meta">
                  <strong>{user?.display_name ?? "未知用户"}</strong>
                  <small>{user?.username ?? "-"}</small>
                </span>
              </button>
              {menuOpen ? (
                <div className="account-menu" role="menu" aria-label="账户菜单">
                  <Link to="/activity" onClick={() => setMenuOpen(false)}>
                    今日安排
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout();
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="app-main app-main-wide">
        <section className="panel agent-panel">
          <div className="panel-head agent-panel-head">
            <h2>对话</h2>
            <button className="btn btn-ghost btn-sm" type="button" onClick={startNewThread}>
              新建对话
            </button>
          </div>

          {/* key 换成新的 threadId 时整个 Provider 重新挂载，客户端消息列表随之清空 */}
          <CopilotKitProvider
            key={`${threadId}-${providerEpoch}`}
            runtimeUrl={RUNTIME_URL}
            agentId={AGENT_ID}
            headers={headers}
            onError={handleError}
            enableInspector={false}
          >
            <RetryBridge onReady={registerRetry} />
            <AssistantActions />

            {runtimeState === "checking" ? (
              <div className="notice" role="status">
                正在连接助手…
              </div>
            ) : null}

            {runtimeError ? (
              <div className="alert" role="alert">
                <span title={runtimeError}>助手服务暂不可用，请稍后重试</span>
                <div className="alert-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setRuntimeProbeTick((value) => value + 1)}
                    disabled={runtimeState === "checking"}
                  >
                    {runtimeState === "checking" ? "检测中…" : "重新检测"}
                  </button>
                </div>
              </div>
            ) : null}

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
                <span title={runError}>这条消息没能发送成功，可以重试</span>
                <div className="alert-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={retrying || !canRetry}
                  >
                    {retrying ? "正在重试…" : "重试"}
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRunError(null)}>
                    知道了
                  </button>
                </div>
              </div>
            ) : null}

            <div className="agent-chat">
              <CopilotChat threadId={threadId} className="agent-chat-inner" labels={chatLabels} />
            </div>

            <p className="assistant-footnote">回答由模型生成，重要信息请自行确认</p>
          </CopilotKitProvider>
        </section>
      </main>

      {/* 与今日页共用同一个 Tab 栏组件 */}
      <BottomTabBar active="assistant" todayBadge={todayBadge} />
    </div>
  );
}
