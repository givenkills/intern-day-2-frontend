import { describe, expect, it } from "vitest";

import {
  defaultScheduleDateTime,
  formatPlanDate,
  isValidDateInputValue,
  toBeijingDateInputValue,
  toDateInputValue,
  validateScheduleForm,
  validateTemplateForm,
  windowsFromSettings,
} from "./templateUtils";

/** 模板表单与日期默认值的边界，纯函数直接断言。 */

describe("toDateInputValue", () => {
  it("按本地日期补零，不受 UTC 影响", () => {
    expect(toDateInputValue(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
  });
});

describe("toBeijingDateInputValue", () => {
  it("跨 UTC 日期边界仍返回北京日期", () => {
    expect(toBeijingDateInputValue(new Date("2026-11-03T16:30:00Z"))).toBe("2026-11-04");
    expect(toBeijingDateInputValue(new Date("2026-11-04T15:59:00Z"))).toBe("2026-11-04");
    expect(toBeijingDateInputValue(new Date("2026-11-04T16:00:00Z"))).toBe("2026-11-05");
  });
});

describe("defaultScheduleDateTime", () => {
  it("取当前时间之后最近的 30 分钟整点", () => {
    expect(defaultScheduleDateTime(new Date("2026-11-04T10:00:00+08:00"))).toEqual({
      plan_date: "2026-11-04",
      time: "10:30",
    });
  });

  it("设备时区无关：UTC 02:00 等于北京 10:00", () => {
    expect(defaultScheduleDateTime(new Date("2026-11-04T02:00:00Z"))).toEqual({
      plan_date: "2026-11-04",
      time: "10:30",
    });
  });

  it("太早时夹到 10:00，避免默认值落在窗口外", () => {
    expect(defaultScheduleDateTime(new Date("2026-11-04T08:15:00+08:00"))).toEqual({
      plan_date: "2026-11-04",
      time: "10:00",
    });
  });

  it("当天最后一个能装下时长的整点仍可用", () => {
    expect(
      defaultScheduleDateTime(new Date("2026-11-04T16:55:00+08:00"), undefined, 5),
    ).toEqual({
      plan_date: "2026-11-04",
      time: "17:00",
    });
  });

  it("装不下默认时长时顺延到明天第一个窗口", () => {
    expect(
      defaultScheduleDateTime(new Date("2026-11-04T17:29:00+08:00"), undefined, 5),
    ).toEqual({
      plan_date: "2026-11-05",
      time: "10:00",
    });
  });

  it("跳过窗口空档：12:00 不在 10-12 / 14-17:30 内，给 14:00", () => {
    expect(
      defaultScheduleDateTime(new Date("2026-11-04T11:40:00+08:00"), undefined, 6),
    ).toEqual({
      plan_date: "2026-11-04",
      time: "14:00",
    });
  });

  it("跨年时日期正确顺延", () => {
    expect(defaultScheduleDateTime(new Date("2026-12-31T18:00:00+08:00"))).toEqual({
      plan_date: "2027-01-01",
      time: "10:00",
    });
  });
});

describe("windowsFromSettings", () => {
  const base = {
    work_start: "09:00",
    work_end: "18:00",
    morning_start: "10:00",
    morning_end: "12:00",
    afternoon_start: "14:00",
    afternoon_end: "17:30",
  };

  it("取上午和下午两个窗口", () => {
    expect(windowsFromSettings(base)).toEqual([
      { start: "10:00", end: "12:00" },
      { start: "14:00", end: "17:30" },
    ]);
  });

  it("没配窗口时退回整个工作时段", () => {
    expect(
      windowsFromSettings({
        ...base,
        morning_start: null,
        morning_end: null,
        afternoon_start: null,
        afternoon_end: null,
      }),
    ).toEqual([{ start: "09:00", end: "18:00" }]);
  });
});

describe("isValidDateInputValue", () => {
  it("接受严格的 YYYY-MM-DD 和闰日", () => {
    expect(isValidDateInputValue("2026-11-04")).toBe(true);
    expect(isValidDateInputValue("2024-02-29")).toBe(true);
  });

  it("拒绝不存在的日期与其它格式", () => {
    expect(isValidDateInputValue("2023-02-29")).toBe(false);
    expect(isValidDateInputValue("2026-13-01")).toBe(false);
    expect(isValidDateInputValue("2026-11-31")).toBe(false);
    expect(isValidDateInputValue("2026-1-1")).toBe(false);
    expect(isValidDateInputValue("20261104")).toBe(false);
  });
});

describe("validateTemplateForm", () => {
  it("合法输入通过", () => {
    expect(validateTemplateForm("肩颈拉伸", "绕肩十次", "6")).toBeNull();
    expect(validateTemplateForm("拉伸", "描述", 1)).toBeNull();
    expect(validateTemplateForm("拉伸", "描述", 120)).toBeNull();
  });

  it("名称与描述不能为空或只有空格", () => {
    expect(validateTemplateForm("   ", "描述", "5")).toContain("名称");
    expect(validateTemplateForm("拉伸", "   ", "5")).toContain("描述");
  });

  it("名称与描述有长度上限", () => {
    expect(validateTemplateForm("x".repeat(41), "描述", "5")).toContain("40");
    expect(validateTemplateForm("拉伸", "x".repeat(201), "5")).toContain("200");
  });

  it("时长必须是 1-120 的整数", () => {
    expect(validateTemplateForm("拉伸", "描述", "0")).toContain("1-120");
    expect(validateTemplateForm("拉伸", "描述", "121")).toContain("1-120");
    expect(validateTemplateForm("拉伸", "描述", "1.5")).toContain("1-120");
    expect(validateTemplateForm("拉伸", "描述", "abc")).toContain("1-120");
  });
});

describe("validateScheduleForm", () => {
  const now = new Date("2026-11-04T09:00:00+08:00");

  it("今天与未来日期通过", () => {
    expect(validateScheduleForm("2026-11-04", "15:00", "5", now)).toBeNull();
    expect(validateScheduleForm("2026-11-05", "00:00", "5", now)).toBeNull();
  });

  it("过去的日期被拒绝", () => {
    expect(validateScheduleForm("2026-11-03", "15:00", "5", now)).toContain("过去");
  });

  it("非法日期与时间格式被拒绝", () => {
    expect(validateScheduleForm("2026-02-31", "15:00", "5", now)).toContain("日期");
    expect(validateScheduleForm("2026-11-04", "9:00", "5", now)).toContain("时间");
    expect(validateScheduleForm("2026-11-04", "24:00", "5", now)).toContain("时间");
  });

  it("时长同样受 1-120 限制", () => {
    expect(validateScheduleForm("2026-11-04", "15:00", "0", now)).toContain("1-120");
    expect(validateScheduleForm("2026-11-04", "15:00", "121", now)).toContain("1-120");
  });
});

describe("formatPlanDate", () => {
  it("转成易读的中文日期", () => {
    expect(formatPlanDate("2026-11-04")).toBe("11 月 4 日");
  });

  it("非法输入原样返回，不抛异常", () => {
    expect(formatPlanDate("not-a-date")).toBe("not-a-date");
  });
});
