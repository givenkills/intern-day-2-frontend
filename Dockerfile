# 本次练习按任务说明使用 Vite 开发服务器演示，所以镜像内直接装依赖并跑 dev server。
# 依赖严格按 pnpm-lock.yaml 安装（--frozen-lockfile），换机器也能装出同一套版本。
FROM node:22-alpine

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN npm install -g pnpm@9.15.9

WORKDIR /app

# 先只拷清单，锁文件不变时可复用这一层缓存
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Vite 必须监听 0.0.0.0，宿主机浏览器才访问得到
EXPOSE 5173

CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
