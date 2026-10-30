import { useRef, useState } from "react";

import { describeError } from "../api/client";
import { completeActivity, postponeActivity, skipActivity } from "../api/activity";
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
  // 后端返回带 +08:00 偏移的 ISO 串，直接取本地 HH:MM
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function TodaySchedule({ activities, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const busyRef = useRef<Set<number>>(new Set());

  async function run(id: number, action: () => Promise<unknown>) {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusyIds((prev) => [...prev, id]);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      busyRef.current.delete(id);
      setBusyIds((prev) => prev.filter((x) => x !== id));
    }
  }

  async function handlePostpone(activity: Activity) {
    await run(activity.id, async () => {
      const result = await postponeActivity(activity.id);
      if (result.ok === false) {
        setError(result.reason ?? "今日剩余时段不足，无法再推迟");
      }
    });
  }

  if (activities.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">今天还没有安排</p>
        <p className="empty-sub">先到右侧保存设置，再点「生成今日安排」。</p>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <ul className="activity-list">
        {activities.map((activity) => {
          const busy = busyIds.includes(activity.id);
          const done = activity.status !== "planned";
          return (
            <li className={done ? "activity-item is-done" : "activity-item"} key={activity.id}>
              <div className="activity-time">{formatTime(activity.scheduled_at)}</div>
              <div className="activity-body">
                <div className="activity-title">
                  {activity.title}
                  {activity.postponed_from_id != null ? (
                    <span className="activity-tag">已改期</span>
                  ) : null}
                  {activity.source === "agent" ? (
                    <span className="activity-tag activity-tag-agent">助手建议</span>
                  ) : null}
                </div>
                <div className="activity-desc">{activity.description}</div>
                <div className="activity-status">{STATUS_LABEL[activity.status]}</div>
              </div>
              {!done ? (
                <div className="activity-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(activity.id, () => completeActivity(activity.id))}
                  >
                    完成
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePostpone(activity)}
                  >
                    推迟
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(activity.id, () => skipActivity(activity.id, "今天不方便"))}
                  >
                    今天不方便
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
