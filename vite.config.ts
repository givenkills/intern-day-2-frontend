import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
