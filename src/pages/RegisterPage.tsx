import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import { sendSmsCode } from "../api/auth";
import { describeError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ScreenLoader } from "../components/ScreenLoader";

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

export function RegisterPage() {
  const { status, register } = useAuth();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const sendingRef = useRef(false);

  // 发送成功后的倒计时，避免用户连续点「获取验证码」
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  if (status === "loading") {
    return <ScreenLoader />;
  }

  if (status === "authenticated") {
    return <Navigate to="/todos" replace />;
  }

  async function handleSendCode() {
    if (sendingRef.current || countdown > 0) return;

    const value = phone.trim();
    if (!PHONE_PATTERN.test(value)) {
      setError("请输入有效的 11 位手机号");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await sendSmsCode(value);
      setCountdown(result.resend_after);
      setDebugCode(result.debug_code);
      setSentTo(result.masked_phone);
    } catch (err) {
      setError(describeError(err));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setError(null);

    if (!PHONE_PATTERN.test(phone.trim())) {
      setError("请输入有效的 11 位手机号");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入 6 位数字验证码");
      return;
    }
    if (!displayName.trim()) {
      setError("请填写昵称");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await register({
        phone: phone.trim(),
        code: code.trim(),
        password,
        display_name: displayName.trim(),
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const sendLabel = countdown > 0 ? `${countdown}s 后重发` : sending ? "发送中…" : "获取验证码";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <h1>创建账户</h1>
            <p className="brand-sub">手机号验证后生成独立账户，数据各自独立</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">手机号</span>
            <div className="input-with-btn">
              <input
                className="field-input"
                type="tel"
                name="phone"
                value={phone}
                maxLength={11}
                autoComplete="tel"
                placeholder="请输入 11 位手机号"
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
                disabled={submitting}
              />
              <button
                className="btn btn-ghost btn-inline"
                type="button"
                onClick={() => void handleSendCode()}
                disabled={sending || countdown > 0 || submitting}
              >
                {sendLabel}
              </button>
            </div>
          </label>

          <label className="field">
            <span className="field-label">验证码</span>
            <input
              className="field-input"
              type="text"
              name="code"
              value={code}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 位数字验证码"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              disabled={submitting}
            />
          </label>

          {debugCode ? (
            <p className="debug-tip">
              演示环境验证码：<code>{debugCode}</code>
              {sentTo ? `（已“发送”到 ${sentTo}，正式环境会走短信通道）` : ""}
            </p>
          ) : sentTo ? (
            <p className="send-tip">验证码已发送到 {sentTo}，5 分钟内有效</p>
          ) : null}

          <label className="field">
            <span className="field-label">昵称</span>
            <input
              className="field-input"
              type="text"
              name="displayName"
              value={displayName}
              maxLength={20}
              placeholder="登录后展示的名字"
              onChange={(event) => setDisplayName(event.target.value)}
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
              autoComplete="new-password"
              placeholder="至少 6 位，注册后用它登录"
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="form-error form-error-placeholder" aria-hidden="true">
              &nbsp;
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "注册中…" : "注册并登录"}
          </button>
        </form>

        <p className="switch-tip">
          已有账号？<Link to="/login">返回登录</Link>
        </p>
      </section>
    </main>
  );
}
