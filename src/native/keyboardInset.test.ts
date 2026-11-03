import { describe, expect, it } from "vitest";

import { computeKeyboardInset } from "./keyboardInset";

/**
 * 键盘留白的计算只有两种真实情形，用纯函数覆盖：
 * 设备上软键盘能否唤起受模拟器限制（MuMu 不合成 IME 窗口），
 * 所以把这段算术从 DOM 里抽出来单测，避免"只能靠肉眼"。
 */
describe("computeKeyboardInset", () => {
  it("adjustResize 生效时布局视口与可视视口同步收缩，不补留白", () => {
    // 页面本身已经被压缩：innerHeight 从 640 跟着降到 380，可视视口也是 380
    expect(computeKeyboardInset(380, 380, 0)).toBe(0);
  });

  it("边到边导致 resize 失效时，差值为键盘遮挡高度", () => {
    // 布局视口仍是 640，可视视口被键盘压到 380
    expect(computeKeyboardInset(640, 380, 0)).toBe(260);
  });

  it("可视视口顶部有偏移时一并扣除", () => {
    expect(computeKeyboardInset(640, 380, 40)).toBe(220);
  });

  it("小于抖动阈值的差值忽略（地址栏收放）", () => {
    expect(computeKeyboardInset(640, 610, 0)).toBe(0);
  });

  it("结果取整，避免亚像素造成布局抖动", () => {
    expect(computeKeyboardInset(640, 380.4, 0)).toBe(260);
  });
});
