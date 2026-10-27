# 开发容器镜像：只放工具链，业务代码由 VS Code 挂载进容器。
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# 固定 pnpm 版本，保证和 pnpm-lock.yaml 的版本一致
RUN npm install -g pnpm@9.15.9
