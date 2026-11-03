import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { useEffect } from "react";

/**
 * 原生容器适配层。
 *
 * 只在 Capacitor 里生效，浏览器里两个 hook 都是空操作——
 * 这样同一份代码既能给桌面浏览器用，也能给 APK 用，不必分叉。
 */

/** 是否运行在 Capacitor 原生容器内（浏览器开发时为 false）。 */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * 安卓物理返回键。
 *
 * 约定：能回退就回退；已在历史栈底则"最小化"而不是退出——
 * 直接 exitApp 会让误触的用户丢掉填了一半的表单。
 */
export function useAndroidBackButton(): void {
  useEffect(() => {
    if (!isNativeApp) return;

    let disposed = false;
    let listener: PluginListenerHandle | undefined;

    void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      void CapacitorApp.minimizeApp();
    }).then((handle) => {
      // StrictMode 下 effect 会执行两次：若此时已卸载，立刻回收，
      // 否则返回键会挂上两个监听，表现为"一次返回跳两层"。
      if (disposed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, []);
}

/**
 * 软键盘遮挡。
 *
 * 不用插件上报的 keyboardHeight 直接当留白：Android 若 adjustResize 生效，
 * 页面本身已经被压缩，再补一份 padding 就成了双倍偏移。
 * 这里改算"布局视口与可视视口的差"，两种情况都能得到正确结果：
 *   - adjustResize 生效：两者同步收缩，差值约 0，不补留白；
 *   - 边到边导致 resize 失效：只有可视视口收缩，差值即键盘遮挡高度。
 */
function syncKeyboardInset(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
  // 40px 以下多半是地址栏收放的抖动，不当成键盘处理
  const next = overlap > 40 ? Math.round(overlap) : 0;
  document.documentElement.style.setProperty("--keyboard-inset", `${next}px`);
}

export function useKeyboardInset(): void {
  useEffect(() => {
    if (!isNativeApp) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let disposed = false;
    let listeners: PluginListenerHandle[] = [];

    viewport.addEventListener("resize", syncKeyboardInset);
    viewport.addEventListener("scroll", syncKeyboardInset);

    // 插件事件只用来触发重算，不用它的高度值，避免与 adjustResize 重复计算
    void (async () => {
      const shown = await Keyboard.addListener("keyboardDidShow", syncKeyboardInset);
      const hidden = await Keyboard.addListener("keyboardDidHide", syncKeyboardInset);
      if (disposed) {
        await shown.remove();
        await hidden.remove();
        return;
      }
      listeners = [shown, hidden];
    })();

    return () => {
      disposed = true;
      viewport.removeEventListener("resize", syncKeyboardInset);
      viewport.removeEventListener("scroll", syncKeyboardInset);
      for (const listener of listeners) void listener.remove();
      root.style.setProperty("--keyboard-inset", "0px");
    };
  }, []);
}
