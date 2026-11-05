import { beforeEach, describe, expect, it } from "vitest";

import {
  KEYBOARD_BACK_WINDOW_MS,
  consumeKeyboardBack,
  markKeyboardHidden,
  markKeyboardVisible,
  resetKeyboardBackState,
  shouldConsumeBackForKeyboard,
} from "./keyboardBack";

describe("keyboardBack", () => {
  it("键盘可见时返回键先收键盘", () => {
    expect(shouldConsumeBackForKeyboard({ visible: true, hiddenAt: null }, 1000)).toBe(true);
  });

  it("键盘刚隐藏的短时间内仍按键盘返回处理", () => {
    expect(shouldConsumeBackForKeyboard({ visible: false, hiddenAt: 1000 }, 1200)).toBe(true);
  });

  it("超过窗口期后恢复正常的页面返回逻辑", () => {
    expect(
      shouldConsumeBackForKeyboard({ visible: false, hiddenAt: 1000 }, 1000 + KEYBOARD_BACK_WINDOW_MS + 1),
    ).toBe(false);
    expect(shouldConsumeBackForKeyboard({ visible: false, hiddenAt: null }, 5000)).toBe(false);
  });

  describe("module state", () => {
    beforeEach(() => resetKeyboardBackState());

    it("同一帧内只消费一次，下一次返回交给弹窗", () => {
      markKeyboardHidden(1000);
      expect(consumeKeyboardBack(1100)).toBe(true);
      expect(consumeKeyboardBack(1101)).toBe(false);
    });

    it("键盘显示事件优先于旧的隐藏时间", () => {
      markKeyboardHidden(1000);
      markKeyboardVisible();
      expect(consumeKeyboardBack(1060)).toBe(true);
      expect(consumeKeyboardBack(1070)).toBe(true);
    });
  });
});
