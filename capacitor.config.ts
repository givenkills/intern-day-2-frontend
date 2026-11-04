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
    // 注：这里曾配过 SystemBars.insetsHandling，但 @capacitor/system-bars 在 npm 上
    // 并不存在（404），属于无效配置，已移除。安全区目前只依赖 CSS env()；
    // API 35 实测窗口未延伸到状态栏（inset=0），env() 才是唯一来源。
    // 若日后需要兼容旧 WebView，再接入真实存在的安全区插件并注入 --safe-area-inset-*。
    Keyboard: {
      // Android 侧 resize 不生效（仅 iOS），这里只保留兼容配置，
      // 实际避让靠 visualViewport / keyboardDidShow 写 --keyboard-inset。
      resizeOnFullScreen: true,
    },
  },
};

export default config;
