// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolCallStatus } from "@copilotkit/react-core/v2";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeActivity,
  confirmAgentSchedule,
  getPostponeOptions,
  postponeActivity,
  skipActivity,
  type ConfirmScheduleResult,
} from "../api/activity";
import type { Activity } from "../api/types";
import { ActivityActionCard, ScheduleConfirmCard } from "./AssistantActions";

vi.mock("@copilotkit/react-core/v2", () => ({
  ToolCallStatus: {
    InProgress: "inProgress",
    Executing: "executing",
    Complete: "complete",
  },
  useHumanInTheLoop: vi.fn(),
}));

vi.mock("../api/activity", () => ({
  confirmAgentSchedule: vi.fn(),
  completeActivity: vi.fn(),
  skipActivity: vi.fn(),
  postponeActivity: vi.fn(),
  getPostponeOptions: vi.fn(),
}));

const mockedConfirm = vi.mocked(confirmAgentSchedule);
const mockedComplete = vi.mocked(completeActivity);
const mockedSkip = vi.mocked(skipActivity);
const mockedPostpone = vi.mocked(postponeActivity);
const mockedOptions = vi.mocked(getPostponeOptions);

const slots = [
  {
    scheduled_at: "2026-11-06T15:30:00+08:00",
    activity_type: "water",
    title: "接水或去洗手间",
  },
];

function renderCard(status = ToolCallStatus.Executing, result?: string) {
  const respond = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <ScheduleConfirmCard status={status} args={{ slots }} result={result} respond={respond} />
    </MemoryRouter>,
  );
  return respond;
}

describe("ScheduleConfirmCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("确认后调用后端并回传成功结果", async () => {
    mockedConfirm.mockResolvedValue({ planned: 1, activities: [] });
    const respond = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(slots));
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, planned: 1 }));
  });

  it("取消时不调用后端，并回传取消结果", async () => {
    const respond = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, cancelled: true }));
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it("接口失败时回传错误文案", async () => {
    mockedConfirm.mockRejectedValue(new Error("时间冲突"));
    const respond = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, message: "时间冲突" }));
  });

  it("连续点击只提交一次", async () => {
    let resolveConfirm: ((value: ConfirmScheduleResult) => void) | undefined;
    mockedConfirm.mockImplementation(
      () =>
        new Promise<ConfirmScheduleResult>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const respond = renderCard();
    const button = screen.getByRole("button", { name: "确认保存" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockedConfirm).toHaveBeenCalledTimes(1);
    resolveConfirm?.({ planned: 1, activities: [] });
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  });

  it("完成后展示保存数量", () => {
    renderCard(ToolCallStatus.Complete, JSON.stringify({ ok: true, planned: 2 }));

    expect(screen.getByText(/已保存 2 个活动/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去活动页查看" })).toBeInTheDocument();
  });

  it("取消后的完成态不显示保存成功", () => {
    renderCard(ToolCallStatus.Complete, JSON.stringify({ ok: false, cancelled: true }));

    expect(screen.getByText(/已取消，没有保存任何活动/)).toBeInTheDocument();
  });
});

const activityArgs = {
  activity_id: 7,
  title: "起身拉伸",
  local_time: "10:30",
  plan_date: "2026-11-06",
};

function renderAction(
  args: Partial<typeof activityArgs> & { action: "complete" | "skip" | "postpone"; target_time?: string; reason?: string },
  status = ToolCallStatus.Executing,
  result?: string,
) {
  const respond = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <ActivityActionCard status={status} args={{ ...activityArgs, ...args }} result={result} respond={respond} />
    </MemoryRouter>,
  );
  return respond;
}

describe("ActivityActionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("确认完成后调用完成接口并回传成功", async () => {
    mockedComplete.mockResolvedValue({} as Activity);
    const respond = renderAction({ action: "complete" });

    fireEvent.click(screen.getByRole("button", { name: "确认完成" }));

    await waitFor(() => expect(mockedComplete).toHaveBeenCalledWith(7));
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
  });

  it("跳过时带上用户填写的原因", async () => {
    mockedSkip.mockResolvedValue({} as Activity);
    const respond = renderAction({ action: "skip" });

    fireEvent.change(screen.getByLabelText(/原因/), { target: { value: "临时开会" } });
    fireEvent.click(screen.getByRole("button", { name: "确认跳过" }));

    await waitFor(() => expect(mockedSkip).toHaveBeenCalledWith(7, "临时开会"));
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
  });

  it("推迟时加载候选时间并提交选中的北京时间", async () => {
    mockedOptions.mockResolvedValue({ plan_date: "2026-11-06", times: ["14:30", "15:30"] });
    mockedPostpone.mockResolvedValue({ ok: true });
    const respond = renderAction({ action: "postpone" });

    fireEvent.click(await screen.findByRole("button", { name: "15:30" }));
    fireEvent.click(screen.getByRole("button", { name: "确认推迟" }));

    await waitFor(() =>
      expect(mockedPostpone).toHaveBeenCalledWith(7, "2026-11-06T15:30:00+08:00"),
    );
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, new_local_time: "15:30" }));
  });

  it("没有候选时间时禁用确认", async () => {
    mockedOptions.mockResolvedValue({ plan_date: "2026-11-06", times: [] });
    renderAction({ action: "postpone" });

    expect(await screen.findByText(/没有更多可用时段/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认推迟" })).toBeDisabled();
  });

  it("推迟被后端拒绝时回传原因", async () => {
    mockedOptions.mockResolvedValue({ plan_date: "2026-11-06", times: ["15:30"] });
    mockedPostpone.mockResolvedValue({ ok: false, reason: "今天只剩一个时段" });
    const respond = renderAction({ action: "postpone" });

    fireEvent.click(await screen.findByRole("button", { name: "15:30" }));
    fireEvent.click(screen.getByRole("button", { name: "确认推迟" }));

    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ ok: false, message: "今天只剩一个时段" }),
    );
  });

  it("取消时不调用任何接口", async () => {
    const respond = renderAction({ action: "complete" });

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, cancelled: true }));
    expect(mockedComplete).not.toHaveBeenCalled();
  });

  it("完成态展示操作结果", () => {
    renderAction(
      { action: "complete" },
      ToolCallStatus.Complete,
      JSON.stringify({ ok: true }),
    );

    expect(screen.getByText(/已完成「起身拉伸」/)).toBeInTheDocument();
  });
});
