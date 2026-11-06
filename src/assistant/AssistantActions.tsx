import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ToolCallStatus, useHumanInTheLoop } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { describeError } from "../api/client";
import { confirmAgentSchedule, type AgentScheduleSlot } from "../api/activity";
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

function readResult(value: unknown): ScheduleResult {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ScheduleResult;
    } catch {
      return { message: value };
    }
  }
  return value && typeof value === "object" ? (value as ScheduleResult) : {};
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
  const parsed = readResult(result);

  if (status === ToolCallStatus.Complete) {
    if (parsed.cancelled) {
      return (
        <div className="panel" style={{ padding: "12px 14px", marginTop: 10 }}>
          已取消，没有保存任何活动。
        </div>
      );
    }
    if (parsed.ok) {
      return (
        <div className="panel" style={{ padding: "12px 14px", marginTop: 10 }}>
          <strong>已保存 {parsed.planned ?? slots.length} 个活动。</strong>
          <div style={{ marginTop: 6 }}>
            <Link to="/activity">去活动页查看</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="panel" style={{ padding: "12px 14px", marginTop: 10 }}>
        保存失败：{parsed.message ?? "请让助手重新预排后再试"}
      </div>
    );
  }

  if (status !== ToolCallStatus.Executing) {
    return (
      <div className="panel" style={{ padding: "12px 14px", marginTop: 10 }}>
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
    <div className="panel" style={{ padding: "12px 14px", marginTop: 10, display: "grid", gap: 10 }}>
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

export function AssistantActions() {
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
