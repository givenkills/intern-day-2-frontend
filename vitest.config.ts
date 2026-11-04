import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 地址解析是纯函数，不需要 DOM；浏览器分支靠 stub 全局 window 覆盖
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.mjs"],
  },
});
