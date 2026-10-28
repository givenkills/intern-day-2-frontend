import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 必须监听 0.0.0.0，容器外（宿主机浏览器）才访问得到
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});
