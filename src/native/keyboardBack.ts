/**
 * 安卓返回键与软键盘的优先级。
 *
 * 部分厂商 ROM 在键盘展开时按返回，会同时收起键盘并派发 backButton；
 * 如果直接关闭弹窗，用户刚输入的内容就丢了。这里记录键盘状态，
 * 并允许把「刚隐藏」的一小段时间也视为键盘返回，吞掉这次事件。
 */

export const KEYBOARD_BACK_WINDOW_MS = 350;

export interface KeyboardBackState {
  visible: boolean;
  hiddenAt: number | null;
}

export function shouldConsumeBackForKeyboard(
  state: KeyboardBackState,
  now: number,
  windowMs = KEYBOARD_BACK_WINDOW_MS,
): boolean {
  if (state.visible) return true;
  if (state.hiddenAt === null) return false;
  const elapsed = now - state.hiddenAt;
  return elapsed >= 0 && elapsed <= windowMs;
}

let state: KeyboardBackState = { visible: false, hiddenAt: null };

export function markKeyboardVisible(): void {
  state = { visible: true, hiddenAt: null };
}

export function markKeyboardHidden(now = Date.now()): void {
  state = { visible: false, hiddenAt: now };
}

/** 返回 true 表示这次返回已被键盘消费；窗口标记同时清掉，第二次返回才关弹窗。 */
export function consumeKeyboardBack(now = Date.now()): boolean {
  if (!shouldConsumeBackForKeyboard(state, now)) return false;
  state = { ...state, hiddenAt: null };
  return true;
}

export function resetKeyboardBackState(): void {
  state = { visible: false, hiddenAt: null };
}

export function keyboardBackState(): Readonly<KeyboardBackState> {
  return state;
}
