# Android 构建与本地联调

本文对应「Capacitor 8 打包 Android 并联调本地后端」的落地步骤。目标产出是一个可安装的 **Debug APK**，它加载打包进 App 的前端资源（不是开发服务器），并通过宿主机地址访问本地 Python 后端。

> 历史上的 `android-app/`（手写 WebView 壳，aapt2 + javac 直接打包、不走 Gradle）已在本分支删除。
> 它把开发机 IP 写进了 `MainActivity` 的默认 URL，并在主清单里全局放开明文流量——正是任务书禁止的两件事。
> 需要回看旧实现时可从 Git 历史取：`git show 0e3b34e^:android-app/build_apk.py`。

---

## 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | Capacitor 8 硬性要求 |
| pnpm | 9.x | 仓库使用 `pnpm-lock.yaml` |
| **JDK** | **21** | **必须 21，不能用 17**：Capacitor 的模块以 `sourceCompatibility 21` 编译，JDK 17 会直接报 `invalid source release: 21`。`JAVA_HOME` 指向 JDK 根目录 |
| Android SDK | Platform **36** + Build-Tools **36.0.0** + Platform-Tools | Capacitor 8 的 `compileSdk`/`targetSdk` 均为 36 |
| Android Studio | 2026.2.2.8（便携包） | 已装在 `C:\Users\asus\android-build\android-studio`（自带 JBR 25）。已用它打开 `android/` 并完成 Gradle 同步（首轮 9 分 15 秒）。Gradle JDK 由用户级 `~/.gradle/gradle.properties` 的 `org.gradle.java.home` 固定为 JDK 21 |

> 本机实际使用的工具链（便携式，未改系统 PATH）：
> JDK `C:\Users\asus\android-build\jdk21\jdk-21.0.13+9`，SDK `C:\Users\asus\android-build\sdk`。

SDK 组件缺失时用 `sdkmanager` 补（包名含分号，建议用 `--package_file` 避免引号转义问题）：

```bash
# packages.txt 每行一个包名
# platforms;android-36
# build-tools;36.0.0
# platform-tools
sdkmanager --package_file=packages.txt
```

---

## 2. 首次构建

```bash
# 1) 构建 Web 资源（--mode android 会读取 .env.android，并按 10.0.2.2 解析后端地址）
pnpm build:android

# 2) 同步到原生工程（每次改完前端都要执行，否则装进手机的是旧包）
pnpm android:sync

# 3) 出 Debug APK
cd android
export JAVA_HOME="<你的 JDK 路径>"
./gradlew assembleDebug          # Windows CMD 用 gradlew.bat
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

> `android/local.properties` 里的 `sdk.dir` 是**本机路径，不要提交**（已在 `.gitignore`）。
> 新同学克隆后需自行创建该文件，或在 Android Studio 里打开 `android/` 让它自动生成。

---

## 3. 安装到 MuMu 模拟器

MuMu 12 的 ADB 端口是**动态**的（不是网上常见的 7555，那是 MuMu 6/X 的旧规则），而且**实例没启动时根本不会监听任何 ADB 端口**：

```bash
# 用 MuMu 自带命令行看实例状态与端口（未启动时没有 adb_port 字段）
"C:\Program Files\Netease\MuMu\nx_main\MuMuManager.exe" info -v 0
# 启动实例
"C:\Program Files\Netease\MuMu\nx_main\MuMuManager.exe" control -v 0 launch
```

也可以在模拟器里「菜单 → 问题诊断」查看 ADB 端口，或打开「MuMu 多开器 12」看对应实例的端口。若列表里没有设备，在「设置中心 → 其他设置」把「ADB 调试模式」改为**使用外部 ADB**。

> MuMu 会同时注册 `emulator-5554` 和 `127.0.0.1:16384` 两个 transport，所有 adb 命令都要带 `-s` 指定设备，否则报 `more than one device`。

```bash
adb connect 127.0.0.1:<端口>       # 例如 127.0.0.1:16384
adb devices                        # 期望看到 device 状态
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

包名：`com.jiuzuo.assistant.debug`（debug 变体加了 `.debug` 后缀，可与旧壳并存）。

```bash
adb shell am start -n com.jiuzuo.assistant.debug/.MainActivity
adb shell am force-stop com.jiuzuo.assistant.debug   # 模拟"杀进程后重开"
```

---

## 4. 后端地址怎么定

App 里的 `localhost` 指模拟器自己，不是开发机。地址解析集中在 `src/api/endpoints.ts`，优先级：

1. `VITE_API_BASE_URL`（显式配置，最高）
2. `VITE_TARGET=android` → `http://10.0.2.2:<VITE_API_PORT>`
3. 浏览器 → 当前主机名 + 端口

| 场景 | 做法 |
|---|---|
| MuMu 默认（NAT 模式） | 无需改动，`.env.android` 已配 `10.0.2.2:8000` |
| 桥接模式 / 真机 | 新建 `.env.android.local`，写 `VITE_API_BASE_URL=http://<开发机IP>:8000`（**不要提交**） |
| 临时端口转发 | `adb reverse tcp:8000 tcp:8000`，并把 `VITE_API_BASE_URL` 设为 `http://localhost:8000` |

`adb reverse` 会在 adb 重启后失效，仅作临时手段；本项目还有 Runtime 端口 8787，用 `10.0.2.2` 时两个端口自动可达。

---

## 5. 后端要配合改的一处

App 的 WebView origin 是 `https://localhost`，后端默认只放行 `http://localhost:5173`，**不放行就登不上**：

```bash
# intern-day-2-backend 的 .env
CORS_ORIGINS=http://localhost:5173,https://localhost
```

CopilotKit Runtime 同理需要把 `https://localhost` 加进 `RUNTIME_CORS_ORIGINS`。

> 另有一条容易踩的：如果后端当初是用**命令行环境变量**启动的（例如 `QWEN_API_KEY=... docker compose up`），
> 那么 `docker compose up -d backend` 重建容器后这些变量会变成空值，`agent_ready` 为 false 时后端
> **不注册 `/agent` 路由**，助手页表现为 `404 Not Found`。重建前请确认 `.env` 里有这些键，
> 可用 `docker exec <容器> printenv` 对比两个容器排查。

---

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 登录报「无法连接后端」 | 地址错 / 端口没通 / 被代理劫持 | 先在模拟器浏览器打开 `http://10.0.2.2:8000/health`；再 `netstat -ano \| findstr :8000` 确认没被其他进程占用 |
| 接口 403，但后端日志没有记录 | 请求被本机代理接走（如 Clash 占用了同名端口） | 换端口，或让代理绕过 `10.0.2.2` |
| 控制台 `blocked by CORS policy` | 后端未放行 `https://localhost` | 见第 5 节 |
| `CLEARTEXT communication not permitted` | 明文流量被禁 | 确认装的是 debug 包（`src/debug/AndroidManifest.xml` 已放开），release 包不允许明文 |
| 改了代码但 App 没变 | 忘了 `cap sync`；或 PWA Service Worker 缓存 | 重新 `pnpm build:android && pnpm android:sync`；Android 模式已自动关闭 SW |
| 顶部标题被状态栏压住 | 未处理安全区 | 已用 `--safe-area-inset-*` + `env()` 兜底链，见 `src/index.css` |
| 装上后白屏 | 资源没同步 / WebView 报错 | `chrome://inspect` 看控制台；确认 `android/app/src/main/assets/public/index.html` 存在（该目录不提交，需 `cap sync` 生成） |

---

## 7. 与生产构建的差异

| 项 | Debug（本次交付） | Release |
|---|---|---|
| 明文 HTTP | 允许（仅 `src/debug/AndroidManifest.xml` 合并） | 禁止 |
| 混合内容 | 允许（`capacitor.config.ts` 中 `allowMixedContent` 由 `CAP_ENV` 控制） | 禁止 |
| 后端地址 | `http://10.0.2.2:8000` | 需显式 HTTPS 域名 |
| 签名 | debug keystore | 团队密钥，不入库 |

正式构建：`CAP_ENV=prod pnpm build:android && pnpm android:sync`，此时 `allowMixedContent` 为 `false`，且不含 debug 清单。

---

## 8. 验证记录

- 单元测试：`pnpm test`（Vitest，11 个用例：地址解析 6 个 + 键盘留白 5 个）
- 设备配置、八项端到端场景结果、未验证项：见 [`device-matrix.md`](./device-matrix.md)
- **交付前复测（2026-11-03 14:15）**：按验收口径重跑 11 项，全过；含"停掉 5173 仍能跑"、从零 `gradle clean` 构建、release 清单无明文开关。见 `device-matrix.md` §6
- 本轮复现的问题、原因、修改与前后截图：见 [`issues.md`](./issues.md)
- 截图目录：[`screenshots/`](./screenshots/)

**三个环境前提**（缺一个就跑不通，按此顺序排查）：

1. JDK 必须是 **21**（JDK 17 会在 `:capacitor-android:compileDebugJavaWithJavac` 报 `invalid source release: 21`）。
2. 后端 `CORS_ORIGINS` 必须含 `https://localhost`（否则预检 400，表现为"无法连接后端"）。
3. MuMu 实例必须已启动且 ADB 端口可连（`MuMuManager info -v 0` 里 `is_android_started` 为 `true`）。
