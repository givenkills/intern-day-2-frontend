import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { runBackInterceptors } from "./backInterceptors";
import {
  consumeKeyboardBack,
  markKeyboardHidden,
  markKeyboardVisible,
} from "./keyboardBack";
import { computeKeyboardInset } from "./keyboardInset";

/**
 * 原生容器适配层。
 *
 * 只在 Capacitor 里生效，浏览器里两个 hook 都是空操作——
 * 这样同一份代码既能给桌面浏览器用，也能给 APK 用，不必分叉。
 */

/** 是否运行在 Capacitor 原生容器内（浏览器开发时为 false）。 */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * 返回键事件：先交给已打开的弹窗等页面内 UI（见 backInterceptors），
 * 再广播给页面；页面若自行处理（例如把底部标签切回"今日"）就
 * preventDefault，外层便不再回退或最小化。
 */
export const BACK_EVENT = "app:android-back";

/** 首页路由：在这里按返回键应当最小化，而不是退出 */
const ROOT_PATH = "/activity";

/**
 * 安卓物理返回键。
 *
 * 约定：能回退就回退；已在历史栈底则"最小化"而不是退出——
 * 直接 exitApp 会让误触的用户丢掉填了一半的表单。
 */
export function useAndroidBackButton(): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isNativeApp) return;

    let disposed = false;
    let listener: PluginListenerHandle | undefined;

    void CapacitorApp.addListener("backButton", () => {
      // 0) 键盘是最高优先级：部分 ROM 收起键盘时也会派发 backButton，
      //    不先消费就会把刚输入内容的弹窗一起关掉。
      if (consumeKeyboardBack()) {
        void Keyboard.hide().catch(() => {});
        return;
      }

      // 1) 弹窗等非路由 UI 次之：它们不是路由，回退只会切走整个页面，
      //    弹窗状态却留在组件里，下次进入该 Tab 会自己冒出来（模拟器实测过）。
      if (runBackInterceptors()) return;

      // 1) 再让页面自行处理：底部标签不是路由，返回键无从"history.back()"，
      //    由页面把标签切回"今日"并 preventDefault。
      const pageHandled = !window.dispatchEvent(new CustomEvent(BACK_EVENT, { cancelable: true }));
      if (pageHandled) return;

      // 2) 二级路由（待办/助手等）回退一页
      //    location.key 为 "default" 说明是冷启动直接落在这条路由上，没有上一页
      if (location.pathname !== ROOT_PATH && location.key !== "default") {
        navigate(-1);
        return;
      }

      // 3) 已经在首页：最小化而不是退出，避免误触丢掉未提交的表单
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
  }, [location.pathname, location.key, navigate]);
}

/** 把算出来的留白写进 CSS 变量，供 index.css 消费 */
function syncKeyboardInset(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const next = computeKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
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
      const shown = await Keyboard.addListener("keyboardDidShow", () => {
        markKeyboardVisible();
        syncKeyboardInset();
      });
      const hidden = await Keyboard.addListener("keyboardDidHide", () => {
        markKeyboardHidden();
        syncKeyboardInset();
      });
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
