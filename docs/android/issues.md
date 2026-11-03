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
| 7.1 | MuMu 以物理键盘模式接管输入，软键盘不弹出；`show_ime_with_hard_keyboard=1` 后 `mInputShown=true`，但 IME 窗口不参与 headless 合成 | MuMu 上无法验证键盘遮挡 | 已改用 **Android Emulator（Pixel 7 / API 35）** 补验通过，见 `device-matrix.md` 场景 10；MuMu 不再用于键盘相关验证 |
| 7.2 | MuMu 的 `wm user-rotation lock` 会被应用启动覆盖，同一实例时而竖屏时而横屏 | 部分截图方向不一致；360px 窄屏的最终复测被中断 | 用 `wm size` + `density` 制造两档尺寸；正式验收建议用真机或 AVD 固定方向 |
| 7.3 | 未安装 Android Studio（仅 Gradle 命令行） | 无法验证"Android Studio 打开项目" | 已在 README 与 PR 说明中标注为未验证项 |

---

## 8. 已发现但本轮未修复（建议后续处理）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| 8.1 | 360px 小屏下顶部为两行头部（品牌一行、操作一行） | P3，**不改** | 起初按"换行缺陷"处理，查证后发现是 `@media (max-width: 860px)` 里的**既有设计**，注释写明"品牌占第一行，导航/用户/退出整体换到第二行右对齐，避免挤成三行"。实测头部 92 CSS px（约占 640 高的 14%），不构成溢出或遮挡，故保留原设计，撤回本轮加的覆盖样式 |
| 8.2 | 首屏 JS 主包 2.3MB（CopilotKit + 语法高亮） | P2 | 冷启动偏慢；建议按路由懒加载助手页 |
| 8.3 | 助手页聊天区在 360×640 下高度偏紧 | P3 | 输入框占比较高，消息区可视条数少；功能可用，见 `16-assistant-page.png` |

---

## 9. 环境教训：重建后端容器会丢模型凭据

| 项 | 内容 |
|---|---|
| 现象 | 助手页发消息一直失败，Runtime 日志报 `status: 404, payload: { detail: 'Not Found' }` |
| 原因 | 后端的 `QWEN_API_KEY` 当初是通过启动命令的 shell 环境传入的，没有写进 `.env`。本轮为改 CORS 执行 `docker compose up -d backend` 重建容器后，该变量变成空值；后端 `agent_ready` 为 false 时**不注册 `/agent` 路由**，Runtime 于是拿到 404 |
| 排查 | `/agent` 从 405（路由存在）变回 404 是关键信号；对比 `backend` 与 `worker` 容器 `printenv` 发现只有 backend 缺键 |
| 处理 | 把 `QWEN_API_KEY` / `QWEN_MODEL` 写进后端 `.env`（已 gitignore），重建后 `/agent` 返回 405、助手恢复正常 |
| 建议 | 凡是通过 shell 变量启动过的服务，重建前先确认 `.env` 里有没有这些键；`printenv` 对比是两个容器配置漂移最快的验证方式 |

---

## 10. 返回键在标签页上直接最小化，而不是回到「今日」

> 交付前按任务书逐条复核时补充的一条：实现写完了，但没在设备上按过返回键。

| 项 | 内容 |
|---|---|
| 现象 | 底部切到「设置」后按系统返回键，应用直接退到桌面（最小化），而不是回到「今日安排」 |
| 截图 | 修复后 `18-back-key-returns-today.png`（按返回后面板回到「今日安排」，且仍在应用内） |
| 复现 | 进入应用 → 底部点「设置」→ 按系统返回键 |
| 原因 | 两个问题叠加：① 底部标签是 `ActivityPage` 内的 `useState`，**不是路由**，浏览器历史里没有它的记录，任何"history.back()"都无从回退；② 原实现依赖电容返回事件的 `canGoBack` 判断，实测该值为 false，于是走了最小化分支 |
| 修改 | 改成三级判断：先广播 `app:android-back` 事件让页面消费（标签不是"今日"就切回"今日"并 `preventDefault`）；页面没消费再看路由——二级路由且 `location.key !== "default"` 则 `navigate(-1)`；最后才最小化。见 `src/native/nativeShell.ts`、`src/pages/ActivityPage.tsx` |
| 复验 | ①「设置」按返回 → 回到「今日安排」，`mCurrentFocus` 仍是本应用；② 在「今日」再按返回 → 焦点转到 `app.lawnchair`（已最小化），`pidof` 仍返回进程号（9317），确认是"最小化"而非"退出" |

---

## 11. `capacitor.config.ts` 里配了一个不存在的插件（SystemBars）

> 同一批复核时发现的：配置文件写了，包却没装，属于"看起来做了、实际没生效"。

| 项 | 内容 |
|---|---|
| 现象 | 配置里有 `plugins.SystemBars.insetsHandling: "css"`，注释还写明"由原生侧注入 `--safe-area-inset-*`"，但 `src/index.css` 里那层变量始终为空 |
| 排查 | `ls node_modules/@capacitor` 只有 core/app/keyboard/android/cli；`pnpm view @capacitor/system-bars` 直接 **404** —— 这个包在 npm 上并不存在 |
| 影响 | 安全区的"三层兜底"实际只有两层（`env()` + `0px`）。不产生错误，但会让人误以为旧 WebView 已被覆盖 |
| 修改 | 删除该段配置并写明原因；CSS 注释同步改为"优先用原生注入变量（当前未接插件），其次 `env()`" |
| 复验 | Pixel 7（API 35 与 API 36）实测：`dumpsys` 显示 cutout/statusBar 高 136px，而 CSS 视口 839/914（窗口未延伸到状态栏），`--safe-top` 恒为 `0px`，`env()` 分支未被触发 |
| 结论 | 当前不存在"刘海压内容"问题，但不是因为兜底生效，而是系统本身没让页面进入状态栏区域。若日后开启 edge-to-edge 或接入安全区插件，这段逻辑需重新验证 |
