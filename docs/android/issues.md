# 移动端问题修复记录

记录本轮在 MuMu 模拟器上实际复现的问题。每条按「现象 → 复现 → 原因 → 修改 → 复验」组织，截图见 `screenshots/`。

测试环境（详见 `device-matrix.md`）：

- 设备：MuMu 模拟器 12 系（Android 15 / API 35），`SM_A5360`，WebView 为 Chromium 内核
- 档位 A（大屏）：1080×1920 / dpi 280 → CSS 视口约 617×1097
- 档位 B（小屏）：720×1280 / dpi 320 → CSS 视口约 360×640
- 后端：FastAPI（Docker，`0.0.0.0:8000`），CopilotKit Runtime `:8787`

---

## 1. 登录时报「无法连接后端」，但后端日志里有 OPTIONS 请求

| 项 | 内容 |
|---|---|
| 现象 | 输入 `intern / intern123456` 点登录，出现红色提示；后端口未见 401，而是 `OPTIONS /auth/login 400 Bad Request` |
| 截图 | `02-login-cors-blocked.png` |
| 复现 | 冷启动 App → 输入账号密码 → 点「登录」 |
| 原因 | 两层问题叠加：① `src/api/client.ts` 按 `window.location` 推导地址，WebView 里 location 是 `https://localhost`，推出 `https://localhost:8000`（协议、主机双错）；② 后端 `CORS_ORIGINS` 默认只放行 `http://localhost:5173`，App 的 origin `https://localhost` 不在白名单，预检直接 400 |
| 修改 | `src/api/endpoints.ts`（新增，统一解析后端与 Runtime 地址）；`src/api/client.ts`、`src/pages/AssistantPage.tsx`（改为消费该模块）；后端 `.env` 的 `CORS_ORIGINS` 增加 `https://localhost`（本地配置，不入库） |
| 复验 | 重新登录后 `POST /auth/login 200`，随后 `GET /activity/today|week|settings`、`GET /reports/2026-11-02` 均为 200，页面进入活动页 |
| 备注 | 前端错误文案原先写死「默认 http://localhost:8000」，会误导排查方向，已改为显示实际基址 |

---

## 2. 日报生成成功后，页面仍挂着「已提交到后台队列」

| 项 | 内容 |
|---|---|
| 现象 | 点「生成这一天」→ 出现黄色提示「已提交到后台队列，稍后刷新查看」→ 后台任务已成功（`job_succeeded ... review_len=42`）→ 正文和统计数字都刷出来了，但黄色提示不消失 |
| 截图 | 修复前 `06-report-success-stale-notice.png`；正文可见 `07-report-content.png` |
| 复现 | 对尚无日报的日期点「生成这一天」，等后台完成 |
| 原因 | `DailyReport.tsx` 里 `notice` 只在提交时 `setNotice(...)`，轮询到 `success`/`failed` 后没有任何地方清空它，于是提示比实际状态"活得更久" |
| 修改 | `src/components/DailyReport.tsx`：新增 `wasRunningRef`，轮询观察到运行态时置位；转入终态且曾经运行过时清空 `notice`。用 ref 而不是直接判断终态，避免"提交后第一次刷新仍是旧成功态"把提示提前抹掉 |
| 复验 | 重新构建安装后，日报生成完成时提示条随终态消失（本轮在宽视口下确认；360px 窄屏复测受模拟器旋转锁定失效影响，未完成，见第 6 条） |

---

## 3. 吸顶标题栏半透明，正文内容从底下透出

| 项 | 内容 |
|---|---|
| 现象 | 页面滚动后，顶部标题栏能隐约看到下面卡片的边缘与文字，视觉上像"重影" |
| 截图 | 修复前见 `06-report-success-stale-notice.png` 顶部；修复后 `12-header-solid.png` |
| 复现 | 登录后向下滚动任意距离 |
| 原因 | `.app-header` 用 `rgba(255,255,255,0.88)` + `backdrop-filter: blur(8px)`。桌面 Chrome 有模糊，WebView 里模糊未生效，只剩半透明底色，内容直接透出 |
| 修改 | `src/index.css`：在 `max-width: 860px` 下把标题栏改为不透明 `var(--surface)` 并取消 `backdrop-filter`；桌面端保留毛玻璃 |
| 复验 | 滚动到底部再回看标题栏，白底实心、无内容透出 |

---

## 4. 错误提示条里的「重试」被挤成竖排两行

| 项 | 内容 |
|---|---|
| 现象 | 窄屏出现错误提示时，右侧按钮显示为「重」「试」上下两行，按钮被拉成方块 |
| 截图 | `10-offline-error-wrap.png` |
| 复现 | 停掉后端容器 → 点日报「刷新」→ 出现红色提示条 |
| 原因 | `.alert` 是 flex 容器，文案未设 `min-width: 0`，按钮未设 `nowrap`；文案占满后按钮被压缩换行 |
| 修改 | `src/index.css`：`.alert > .btn { flex-shrink: 0; white-space: nowrap; }`，`.alert > span { min-width: 0; }` |
| 复验 | 同样的断网操作下按钮保持单行（`white-space: nowrap` + `flex-shrink: 0` 对任意宽度均成立；窄屏最终复测被第 6 条阻塞） |

---

## 5. 断网/后端不可达时的错误态与恢复（问题已确认可用，非缺陷）

| 项 | 内容 |
|---|---|
| 步骤 | `docker stop intern-day-2-backend-backend-1` → App 内点「刷新」 |
| 表现 | 显示「无法连接后端（http://10.0.2.2:8000），请确认后端已启动，且当前设备能访问该地址」+「重试」；**原有统计数据不被清空**，不伪造成功 |
| 恢复 | `docker start ...` → 点「重试」→ 提示消失，数据重新拉取（5 计划 / 3 完成 / 1 跳过） |
| 截图 | `10-offline-error-wrap.png`、`11-offline-recovered.png` |

---

## 6. 环境限制（非代码缺陷，交付时需说明）

| # | 限制 | 影响 | 处理 |
|---|---|---|---|
| 6.1 | MuMu 以物理键盘模式接管输入，软键盘不弹出；`show_ime_with_hard_keyboard=1` 后 `mInputShown=true`，但 IME 窗口不参与合成，截图里看不到键盘 | **键盘遮挡无法在本环境验证** | 代码侧已按"布局视口与可视视口差值"实现避让（`src/native/nativeShell.ts`），需在真机复验 |
| 6.2 | MuMu 的 `wm user-rotation lock` 会被应用启动覆盖，同一实例时而竖屏时而横屏 | 部分截图方向不一致；360px 窄屏的最终复测被中断 | 已用 `wm size` + `density` 制造两档尺寸；正式验收建议用真机或 AVD 固定方向 |
| 6.3 | 未安装 Android Studio（仅 Gradle 命令行） | 无法验证"Android Studio 打开项目" | 已在 README 与 PR 说明中标注为未验证项 |

---

## 7. 已发现但本轮未修复（建议后续处理）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 7.1 | 360px 小屏下顶部导航换到第二行，占约 1/3 屏高 | P2 | 可读可用，不算溢出/重叠。建议窄屏下隐藏品牌文字或把导航收进底部标签栏；截图 `08-small-screen-360x640.png` |
| 7.2 | 首屏 JS 主包 2.3MB（CopilotKit + 语法高亮） | P2 | 冷启动首屏偏慢；建议按路由懒加载助手页，把 CopilotKit 拆出主包 |
| 7.3 | 助手页（CopilotKit）未做移动端验证 | P1 | 本轮只验证登录/活动/日报；助手页依赖 Runtime `:8787`，`10.0.2.2` 方案同样适用，但未实测 |
| 7.4 | 旧 `android-app/` 未删除 | P3 | 本 PR 仅标注"已被 Capacitor 取代"，删除建议单独提 PR |
