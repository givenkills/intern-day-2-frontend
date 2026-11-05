import { describe, expect, it } from "vitest";

import {
  addDays,
  canGoNext,
  currentWeekStart,
  dateKeyInTimeZone,
  formatRate,
  lastCompleteWeekStart,
  mondayOf,
} from "./weekReview";

describe("weekReview date helpers", () => {
  it("把任意日期归一化到周一", () => {
    expect(mondayOf("2026-11-05")).toBe("2026-11-02");
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("跨月、跨年加减天数", () => {
    expect(addDays("2026-10-26", -7)).toBe("2026-10-19");
    expect(addDays("2025-12-29", 7)).toBe("2026-01-05");
  });

  it("默认最近完整周是当前周前一周", () => {
    const now = new Date("2026-11-05T02:00:00Z"); // 上海 11-05 周四
    expect(currentWeekStart("Asia/Shanghai", now)).toBe("2026-11-02");
    expect(lastCompleteWeekStart("Asia/Shanghai", now)).toBe("2026-10-26");
  });

  it("按用户时区判断自然日，UTC 深夜会落到不同周", () => {
    const beforeMidnight = new Date("2026-11-01T15:30:00Z"); // 上海 11-01 23:30
    const afterMidnight = new Date("2026-11-01T16:30:00Z"); // 上海 11-02 00:30

    expect(dateKeyInTimeZone(beforeMidnight, "Asia/Shanghai")).toBe("2026-11-01");
    expect(dateKeyInTimeZone(afterMidnight, "Asia/Shanghai")).toBe("2026-11-02");
    expect(currentWeekStart("Asia/Shanghai", beforeMidnight)).toBe("2026-10-26");
    expect(currentWeekStart("Asia/Shanghai", afterMidnight)).toBe("2026-11-02");
  });

  it("设备返回固定偏移时也能按该偏移计算日期", () => {
    const beforeMidnight = new Date("2026-11-01T15:30:00Z"); // +08:00 的 11-01 23:30
    const afterMidnight = new Date("2026-11-01T16:30:00Z"); // +08:00 的 11-02 00:30

    expect(dateKeyInTimeZone(beforeMidnight, "+08:00")).toBe("2026-11-01");
    expect(dateKeyInTimeZone(afterMidnight, "+08:00")).toBe("2026-11-02");
    expect(currentWeekStart("+08:00", afterMidnight)).toBe("2026-11-02");
  });

  it("只允许切到当前周，不能进入未来周", () => {
    const now = new Date("2026-11-05T02:00:00Z");
    expect(canGoNext("2026-10-26", "Asia/Shanghai", now)).toBe(true);
    expect(canGoNext("2026-11-02", "Asia/Shanghai", now)).toBe(false);
    expect(canGoNext("2026-11-09", "Asia/Shanghai", now)).toBe(false);
  });

  it("空周完成率显示占位符，不显示 0%", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1 / 3)).toBe("33%");
    expect(formatRate(1)).toBe("100%");
  });
});
