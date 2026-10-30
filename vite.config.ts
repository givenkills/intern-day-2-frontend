import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // 让应用可以被安卓 Chrome「添加到主屏幕」，装完后以独立窗口运行、无地址栏
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"],
      manifest: {
        name: "久坐活动助手",
        short_name: "久坐助手",
        description: "工作间隙的活动安排，到点提醒起身活动",
        lang: "zh-CN",
        start_url: "/activity",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f4f5f8",
        theme_color: "#4f46e5",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            // maskable 让图标在安卓自适应形状下不被裁掉
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // CopilotKit 打出来的 chunk 约 2.3MB，超过 Workbox 默认 2MiB 预缓存上限，
        // 这里放宽到 4MiB，否则构建会直接失败。
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // 应用是单页路由，刷新子路径要回落到 index.html
        navigateFallback: "index.html",
        // 接口请求永远走网络，不缓存登录态相关的响应
        navigateFallbackDenylist: [/^\/api/, /^\/agent/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 开发模式也生成 Service Worker，方便直接在模拟器里验证安装流程
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    // 必须监听 0.0.0.0，容器外（宿主机浏览器）才访问得到
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      // Windows 上把源码目录挂进容器时，原生文件事件常常收不到，
      // 改用轮询才能触发 HMR，否则改完必须重建容器才生效。
      usePolling: true,
      interval: 300,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});
