# 设备矩阵与验证记录

验证日期：2026-11-03
构建：Debug APK（`android/app/build/outputs/apk/debug/app-debug.apk`），包名 `com.jiuzuo.assistant.debug`

---

## 1. 设备配置

| 档位 | 设备 | Android | 分辨率 | dpi | CSS 视口 | 用途 |
|---|---|---|---|---|---|---|
| A 大屏 | MuMu 模拟器 12 系（型号 `SM_A5360`） | 15（API 35） | 1080×1920 | 280 | 约 617×1097 | 主要流程、日报、错误态 |
| B 小屏 | 同一实例，`wm size 720x1280` + `wm density 320` | 15（API 35） | 720×1280 | 320 | 约 360×640 | 窄屏溢出、按钮排布 |
| C 横屏 | 同一实例，未锁定方向 | 15（API 35） | 1920×1080 | 280 | 约 1097×617 | 横屏布局（桌面两栏降级） |
| D 挖孔真机档 | Android Emulator **Pixel 7**（`notch35`，带显示挖孔） | 15（API 35） | 1080×2400 | 420 | 412×914 | 软键盘、安全区、真实 IME |
| E 新系统档 | 同一镜像克隆为 `notch36`（API 36 强制 edge-to-edge） | 16（API 36） | 1080×2400 | 420 | 412×914 | 验证新系统下的安全区行为 |

> 说明：本轮没有第二台物理设备，B/C 档通过 `wm size` / `wm density` 在同一实例上制造差异，属于"同机型不同尺寸"的近似，不是真正的多机型覆盖。

---

## 2. 连接方式

MuMu 12 的 ADB 端口是**动态**的（本体常见 16384，不是旧版规则的 7555），且实例未启动时不会监听：

```bash
# 查端口（未启动时不会有 adb_port 字段）
"C:\Program Files\Netease\MuMu\nx_main\MuMuManager.exe" info -v 0
# 启动实例
"C:\Program Files\Netease\MuMu\nx_main\MuMuManager.exe" control -v 0 launch

adb connect 127.0.0.1:16384
adb -s 127.0.0.1:16384 install -r app-debug.apk
```

踩过的坑：MuMu 会同时注册 `emulator-5554` 与 `127.0.0.1:16384` 两个 transport，命令不带 `-s` 会报 `more than one device`；`adb` server 在部分终端会话结束时会被回收，需重新 `start-server`。

---

## 3. 端到端场景结果

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | 冷启动显示登录页 | 通过 | `01-login-page.png` |
| 1b | 输入校验 / 键盘遮挡 | **键盘无法唤起**，校验与遮挡未验证 | 见 `issues.md` 7.1 |
| 2 | 登录 → 读取活动 → 完成一项 → 状态刷新 | 通过（3 条待执行 → 完成 1 后变 2 条，徽标 3→2，后端 `POST /activity/42/complete 200`） | `03-activity-today.png`、`04-activity-completed.png` |
| 3 | 查看前一天日报（尚未生成） | 通过（显式显示"这一天还没有生成总结"，未伪造数据） | `05-report-pending.png` 前置状态 |
| 4 | 受保护补跑流程（日报生成） | 通过（202 受理 → 展示"已提交…每 3 秒刷新（第 1 次尝试）"→ 36 秒后 `job_succeeded`，正文与统计出现） | `05-report-pending.png`、`06-report-success-stale-notice.png`、`07-report-content.png` |
| 5 | 后端不可达 → 错误态 → 恢复 | 通过（错误文案含实际基址 + 重试；恢复后数据重新加载） | `10-offline-error-wrap.png`、`11-offline-recovered.png` |
| 6 | 杀进程重开 → 登录态与数据 | 通过（`am force-stop` 后重开直接进入活动页，`GET /activity/today 200`）。**追加反向验证**：后端停机时冷启动，仍保持登录态并给出错误条，不再被踢回登录页 | `09-relaunch-persisted.png`、`14-coldstart-offline-keeps-session.png` |
| 7 | 断开开发服务器后仍能启动 | 通过（APK 内含 433 个 `assets/public` 文件，全程 5173 未启动，页面由本地资源加载） | `01-login-page.png` + 构建产物校验 |
| 8 | 助手页（CopilotKit → Runtime `:8787` → Agent `:8000`） | 通过（页面渲染正常；发送 `hello` 后 Runtime 记录 `POST /copilotkit/agent/todo_assistant/run auth=yes`，回复含 Markdown 列表并正常渲染） | `16-assistant-page.png`、`17-assistant-reply.png` |
| 9 | 系统返回键（二级页回退 / 首页最小化） | 通过（「设置」按返回回到「今日安排」；「今日」再按返回焦点转到 lawnchair 且进程存活，属最小化而非退出） | `18-back-key-returns-today.png` + `dumpsys window` / `pidof` 输出 |
| 10 | 软键盘遮挡（Pixel 7 / API 35，真实 IME） | 通过。点击账号框后 `mInputShown=true`，`innerHeight` 839→527，`--keyboard-inset` 仍为 **0px**（说明 `adjustResize` 生效，未叠加第二份留白），登录按钮底边 383 < 527，完整可见 | `19-avd-keyboard-open.png`，数值取自 WebView DevTools 协议 |
| 11 | 安全区（Pixel 7 挖孔，API 35 与 API 36） | 通过（无遮挡）。两版实测应用窗口都**没有**延伸到状态栏：`dumpsys` 显示 cutout/statusBar 高 136px，而 CSS 视口只有 839/914，`--safe-top` 恒为 `0px`。即当前不存在"刘海压内容"，`env()` 兜底未被触发 | `21-avd36-login-412x914.png` + `dumpsys window` InsetsSource |

---

## 4. 未验证项（如实列出）

| 项 | 原因 |
|---|---|
| 键盘收起后的视图恢复 | 已验证弹出时布局正确（场景 10），收起瞬间的动画回弹未逐帧核对 |
| 真实物理机（刘海/挖孔） | 用 Pixel 7 模拟器代替，`dumpsys` 的 cutout 数据与真机一致，但触控与厂商 ROM 差异未覆盖 |
| 全面屏（edge-to-edge）下的安全区 | 实测两版系统窗口都未延伸到状态栏，`--safe-top` 恒为 0；CSS 的 `env()` 分支**未被触发过**，若将来开启 edge-to-edge 需重测 |
| Android Studio 打开并同步工程 | **通过**：AS 2026.2.2.8 打开 `android/` 后生成 `.idea/`（含 `AndroidProjectSystem.xml`）；Gradle 同步于 13:40:54 完成，耗时 **9 分 15 秒**（首次需拉取 AGP 依赖），日志 `Gradle sync finished`，随后 `Scheduling indexing of AndroidManifest.xml`，且解析到 `Looking for a local SDK for JDK with name 21`。同步期间仅有一条无害的 `localhost:5554` adb 连接告警（MuMu 的 console 端口未暴露） |
| 横竖屏旋转的完整回归 | 方向锁定在 MuMu 上被应用启动覆盖（`issues.md` 7.2） |
| API 26–34 的兼容性 | 只在 API 35 / 36 上跑过；minSdk 24 仅通过构建配置保证，未做低版本实测 |

---

## 5. 复现命令

```bash
# 全量重建
pnpm build:android && pnpm android:sync
cd android && ./gradlew assembleDebug --no-daemon

# 安装并冷启动
adb -s 127.0.0.1:16384 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s 127.0.0.1:16384 shell am force-stop com.jiuzuo.assistant.debug
adb -s 127.0.0.1:16384 shell monkey -p com.jiuzuo.assistant.debug -c android.intent.category.LAUNCHER 1

# 制造小屏档
adb -s 127.0.0.1:16384 shell wm size 720x1280
adb -s 127.0.0.1:16384 shell wm density 320
# 还原
adb -s 127.0.0.1:16384 shell wm size reset
adb -s 127.0.0.1:16384 shell wm density reset
```

---

## 6. 复测记录（2026-11-03 14:15–14:22）

按任务书验收口径完整重跑一遍，不依赖此前结论。

**环境**：Node v22.22.2 / pnpm 9.15.9 / JDK 21.0.13 / SDK 36；MuMu（Android 15，当前 360×640）；后端 health 200。
**结果：11 项全过，1 项偶发已记录。**

| # | 检查项 | 判定 | 实测证据 |
|---|---|---|---|
| 1 | 不依赖开发服务器 | 通过 | `docker stop intern-day-2-frontend-frontend-1` 后 5173 监听数为 **0**，冷启动仍完整渲染登录页并登录成功（`POST /auth/login 200`，进入 `/activity`） |
| 2 | 任务状态刷新 | 通过 | `POST /activity/43/complete 200` → 汇总由「2 条待执行 · 完成 1」变「1 条待执行 · 完成 2」，徽标 `3→1` |
| 3 | 返回键·二级页 | 通过 | 切到「设置」（`data-active-tab=settings`）→ 按返回 → `data-active-tab=today` |
| 4 | 返回键·首页 | 通过 | 再按返回 → `mCurrentFocus=app.lawnchair`，`pidof` 仍返回 3300（最小化而非退出） |
| 5 | 后端不可达错误态 | 通过 | 停后端 → 点刷新 → `.alert` 文案为「无法连接后端（http://10.0.2.2:8000）…」，`重试` 按钮存在 |
| 6 | 错误态恢复 | 通过 | 启后端 → 点重试 → `.alert` 消失，数据回填「1 条待执行 · 完成 2」 |
| 7 | 从零构建可复现 | 通过 | `gradlew clean assembleDebug` → **BUILD SUCCESSFUL in 19s**，139 个任务执行；APK 9.1MB |
| 8 | APK 元信息 | 通过 | `com.jiuzuo.assistant.debug`，compileSdk/targetSdk 36，内含 433 个 `assets/public` 文件 |
| 9 | release 不含明文开关 | 通过 | `processReleaseMainManifest` 产物中 `usesCleartextTraffic` 出现 **0** 次（路径 `intermediates/merged_manifest/release/...`） |
| 10 | 规范项 | 通过 | 入库文件中 `local.properties`/`build/`/`.apk`/`.jks` 命中 **0**；`usesCleartextTraffic` 仅出现在 `android/app/src/debug/AndroidManifest.xml`；`.env.android` 只含 `10.0.2.2` 与端口 |
| 11 | 单测与类型检查 | 通过 | `pnpm test` → 11 passed；`tsc --noEmit` → 0 error |

### 复测中发现的两件事

1. **`vite build` 偶发失败**：14:18 那次 `pnpm build:android` 报 `error during build:`（详情被日志截断），重跑即成功；11:19 出现过一次同样现象。两次都发生在 `dist/` 刚被写过之后，怀疑与 Windows 文件锁或杀软扫描有关，**未定位，也未复现第三次**。建议后续在 CI 上观察，必要时给构建加重试。
2. **CDP 鼠标事件在 MuMu 上不触发表单提交**：用 `Input.dispatchMouseEvent` 点击「登录」无反应（AVD 上同法可行），改用 `element.click()` 则正常。属测试手段差异，不是应用缺陷——真机/模拟器上手指点击不受影响。
