import { useEffect, useRef } from "react";

import { registerBackInterceptor } from "./backInterceptors";

/**
 * 在弹窗等非路由 UI 打开期间优先消费安卓返回键。
 *
 * handler 返回 true 表示已处理（例如关闭弹窗），外层便不再切换 Tab 或最小化；
 * 返回 false 则继续交给外层逻辑。active 变为 false 时自动注销。
 */
export function useBackInterceptor(active: boolean, handler: () => boolean): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    return registerBackInterceptor(() => handlerRef.current());
  }, [active]);
}
