import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // 默认纯 Node；需要 DOM 的用例在文件顶部用 @vitest-environment jsdom 单独声明
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "server/**/*.test.mjs"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
