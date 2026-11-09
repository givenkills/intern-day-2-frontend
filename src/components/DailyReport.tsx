import { useCallback, useEffect, useRef, useState } from "react";

import { describeError } from "../api/client";
import { generateDailyReport, getDailyReport } from "../api/reports";
import type { DailyReport } from "../api/types";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

/**
 * 「今天」要按 Asia/Shanghai 算，不能用浏览器本地时区。
 * 直接 new Date().toISOString() 在东八区会差一天（UTC 还停在前一天）。
 */
function shanghaiToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function shiftDay(day: string, delta: number): string {
  const base = new Date(`${day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function lastFinishedDay(): string {
  return shiftDay(shanghaiToday(), -1);
}

function formatGeneratedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * tabKey 由 ActivityPage 传入：移动端把本面板挂到「统计」Tab 下，
 * 桌面端仍作为 grid 的整行区块显示（见 .activity-grid .panel:last-child）。
 */
export function DailyReportPanel({ tabKey }: { tabKey?: string } = {}) {
  const latestDay = lastFinishedDay();
  const [day, setDay] = useState(latestDay);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const generatingRef = useRef(false);
  /** 是否观察到过"生成中"状态，用于在转到终态后清掉临时提示 */
  const wasRunningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    async function load(isPoll: boolean) {
      if (!isPoll) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await getDailyReport(day);
        if (cancelled) return;
        setReport(data);

        const stillRunning = data.status === "pending" || data.status === "running";
        if (stillRunning) {
          wasRunningRef.current = true;
        } else if (wasRunningRef.current) {
          // 后台任务到达终态后，"已提交到后台队列"的提示就该消失。
          // 之前一直不清，表现在模拟器里就是：总结正文已经刷新出来了，
          // 上面还挂着"稍后刷新查看"，看着像没生成成功。
          wasRunningRef.current = false;
          setNotice(null);
        }

        if (stillRunning && attempts < POLL_MAX_ATTEMPTS) {
          attempts += 1;
          timer = window.setTimeout(() => void load(true), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
      } finally {
        if (!cancelled && !isPoll) setLoading(false);
      }
    }

    void load(false);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [day, reloadTick]);

  const refresh = useCallback(() => setReloadTick((value) => value + 1), []);

  async function handleGenerate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateDailyReport(day);
      setNotice(result.message ?? "已提交到后台队列，稍后自动刷新");
      setReloadTick((value) => value + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      generatingRef.current = false;
      setSubmitting(false);
    }
  }

  const status = report?.status ?? "not_generated";
  const stats = report?.stats ?? null;
  const isRunning = status === "pending" || status === "running";
  const isEmptyDay = status === "success" && (stats?.planned ?? 0) === 0;

  return (
    <section className="panel report-panel" data-tab={tabKey}>
      <div className="panel-head">
        <div>
          <h2>昨日总结</h2>
          <p className="panel-sub">每天 00:05 自动生成前一天的总结，关掉浏览器也会执行</p>
        </div>
        <div className="report-controls">
          <input
            type="date"
            className="report-date"
            value={day}
            max={latestDay}
            aria-label="选择日报日期"
            onChange={(event) => {
              setNotice(null);
              setDay(event.target.value || latestDay);
            }}
          />
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={refresh}
            disabled={loading}
          >
            刷新
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={refresh}>
            重试
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="report-skeleton" aria-busy="true">
          <div className="skeleton-box" />
          <div className="skeleton-box" />
        </div>
      ) : status === "not_generated" ? (
        <div className="report-empty">
          <p className="settings-empty">
            这一天还没有生成总结。自动任务在每天 00:05 执行；也可以现在补跑一次。
          </p>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => void handleGenerate()}
            disabled={submitting}
          >
            {submitting ? "提交中…" : "生成这一天"}
          </button>
        </div>
      ) : isRunning ? (
        <div className="report-empty">
          <p className="settings-empty">
            正在生成，页面每 3 秒自动刷新一次（第 {report?.attempt ?? 0} 次尝试）。
          </p>
        </div>
      ) : status === "failed" ? (
        <div className="report-empty">
          <p className="settings-empty">
            {report?.error?.message ?? "总结生成失败"}
            {report?.attempt ? `（已尝试 ${report.attempt} 次）` : ""}
          </p>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => void handleGenerate()}
            disabled={submitting}
          >
            {submitting ? "提交中…" : "重新生成"}
          </button>
        </div>
      ) : stats ? (
        <div>
          <div className="report-stats">
            <div className="stat-card">
              <div className="stat-value">{stats.planned}</div>
              <div className="stat-label">计划</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.completed}</div>
              <div className="stat-label">完成</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.skipped}</div>
              <div className="stat-label">跳过</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.uncompleted}</div>
              <div className="stat-label">未完成</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.postponed_ops}</div>
              <div className="stat-label">推迟操作</div>
            </div>
          </div>

          <p className="report-hint">
            推迟次数是“操作次数”，可与完成数重叠，不计入活动总数。
          </p>

          {isEmptyDay ? (
            <p className="report-note">
              当日没有活动记录，因此无法判断实际执行情况。
            </p>
          ) : null}

          <div className="report-body">
            <h3 className="report-title">回顾</h3>
            <p className="report-text">{report?.review}</p>
            <h3 className="report-title">调整建议</h3>
            <p className="report-text">{report?.suggestion}</p>
          </div>

          <p className="report-meta">
            久坐情况：
            {report?.sedentary.recorded
              ? `用户自报 ${report?.sedentary.minutes} 分钟`
              : "未记录（无法判断实际久坐时长）"}
            {report?.generated_at ? ` · 生成于 ${formatGeneratedAt(report.generated_at)}` : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
