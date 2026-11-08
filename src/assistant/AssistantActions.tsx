import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ToolCallStatus, useHumanInTheLoop } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { describeError } from "../api/client";
import {
  completeActivity,
  confirmAgentSchedule,
  getPostponeOptions,
  postponeActivity,
  skipActivity,
  type AgentScheduleSlot,
} from "../api/activity";
import { formatBeijingTime } from "../timeDisplay";

const scheduleParameters = z.object({
  slots: z
    .array(
      z.object({
        scheduled_at: z.string(),
        activity_type: z.string(),
        title: z.string(),
      }),
    )
    .min(1),
});

type ScheduleArgs = z.infer<typeof scheduleParameters>;

type ScheduleResult = {
  ok?: boolean;
  planned?: number;
  message?: string;
  cancelled?: boolean;
};

function readResult<T>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return { message: value } as T;
    }
  }
  return (value && typeof value === "object" ? value : {}) as T;
}

export function ScheduleConfirmCard({
  status,
  args,
  result,
  respond,
}: {
  status: ToolCallStatus;
  args: Partial<ScheduleArgs>;
  result?: string;
  respond?: (result: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const slots = (args.slots ?? []) as AgentScheduleSlot[];
  const parsed = readResult<ScheduleResult>(result);

  if (status === ToolCallStatus.Complete) {
    if (parsed.cancelled) {
      return (
        <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10 }}>
          已取消，没有保存任何活动。
        </div>
      );
    }
    if (parsed.ok) {
      return (
        <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10 }}>
          <strong>已保存 {parsed.planned ?? slots.length} 个活动。</strong>
          <div style={{ marginTop: 6 }}>
            <Link to="/activity">去活动页查看</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10 }}>
        保存失败：{parsed.message ?? "请让助手重新预排后再试"}
      </div>
    );
  }

  if (status !== ToolCallStatus.Executing) {
    return (
      <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10 }}>
        正在准备保存…
      </div>
    );
  }

  async function answer(ok: boolean) {
    if (busyRef.current || !respond) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!ok) {
        await respond({ ok: false, cancelled: true });
        return;
      }
      const saved = await confirmAgentSchedule(slots);
      await respond({ ok: true, planned: saved.planned });
    } catch (error) {
      await respond({ ok: false, message: describeError(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10, display: "grid", gap: 10 }}>
      <strong>确认保存这 {slots.length} 个活动？</strong>
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
        {slots.map((slot) => (
          <li key={`${slot.scheduled_at}-${slot.title}`}>
            {formatBeijingTime(slot.scheduled_at)} · {slot.title}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={busy || slots.length === 0}
          onClick={() => void answer(true)}
        >
          {busy ? "保存中…" : "确认保存"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void answer(false)}>
          取消
        </button>
      </div>
      <small style={{ color: "var(--text-muted)" }}>
        只有点击确认后才会写入；后端会再次校验工作时段、免打扰和时间冲突。
      </small>
    </div>
  );
}

const actionParameters = z.object({
  action: z.enum(["complete", "skip", "postpone"]),
  activity_id: z.number().int().positive(),
  title: z.string(),
  local_time: z.string(),
  plan_date: z.string(),
  target_time: z.string().optional(),
  reason: z.string().optional(),
});

type ActionArgs = z.infer<typeof actionParameters>;

type ActionResult = {
  ok?: boolean;
  message?: string;
  cancelled?: boolean;
  new_local_time?: string;
};

const ACTION_LABEL: Record<ActionArgs["action"], string> = {
  complete: "完成",
  skip: "跳过",
  postpone: "推迟",
};

const CONFIRM_LABEL: Record<ActionArgs["action"], string> = {
  complete: "确认完成",
  skip: "确认跳过",
  postpone: "确认推迟",
};

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10 }}>
      {children}
    </div>
  );
}

export function ActivityActionCard({
  status,
  args,
  result,
  respond,
}: {
  status: ToolCallStatus;
  args: Partial<ActionArgs>;
  result?: string;
  respond?: (result: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [reason, setReason] = useState(args.reason ?? "");
  const reasonPrefilled = useRef(Boolean(args.reason));
  const [options, setOptions] = useState<string[]>([]);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");

  const action = args.action;
  const activityId = args.activity_id;
  const title = args.title ?? "";
  const localTime = args.local_time ?? "";
  const isPostpone = action === "postpone";
  const parsed = readResult<ActionResult>(result);

  // 工具的流式参数可能晚于组件挂载到达，先补一次模型给出的跳过原因，之后不再覆盖用户输入
  useEffect(() => {
    if (reasonPrefilled.current || !args.reason) return;
    reasonPrefilled.current = true;
    setReason(args.reason);
  }, [args.reason]);

  useEffect(() => {
    if (status !== ToolCallStatus.Executing || !isPostpone || typeof activityId !== "number") return;
    let alive = true;
    setOptionsLoading(true);
    setOptionsError(false);
    void getPostponeOptions(activityId)
      .then((res) => {
        if (!alive) return;
        setOptions(res.times);
        const preferred =
          args.target_time && res.times.includes(args.target_time) ? args.target_time : (res.times[0] ?? "");
        setSelectedTime(preferred);
      })
      .catch(() => {
        if (alive) setOptionsError(true);
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [status, isPostpone, activityId, args.target_time]);

  if (status === ToolCallStatus.Complete) {
    if (parsed.cancelled) {
      return <Panel>已取消，没有修改任何活动。</Panel>;
    }
    if (parsed.ok && action) {
      const text =
        action === "postpone"
          ? `已把「${title}」推迟到 ${parsed.new_local_time ?? "新时间"}。`
          : `已${ACTION_LABEL[action]}「${title}」。`;
      return (
        <Panel>
          <strong>{text}</strong>
          <div style={{ marginTop: 6 }}>
            <Link to="/activity">去活动页查看</Link>
          </div>
        </Panel>
      );
    }
    return <Panel>操作失败：{parsed.message ?? "请稍后重试"}</Panel>;
  }

  if (status !== ToolCallStatus.Executing || !action || typeof activityId !== "number") {
    return <Panel>正在准备确认…</Panel>;
  }

  async function answer(ok: boolean) {
    if (busyRef.current || !respond || !action || typeof activityId !== "number") return;
    if (ok && isPostpone && (!selectedTime || !args.plan_date)) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!ok) {
        await respond({ ok: false, cancelled: true });
        return;
      }
      if (action === "complete") {
        await completeActivity(activityId);
        await respond({ ok: true });
        return;
      }
      if (action === "skip") {
        await skipActivity(activityId, reason.trim() || undefined);
        await respond({ ok: true });
        return;
      }
      const saved = await postponeActivity(activityId, `${args.plan_date}T${selectedTime}:00+08:00`);
      if (saved.ok === false) {
        await respond({ ok: false, message: saved.reason ?? "今日剩余时段不足，无法再推迟" });
        return;
      }
      await respond({ ok: true, new_local_time: selectedTime });
    } catch (error) {
      await respond({ ok: false, message: describeError(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="panel assistant-card" style={{ padding: "12px 14px", marginTop: 10, display: "grid", gap: 10 }}>
      <strong>
        {isPostpone
          ? `把「${title}」（${localTime}）推迟到：`
          : `${ACTION_LABEL[action]}「${title}」（${localTime}）？`}
      </strong>

      {action === "skip" ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>原因（可选，最多 120 字）</span>
          <input
            className="field-input"
            value={reason}
            maxLength={120}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}

      {isPostpone ? (
        optionsLoading ? (
          <div className="postpone-loading">加载可选时间…</div>
        ) : optionsError ? (
          <div className="postpone-empty">候选时间加载失败，请取消后到活动页操作。</div>
        ) : options.length === 0 ? (
          <div className="postpone-empty">今天没有更多可用时段可推迟了。</div>
        ) : (
          <div className="postpone-grid">
            {options.map((time) => (
              <button
                key={time}
                className={selectedTime === time ? "postpone-slot is-selected" : "postpone-slot"}
                type="button"
                onClick={() => setSelectedTime(time)}
              >
                {time}
              </button>
            ))}
          </div>
        )
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={busy || (isPostpone && (!selectedTime || !args.plan_date))}
          onClick={() => void answer(true)}
        >
          {busy ? "处理中…" : CONFIRM_LABEL[action]}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void answer(false)}>
          取消
        </button>
      </div>
      <small style={{ color: "var(--text-muted)" }}>
        只有点击确认才会修改；后端会再次校验活动状态与时间冲突。
      </small>
    </div>
  );
}

export function AssistantActions() {
  useHumanInTheLoop<ActionArgs>(
    {
      name: "confirm_activity_action",
      description:
        "对今天的某条活动执行完成、跳过或推迟，必须经用户在确认卡上点击确认。activity_id、title、local_time、plan_date 必须原样取自 list_my_activities 的返回值；推迟时用户给了具体时间才填 target_time（HH:MM）。",
      parameters: actionParameters,
      render: (props) => <ActivityActionCard {...props} />,
    },
    [],
  );

  useHumanInTheLoop<ScheduleArgs>(
    {
      name: "confirm_schedule",
      description:
        "保存本次 preview_schedule 生成的今日活动安排。只有在用户明确说“确认/保存”后调用；调用后等待用户在确认卡上点击确认，绝不能自行声称已保存。",
      parameters: scheduleParameters,
      render: (props) => <ScheduleConfirmCard {...props} />,
    },
    [],
  );

  return null;
}
