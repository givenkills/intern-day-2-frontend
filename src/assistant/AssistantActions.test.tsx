// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolCallStatus } from "@copilotkit/react-core/v2";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmAgentSchedule, type ConfirmScheduleResult } from "../api/activity";
import { ScheduleConfirmCard } from "./AssistantActions";

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
}));

const mockedConfirm = vi.mocked(confirmAgentSchedule);

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
