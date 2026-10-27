import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ScreenLoader } from "../components/ScreenLoader";

export function LoginPage() {
  const { status, login, notice, clearNotice } = useAuth();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 被页面守卫拦下来时会带回原本要访问的地址
  const state = location.state as { from?: string } | null;
  const redirectTo = state?.from ?? "/todos";

  if (status === "loading") {
    return <ScreenLoader />;
  }

  if (status === "authenticated") {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    clearNotice();
    setError(null);

    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const message = error ?? notice;

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <h1>待办清单</h1>
            <p className="brand-sub">实习生第二天练习 · 登录后管理自己的待办</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">账号</span>
            <input
              className="field-input"
              type="text"
              name="username"
              value={username}
              autoComplete="username"
              placeholder="请输入账号"
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field-label">密码</span>
            <input
              className="field-input"
              type="password"
              name="password"
              value={password}
              autoComplete="current-password"
              placeholder="请输入密码"
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
          </label>

          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : (
            <p className="form-error form-error-placeholder" aria-hidden="true">
              &nbsp;
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="hint">
          练习账号：<code>intern</code> / <code>intern123456</code>
          <br />
          账号由后端启动脚本创建，可在后端 <code>.env</code> 中修改。
        </p>
      </section>
    </main>
  );
}
