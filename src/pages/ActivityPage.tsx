import { useCallback, useEffect, useRef, useState } from "react";

import { describeError } from "../api/client";
import { generateToday, getSettings, getToday } from "../api/activity";
import type { ActivitySettings, TodayData } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { BACK_EVENT } from "../native/nativeShell";
import { BottomTabBar } from "../components/BottomTabBar";
import { DailyReportPanel } from "../components/DailyReport";
import { SettingsPanel } from "../components/SettingsPanel";
import { SuggestionCard } from "../components/SuggestionCard";
import { TemplatePanel } from "../components/TemplatePanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { TodaySchedule } from "../components/TodaySchedule";
import { WeeklyReview } from "../components/WeeklyReview";

export function ActivityPage() {
  const { user, logout } = useAuth();

  const [settings, setSettings] = useState<ActivitySettings | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // 移动端用底部 Tab 切换面板，避免多块内容在窄屏纵向堆叠
  // 助手页的「统计」入口会以 ?tab=week 跳回这里
  const [mobileTab, setMobileTab] = useState<"today" | "templates" | "settings" | "week">(() => {
    if (typeof window === "undefined") return "today";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "week" || tab === "templates" || tab === "settings" ? tab : "today";
  });

  const generatingRef = useRef(false);
  const loggingOutRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([getSettings(), getToday()]);
      setSettings(s);
      setToday(t);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 底部标签不是路由，浏览器历史里没有它的记录：
  // 安卓返回键先在这里被消费——不是"今日"就切回"今日"，否则交给外层回退/最小化。
  useEffect(() => {
    function handleBack(event: Event) {
      if (mobileTab === "today") return;
      event.preventDefault();
      setMobileTab("today");
    }

    window.addEventListener(BACK_EVENT, handleBack);
    return () => window.removeEventListener(BACK_EVENT, handleBack);
  }, [mobileTab]);

  const refreshToday = useCallback(async () => {
    try {
      const t = await getToday();
      setToday(t);
      // 恢复后要让上一次的失败横幅消失，否则用户会以为仍然不可用。
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileTab("templates");
                      setMenuOpen(false);
                    }}
                  >
                    活动模板
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileTab("settings");
                      setMenuOpen(false);
                    }}
                  >
                    设置
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={loggingOut}
                    onClick={() => {
                      setMenuOpen(false);
                      void handleLogout();
                    }}
                  >
                    {loggingOut ? "退出中…" : "退出登录"}
                  </button>
                </div>
              ) : null}
            </div>
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

              {/* 移动端：完整日报收敛到「统计」Tab，今日页只留一行入口，
                  避免同一份总结在今日页与统计页底部重复出现 */}
              <button className="report-entry" type="button" onClick={() => setMobileTab("week")}>
                <span className="report-entry-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3h8a2 2 0 0 1 2 2v14l-6-3-6 3V5a2 2 0 0 1 2-2z" />
                    <path d="M9 8h6M9 12h4" />
                  </svg>
                </span>
                <span className="report-entry-text">
                  <strong>昨日总结</strong>
                  <small>回顾、调整建议与久坐记录</small>
                </span>
                <span className="report-entry-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
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

            <section className="panel" data-tab="templates">
              <TemplatePanel
                settings={settings}
                onScheduled={(message) => {
                  setNotice(message);
                  setError(null);
                  void refreshToday();
                  setMobileTab("today");
                }}
              />
            </section>

            <section className="panel" data-tab="week">
              <WeeklyReview onOpenToday={() => setMobileTab("today")} />
            </section>

            {/* 日报与周度复盘同属「统计」Tab，全站只出现这一次 */}
            <DailyReportPanel tabKey="report" />
          </div>
        )}

        <p className="footnote">
          数据来自后端接口，刷新页面会重新校验登录状态。活动内容为轻量久坐缓解动作，不构成医疗建议。
        </p>
      </main>

      {/* 三个主入口与助手页共用同一个 Tab 栏组件，保证图标/尺寸/选中态一致 */}
      <BottomTabBar
        active={mobileTab === "week" ? "week" : mobileTab === "today" ? "today" : "none"}
        todayBadge={today?.summary.planned}
        onSelect={(tab) => setMobileTab(tab)}
      />
    </div>
  );
}
