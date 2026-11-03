# 移动端问题修复记录

记录本轮在 MuMu 模拟器上实际复现的问题。每条按「现象 → 复现 → 原因 → 修改 → 复验」组织，截图见 `screenshots/`。

测试环境（详见 `device-matrix.md`）：

- 设备：MuMu 模拟器 12 系（Android 15 / API 35），型号 `SM_A5360`，Chromium 内核 WebView
- 档位 A（大屏）：1080×1920 / dpi 280 → CSS 视口约 617×1097
- 档位 B（小屏）：720×1280 / dpi 320 → CSS 视口约 360×640
- 后端：FastAPI（Docker，`0.0.0.0:8000`），CopilotKit Runtime `:8787`

---

## 1. 登录时报「无法连接后端」，但后端日志里有 OPTIONS 请求

| 项 | 内容 |
|---|---|
| 现象 | 输入 `intern / intern123456` 点登录，出现红色提示；后端不是 401，而是 `OPTIONS /auth/login 400 Bad Request` |
| 截图 | `02-login-cors-blocked.png` |
| 复现 | 冷启动 → 输入账号密码 → 点「登录」 |
| 原因 | 两层问题叠加：① `src/api/client.ts` 按 `window.location` 推导地址，WebView 里 location 是 `https://localhost`，推出 `https://localhost:8000`（协议、主机双错）；② 后端 `CORS_ORIGINS` 默认只放行 `http://localhost:5173`，App 的 origin `https://localhost` 不在白名单，预检直接 400 |
| 修改 | 新增 `src/api/endpoints.ts` 统一解析后端与 Runtime 地址；`client.ts`、`AssistantPage.tsx` 改为消费该模块；后端 `.env` 的 `CORS_ORIGINS` 增加 `https://localhost`（本地配置，不入库） |
| 复验 | 重新登录 `POST /auth/login 200`，随后 `GET /activity/today|week|settings`、`GET /reports/2026-11-02` 均 200，进入活动页 |
| 备注 | 前端错误文案原先写死「默认 http://localhost:8000」，会把排查引向错误的地址，已改为显示实际基址 |

---

## 2. 日报生成成功后，页面仍挂着「已提交到后台队列」

| 项 | 内容 |
|---|---|
| 现象 | 点「生成这一天」→ 黄色提示「已提交到后台队列，稍后刷新查看」→ 后台已成功（`job_succeeded ... review_len=42`）→ 正文与统计都刷出来了，提示仍在 |
| 截图 | 修复前 `06-report-success-stale-notice.png`；正文见 `07-report-content.png` |
| 复现 | 对尚无日报的日期点「生成这一天」，等后台完成 |
| 原因 | `DailyReport.tsx` 的 `notice` 只在提交时设置，轮询到 `success`/`failed` 后没有任何地方清空它 |
| 修改 | 新增 `wasRunningRef`：观察到运行态时置位，转入终态且曾运行过时清空 `notice`。用 ref 而非直接判断终态，避免「提交后首次刷新仍拿到旧成功态」把提示提前抹掉 |
| 复验 | 重新构建安装后，生成完成时提示随终态消失 |
| 备注 | 本轮数据里每个可选日期都已有日报，无法在设备上再次复现"首次生成"场景，此项以代码审查 + 终态清空逻辑为据 |

---

## 3. 吸顶标题栏半透明，正文内容从底下透出

| 项 | 内容 |
|---|---|
| 现象 | 页面滚动后，顶部标题栏能隐约看到下面卡片边缘与文字，像"重影" |
| 截图 | 修复前 `06-report-success-stale-notice.png` 顶部；修复后 `12-header-solid.png` |
| 复现 | 登录后向下滚动任意距离 |
| 原因 | `.app-header` 使用 `rgba(255,255,255,0.88)` + `backdrop-filter: blur(8px)`。桌面 Chrome 有模糊，WebView 里模糊未生效，只剩半透明底色 |
| 修改 | `src/index.css`：`max-width: 860px` 下改为不透明 `var(--surface)` 并取消 `backdrop-filter`；桌面端保留毛玻璃 |
| 复验 | 滚动到底再回看标题栏，白底实心、无透出 |

---

## 4. 错误提示条里的「重试」被挤成竖排两行

| 项 | 内容 |
|---|---|
| 现象 | 窄屏出现错误提示时，右侧按钮显示为「重」「试」上下两行，按钮被拉成方块 |
| 截图 | `10-offline-error-wrap.png` |
| 复现 | 停掉后端容器 → 点日报「刷新」 |
| 原因 | `.alert` 是 flex 容器，文案未设 `min-width: 0`，按钮未设 `nowrap`；文案占满后按钮被压缩换行 |
| 修改 | `src/index.css`：`.alert > .btn { flex-shrink: 0; white-space: nowrap; }`，`.alert > span { min-width: 0; }` |
| 复验 | 同样断网操作下按钮保持单行（`14-coldstart-offline-keeps-session.png` 中两个提示条的按钮均横排） |

---

## 5. 冷启动时网络不可达，登录态被清空

| 项 | 内容 |
|---|---|
| 现象 | 已登录状态下杀进程重开，偶尔直接回到登录页，没有任何提示；此时后端日志里既没有 401，也没有登录请求 |
| 截图 | 修复后 `14-coldstart-offline-keeps-session.png`：后端停机冷启动，仍停留在已登录界面（右上角仍是"练习同学"），只显示错误条 |
| 复现 | 登录 → `docker stop` 后端 → `am force-stop` → 重开 |
| 原因 | `AuthContext.tsx` 启动时用 `/auth/me` 校验令牌，`catch` 里**对任何异常都 `clearSession()`**。网络不可达、网关 502、后端刚重启都算异常，于是把有效令牌一并删了。Android 冷启动抢网、后端容器重启都会命中 |
| 修改 | 只在 `ApiError.status === 401` 时清会话；其余异常重试两次（400ms / 800ms）；仍失败则保留令牌，并用 localStorage 缓存的用户信息恢复界面，后续任意接口 401 时照旧被 `onUnauthorized` 清掉 |
| 复验 | 上述步骤重跑：后端停机冷启动仍停在活动页，显示错误条与「重试」；恢复后端点「重试」，数据正常回填（`15-landscape-recovered.png`） |
| 影响 | 这一条直接关系到任务书的验收项 6（关闭 App 后重开，登录与持久化行为符合设计）；修复前该行为不稳定，修复后稳定可复现 |

---

## 6. 断网/后端不可达时的错误态与恢复（验证项，非缺陷）

| 项 | 内容 |
|---|---|
| 步骤 | `docker stop intern-day-2-backend-backend-1` → App 内点「刷新」 |
| 表现 | 显示「无法连接后端（http://10.0.2.2:8000），请确认后端已启动，且当前设备能访问该地址」+「重试」；**原有数据不被清空，也不伪造成功** |
| 恢复 | `docker start ...` → 点「重试」→ 提示消失，数据重新拉取 |
| 截图 | `10-offline-error-wrap.png`、`11-offline-recovered.png`、`15-landscape-recovered.png` |

---

## 7. 环境限制（非代码缺陷，交付时必须说明）

| # | 限制 | 影响 | 处理 |
|---|---|---|---|
| 7.1 | MuMu 以物理键盘模式接管输入，软键盘不弹出；`show_ime_with_hard_keyboard=1` 后 `mInputShown=true`，但 IME 窗口不参与合成，截图里看不到键盘 | **键盘遮挡无法在本环境验证** | 代码侧已按"布局视口与可视视口差值"实现避让（`src/native/nativeShell.ts`），需真机复验 |
| 7.2 | MuMu 的 `wm user-rotation lock` 会被应用启动覆盖，同一实例时而竖屏时而横屏 | 部分截图方向不一致；360px 窄屏的最终复测被中断 | 用 `wm size` + `density` 制造两档尺寸；正式验收建议用真机或 AVD 固定方向 |
| 7.3 | 未安装 Android Studio（仅 Gradle 命令行） | 无法验证"Android Studio 打开项目" | 已在 README 与 PR 说明中标注为未验证项 |

---

## 8. 已发现但本轮未修复（建议后续处理）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 8.1 | 360px 小屏下顶部导航换到第二行，占约 1/3 屏高 | P2 | 可读可用，不算溢出/重叠。建议窄屏隐藏品牌文字或把导航收进底部标签栏；截图 `08-small-screen-360x640.png` |
| 8.2 | 首屏 JS 主包 2.3MB（CopilotKit + 语法高亮） | P2 | 冷启动偏慢；建议按路由懒加载助手页 |
| 8.3 | 助手页（CopilotKit）未做移动端验证 | P1 | 本轮只覆盖登录/活动/日报；助手页依赖 Runtime `:8787`，`10.0.2.2` 方案同样适用但未实测 |
| 8.4 | 旧 `android-app/` 未删除 | P3 | 本 PR 仅标注"已被 Capacitor 取代"，删除建议单独提 PR |
