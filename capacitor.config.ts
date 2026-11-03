import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 同一个配置文件服务两种构建：
 *   CAP_ENV=prod 正式构建 —— 不允许明文流量、不允许混合内容；
 *   默认（调试构建）—— 为本地联调放开，且只影响 debug 变体（见 android/app/src/debug）。
 */
const isDebugBuild = process.env.CAP_ENV !== "prod";

const config: CapacitorConfig = {
  // 沿用现有 WebView 壳的包名，保持"同一个 App"的语义；
  // debug 变体在 app/build.gradle 里加了 .debug 后缀，可与旧壳并存对比。
  appId: "com.jiuzuo.assistant",
  appName: "久坐活动助手",
  webDir: "dist",

  server: {
    // 保持 https：WebView 以 https://localhost 加载打包资源，属于安全上下文。
    // 改成 http 会连带改变 origin（影响 localStorage 与 CORS 白名单），故不动。
    androidScheme: "https",
  },

  android: {
    // https 页面请求 http 后端属"混合内容"，默认被拦；仅调试构建放开。
    allowMixedContent: isDebugBuild,
  },

  plugins: {
    SystemBars: {
      // MuMu 自带 WebView 常低于 Chromium 140，该版本段 env(safe-area-inset-*) 取值不可靠；
      // css 模式由原生侧注入 --safe-area-inset-*，与 env() 组成兜底链（见 src/index.css）。
      insetsHandling: "css",
      style: "DEFAULT",
    },
    Keyboard: {
      // Android 侧 resize 不生效（仅 iOS），这里只保留兼容配置，
      // 实际避让靠 visualViewport / keyboardDidShow 写 --keyboard-inset。
      resizeOnFullScreen: true,
    },
  },
};

export default config;
