/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 基地址，浏览器可直接访问的地址，例如 http://localhost:8000 */
  readonly VITE_API_BASE_URL?: string;
  /** CopilotKit Runtime 地址，浏览器可直接访问的地址，例如 http://localhost:8787 */
  readonly VITE_COPILOT_RUNTIME_URL?: string;
  /** 构建目标：android 表示要打进 Capacitor 容器，地址按 10.0.2.2 解析 */
  readonly VITE_TARGET?: string;
  /** 后端端口，默认 8000；与宿主端口映射保持一致 */
  readonly VITE_API_PORT?: string;
  /** CopilotKit Runtime 端口，默认 8787 */
  readonly VITE_RUNTIME_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
