import { useRef, useState } from "react";

import { describeError } from "../api/client";
import { completeActivity, getPostponeOptions, postponeActivity, skipActivity } from "../api/activity";
import type { Activity } from "../api/types";

interface Props {
  activities: Activity[];
  onChanged: () => void;
}

const STATUS_LABEL: Record<Activity["status"], string> = {
  planned: "待执行",
  completed: "已完成",
  postponed: "已推迟",
  skipped: "已跳过",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 把 HH:MM + 当天日期拼成 +08:00 偏移的 ISO 串（传给后端） */
function buildScheduledAt(activity: Activity, time: string): string {
  return `${activity.plan_date}T${time}:00+08:00`;
}

export function TodaySchedule({ activities, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 推迟弹窗
  const [postponing, setPostponing] = useState<Activity | null>(null);
  const [postponeOptions, setPostponeOptions] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(false);
  // 跳过原因弹窗
  const [skipping, setSkipping] = useState<Activity | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const busyRef = useRef<Set<number>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function run(id: number, action: () => Promise<unknown>, successMessage?: string) {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusyIds((prev) => [...prev, id]);
    setError(null);
    try {
      await action();
      if (successMessage) flash(successMessage);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current.delete(id);
      setBusyIds((prev) => prev.filter((x) => x !== id));
    }
  }

  async function openPostpone(activity: Activity) {
    setPostponing(activity);
    setSelectedTime("");
    setOptionsLoading(true);
    setError(null);
    try {
      const options = await getPostponeOptions(activity.id);
      setPostponeOptions(options.times);
      // 默认选中第一个候选时间
      if (options.times.length > 0) setSelectedTime(options.times[0]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setOptionsLoading(false);
    }
  }

  async function handlePostponeConfirm() {
    if (!postponing || !selectedTime) return;
    const activity = postponing;
    const time = selectedTime;
    setPostponing(null);
    await run(activity.id, async () => {
      const result = await postponeActivity(activity.id, buildScheduledAt(activity, time));
      if (result.ok === false) {
        throw new Error(result.reason ?? "今日剩余时段不足，无法再推迟");
      }
    }, `已推迟到 ${time}`);
  }

  async function handleSkipConfirm() {
    if (!skipping) return;
    const activity = skipping;
    const reason = skipReason.trim() || undefined;
    setSkipping(null);
    setSkipReason("");
    await run(activity.id, () => skipActivity(activity.id, reason), "已跳过");
  }

  const planned = activities.filter((a) => a.status === "planned");
  const history = activities.filter((a) => a.status !== "planned");
  const historySummary = {
    completed: history.filter((a) => a.status === "completed").length,
    postponed: history.filter((a) => a.status === "postponed").length,
    skipped: history.filter((a) => a.status === "skipped").length,
  };

  if (activities.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">今天还没有安排</p>
        <p className="empty-sub">先到右侧保存设置，再点「生成今日安排」。</p>
      </div>
    );
  }

  function renderItem(activity: Activity, isHistory: boolean) {
    const busy = busyIds.includes(activity.id);
    const done = activity.status !== "planned";
    return (
      <li className={done ? "activity-item is-done" : "activity-item"} key={activity.id}>
        <div className="activity-time">{formatTime(activity.scheduled_at)}</div>
        <div className="activity-body">
          <div className="activity-title">
            {activity.title}
            {activity.postponed_from_id != null ? <span className="activity-tag">已改期</span> : null}
            {activity.source === "agent" ? (
              <span className="activity-tag activity-tag-agent">助手建议</span>
            ) : null}
          </div>
          <div className="activity-desc">{activity.description}</div>
          {isHistory ? (
            <div className="activity-status">
              {activity.status === "postponed" && activity.postponed_from_id != null
                ? `原计划 ${formatTime(activity.scheduled_at)}，已改期`
                : STATUS_LABEL[activity.status]}
              {activity.status === "skipped" && activity.skipped_reason ? ` · ${activity.skipped_reason}` : ""}
            </div>
          ) : null}
        </div>
        {!done ? (
          <div className="activity-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => void run(activity.id, () => completeActivity(activity.id), "已完成")}
            >
              完成
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={busy}
              onClick={() => void openPostpone(activity)}
            >
              推迟
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setSkipping(activity);
                setSkipReason("");
              }}
            >
              今天不方便
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div>
      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      <ul className="activity-list">
        {planned.map((activity) => renderItem(activity, false))}
      </ul>

      {history.length > 0 ? (
        <div className="history-block">
          <button className="history-toggle" type="button" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "收起" : "展开"}历史
            <span className="history-summary">
              已完成 {historySummary.completed} · 已推迟 {historySummary.postponed} · 已跳过{" "}
              {historySummary.skipped}
            </span>
          </button>
          {showHistory ? (
            <ul className="activity-list activity-list-history">{history.map((a) => renderItem(a, true))}</ul>
          ) : null}
        </div>
      ) : null}

      {postponing ? (
        <div className="modal-backdrop" onClick={() => setPostponing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">推迟到几点</h3>
            <p className="modal-sub">选择「{postponing.title}」的新时间（当天可用时段）。</p>
            {optionsLoading ? (
              <div className="postpone-loading">加载可选时间…</div>
            ) : postponeOptions.length === 0 ? (
              <div className="postpone-empty">今天没有更多可用时段可推迟了。</div>
            ) : (
              <div className="postpone-grid">
                {postponeOptions.map((time) => (
                  <button
                    key={time}
                    type="button"
                    className={selectedTime === time ? "postpone-slot is-selected" : "postpone-slot"}
                    onClick={() => setSelectedTime(time)}
                  >
                    {time}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setPostponing(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!selectedTime}
                onClick={() => void handlePostponeConfirm()}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {skipping ? (
        <div className="modal-backdrop" onClick={() => setSkipping(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">今天不方便</h3>
            <p className="modal-sub">可以记录一下原因（可选），方便之后回顾。</p>
            <input
              className="field-input"
              type="text"
              placeholder="例如：下午开会、外出办事"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              aria-label="跳过原因"
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setSkipping(null)}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void handleSkipConfirm()}>
                确定跳过
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
