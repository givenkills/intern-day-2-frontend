/** 小于该值视为地址栏收放的抖动，不当成键盘 */
const KEYBOARD_JITTER_PX = 40;

/**
 * 计算软键盘实际遮挡的高度。抽成纯函数（无 Capacitor / DOM 依赖），便于单测。
 *
 * 不用插件上报的 keyboardHeight 直接当留白：Android 若 adjustResize 生效，
 * 页面本身已被压缩，再补一份 padding 就成了双倍偏移。
 * 改用「布局视口与可视视口的差」，两种情况都能得到正确结果：
 *   - adjustResize 生效：两者同步收缩，差值约 0，不补留白；
 *   - 边到边导致 resize 失效：只有可视视口收缩，差值即遮挡高度。
 */
export function computeKeyboardInset(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop = 0,
): number {
  const overlap = innerHeight - viewportHeight - viewportOffsetTop;
  return overlap > KEYBOARD_JITTER_PX ? Math.round(overlap) : 0;
}
