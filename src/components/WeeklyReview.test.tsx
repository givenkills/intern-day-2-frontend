// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWeekStats } from "../api/activity";
import type { WeekStats as WeekStatsData } from "../api/types";
import { WeeklyReview } from "./WeeklyReview";

vi.mock("../api/activity", () => ({
  getWeekStats: vi.fn(),
}));

const getWeekStatsMock = vi.mocked(getWeekStats);
const NOW = new Date("2026-11-05T02:00:00Z"); // 上海 11-05 周四

function makeStats(overrides: Partial<WeekStatsData> = {}): WeekStatsData {
  return {
    week_start: "2026-10-26",
    week_end: "2026-11-01",
    timezone: "Asia/Shanghai",
    is_current: false,
    is_complete: true,
    planned: 3,
    completed: 1,
    skipped: 1,
    pending: 1,
    denominator: 3,
    completion_rate: 1 / 3,
    postponed_activities: 1,
    postponed_ops: 2,
    generated_at: "2026-11-05T02:00:00+00:00",
    days: [
      {
        date: "2026-10-26",
        planned: 3,
        completed: 1,
        skipped: 1,
        pending: 1,
        denominator: 3,
        completion_rate: 1 / 3,
        has_activities: true,
        activities: [
          {
            id: 1,
            title: "站起来走动",
            scheduled_at: "2026-10-26T02:00:00+00:00",
            local_time: "10:00",
            status: "completed",
            source: "system",
            duration_minutes: 5,
            is_postponed: false,
          },
        ],
      },
      ...["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].map(
        (date) => ({
          date,
          planned: 0,
          completed: 0,
          skipped: 0,
          pending: 0,
          denominator: 0,
          completion_rate: null,
          has_activities: false,
          activities: [],
        }),
      ),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  getWeekStatsMock.mockReset();
});

describe("WeeklyReview", () => {
  it("默认加载最近完整周，并显示完成率与分母", async () => {
    getWeekStatsMock.mockResolvedValue(makeStats());

    render(<WeeklyReview now={NOW} />);

    expect(await screen.findByText("2026-10-26 ~ 2026-11-01")).toBeInTheDocument();
    expect(getWeekStatsMock).toHaveBeenCalledWith("2026-10-26", "Asia/Shanghai");
    expect(screen.getAllByText("33%").length).toBeGreaterThan(0);
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
  });

  it("空周显示无安排，不伪造 0% 完成率", async () => {
    getWeekStatsMock.mockResolvedValue(
      makeStats({
        planned: 0,
        completed: 0,
        skipped: 0,
        pending: 0,
        denominator: 0,
        completion_rate: null,
        postponed_activities: 0,
        postponed_ops: 0,
        days: makeStats().days.map((day) => ({
          ...day,
          planned: 0,
          completed: 0,
          skipped: 0,
          pending: 0,
          denominator: 0,
          completion_rate: null,
          has_activities: false,
          activities: [],
        })),
      }),
    );

    render(<WeeklyReview now={NOW} />);

    expect(await screen.findByText("本周没有安排。")).toBeInTheDocument();
    expect(screen.getByText("无安排")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("接口失败时显示错误和重试，重试成功后恢复", async () => {
    getWeekStatsMock
      .mockRejectedValueOnce(new Error("后端不可达"))
      .mockResolvedValueOnce(makeStats());

    render(<WeeklyReview now={NOW} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("后端不可达");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("2026-10-26 ~ 2026-11-01")).toBeInTheDocument();
    expect(getWeekStatsMock).toHaveBeenCalledTimes(2);
  });

  it("快速切周时旧响应不能覆盖新周", async () => {
    let resolveFirst!: (value: WeekStatsData) => void;
    let resolveSecond!: (value: WeekStatsData) => void;
    getWeekStatsMock
      .mockImplementationOnce(
        () =>
          new Promise<WeekStatsData>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<WeekStatsData>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    render(<WeeklyReview now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "上一周" }));

    resolveSecond(
      makeStats({
        week_start: "2026-10-19",
        week_end: "2026-10-25",
        days: makeStats().days.map((day, index) => ({
          ...day,
          date: `2026-10-${19 + index}`,
        })),
      }),
    );
    expect(await screen.findByText("2026-10-19 ~ 2026-10-25")).toBeInTheDocument();

    resolveFirst(makeStats());
    await waitFor(() => {
      expect(screen.getByText("2026-10-19 ~ 2026-10-25")).toBeInTheDocument();
    });
    expect(screen.queryByText("2026-10-26 ~ 2026-11-01")).not.toBeInTheDocument();
  });

  it("切到当前周后禁用下一周，不能进入未来周", async () => {
    getWeekStatsMock.mockImplementation((weekStart) =>
      Promise.resolve(
        weekStart === "2026-11-02"
          ? makeStats({
              week_start: "2026-11-02",
              week_end: "2026-11-08",
              is_current: true,
              is_complete: false,
              days: makeStats().days.map((day, index) => ({
                ...day,
                date: `2026-11-0${2 + index}`.replace("2026-11-08", "2026-11-08"),
              })),
            })
          : makeStats(),
      ),
    );

    render(<WeeklyReview now={NOW} />);
    expect(await screen.findByText("2026-10-26 ~ 2026-11-01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一周" }));

    expect(await screen.findByText("2026-11-02 ~ 2026-11-08")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一周" })).toBeDisabled();
  });

  it("长活动名完整渲染，不截断数据", async () => {
    const longTitle =
      "这是一个非常长的活动名称，用来确认窄屏和大字体下标题不会被裁掉或变成省略号";
    getWeekStatsMock.mockResolvedValue(
      makeStats({
        days: makeStats().days.map((day, index) =>
          index === 0
            ? {
                ...day,
                activities: [{ ...day.activities[0], title: longTitle }],
              }
            : day,
        ),
      }),
    );

    render(<WeeklyReview now={NOW} />);

    expect(await screen.findByText(longTitle)).toBeInTheDocument();
  });
});
