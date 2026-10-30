import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { describeError } from "../api/client";
import { generateToday, getSettings, getToday, getWeekStats } from "../api/activity";
import type { ActivitySettings, TodayData, WeekStats as WeekStatsData } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SettingsPanel } from "../components/SettingsPanel";
import { SuggestionCard } from "../components/SuggestionCard";
import { TodaySchedule } from "../components/TodaySchedule";
import { WeekStats } from "../components/WeekStats";

export function ActivityPage() {
  const { user, logout } = useAuth();

  const [settings, setSettings] = useState<ActivitySettings | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [week, setWeek] = useState<WeekStatsData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 移动端用底部 Tab 切换面板，避免三块内容在窄屏纵向堆叠
  const [mobileTab, setMobileTab] = useState<"today" | "settings" | "week">("today");

  const generatingRef = useRef(false);
  const loggingOutRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, w] = await Promise.all([getSettings(), getToday(), getWeekStats()]);
      setSettings(s);
      setToday(t);
      setWeek(w);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshToday = useCallback(async () => {
    const [t, w] = await Promise.all([getToday(), getWeekStats()]);
    setToday(t);
    setWeek(w);
  }, []);

  async function handleGenerate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateToday();
      if (result.notice) setNotice(result.notice);
      await refreshToday();
    } catch (err) {
      setError(describeError(err));
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  async function handleLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner header-inner-wide">
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">
              久
            </span>
            <div>
              <h1>久坐活动助手</h1>
              <p className="brand-sub">工作间隙的活动安排</p>
            </div>
          </div>

          <div className="header-user">
            <Link className="btn btn-ghost btn-sm" to="/todos">
              <span className="label-lg">返回待办</span>
              <span className="label-sm">待办</span>
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/assistant">
              <span className="label-lg">问助手</span>
              <span className="label-sm">助手</span>
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
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              {loggingOut ? (
                "退出中…"
              ) : (
                <>
                  <span className="label-lg">退出登录</span>
                  <span className="label-sm">退出</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main activity-main">
        {loading ? (
          <div className="panel skeleton-panel" aria-busy="true">
            <div className="skeleton-box" />
            <div className="skeleton-box" />
            <div className="skeleton-box" />
          </div>
        ) : error && !settings && !today ? (
          <div className="panel">
            <div className="alert" role="alert">
              <span>{error}</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadAll()}>
                重试
              </button>
            </div>
          </div>
        ) : (
          <div className="activity-grid" data-active-tab={mobileTab}>
            <section className="panel" data-tab="today">
              <div className="panel-head">
                <div>
                  <h2>今日安排</h2>
                  <p className="panel-sub">
                    {today?.summary.planned ?? 0} 条待执行 · 完成 {today?.summary.completed ?? 0} · 推迟{" "}
                    {today?.summary.postponed ?? 0} · 跳过 {today?.summary.skipped ?? 0}
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? "生成中…" : "生成今日安排"}
                </button>
              </div>

              {notice ? (
                <div className="notice" role="status">
                  {notice}
                </div>
              ) : null}

              {error ? (
                <div className="alert" role="alert">
                  <span>{error}</span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => void refreshToday()}>
                    刷新
                  </button>
                </div>
              ) : null}

              {today ? (
                <TodaySchedule activities={today.activities} onChanged={() => void refreshToday()} />
              ) : null}

              <SuggestionCard onSaved={() => void refreshToday()} />
            </section>

            <section className="panel" data-tab="settings">
              <div className="panel-head">
                <h2>设置</h2>
              </div>
              {settings ? (
                <SettingsPanel
                  settings={settings}
                  onSaved={(saved) => {
                    setSettings(saved);
                    void refreshToday();
                  }}
                />
              ) : null}
            </section>

            <section className="panel" data-tab="week">
              <div className="panel-head">
                <h2>本周统计</h2>
              </div>
              {week ? <WeekStats stats={week} /> : null}
            </section>
          </div>
        )}

        <p className="footnote">
          数据来自后端接口，刷新页面会重新校验登录状态。活动内容为轻量久坐缓解动作，不构成医疗建议。
        </p>
      </main>

      {/* 移动端底部 Tab：桌面端由 CSS 隐藏 */}
      <nav className="mobile-tabbar" aria-label="页面切换">
        <button
          type="button"
          className={mobileTab === "today" ? "mobile-tab is-active" : "mobile-tab"}
          onClick={() => setMobileTab("today")}
        >
          <span className="mobile-tab-icon" aria-hidden="true">
            ☑
          </span>
          <span className="mobile-tab-text">今日</span>
          {today && today.summary.planned > 0 ? (
            <span className="mobile-tab-badge">{today.summary.planned}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={mobileTab === "settings" ? "mobile-tab is-active" : "mobile-tab"}
          onClick={() => setMobileTab("settings")}
        >
          <span className="mobile-tab-icon" aria-hidden="true">
            ⚙
          </span>
          <span className="mobile-tab-text">设置</span>
        </button>
        <button
          type="button"
          className={mobileTab === "week" ? "mobile-tab is-active" : "mobile-tab"}
          onClick={() => setMobileTab("week")}
        >
          <span className="mobile-tab-icon" aria-hidden="true">
            ▥
          </span>
          <span className="mobile-tab-text">统计</span>
        </button>
      </nav>
    </div>
  );
}
