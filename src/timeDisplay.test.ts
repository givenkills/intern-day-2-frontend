import { describe, expect, it } from "vitest";

import { formatBeijingTime } from "./timeDisplay";

describe("formatBeijingTime", () => {
  it("把 UTC 转成北京时间，不受设备时区影响", () => {
    expect(formatBeijingTime("2026-11-04T03:00:00+00:00")).toBe("11:00");
    expect(formatBeijingTime("2026-11-04T16:30:00Z")).toBe("00:30");
  });

  it("带 +08:00 偏移的时间保持原样", () => {
    expect(formatBeijingTime("2026-11-04T11:00:00+08:00")).toBe("11:00");
  });

  it("非法输入返回占位符", () => {
    expect(formatBeijingTime("not-a-time")).toBe("--:--");
  });
});
