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

---

## 4. 未验证项（如实列出）

| 项 | 原因 |
|---|---|
| 软键盘遮挡与收起后视图恢复 | MuMu 不合成 IME 窗口（`issues.md` 7.1） |
| 真机刘海/挖孔安全区 | 无实体设备；MuMu 无刘海，只能验证状态栏/手势条维度 |
| Android Studio 打开工程 | 本机未安装 AS，走 Gradle 命令行（`issues.md` 7.3） |
| 横竖屏旋转的完整回归 | 方向锁定在 MuMu 上被应用启动覆盖（`issues.md` 7.2） |
| API 26–34 的兼容性 | 只在 API 35 上跑过；minSdk 24 仅通过构建配置保证，未做低版本实测 |

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
