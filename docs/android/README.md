# Android 构建与本地联调

本文对应「Capacitor 8 打包 Android 并联调本地后端」的落地步骤。目标产出是一个可安装的 **Debug APK**，它加载打包进 App 的前端资源（不是开发服务器），并通过宿主机地址访问本地 Python 后端。

> 旧的 `android-app/` 是手写 WebView 壳（aapt2 + javac 直接打包，不走 Gradle），已被 Capacitor 方案取代。
> 本目录的流程以 `android/`（Capacitor 生成）为准；旧壳暂时保留，仅用于回退演示。

---

## 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | Capacitor 8 硬性要求 |
| pnpm | 9.x | 仓库使用 `pnpm-lock.yaml` |
| JDK | 17 或 21 | `JAVA_HOME` 指向 JDK 根目录；本机用 `C:\Users\asus\android-build\jdk` |
| Android SDK | Platform **36** + Build-Tools **36.0.0** + Platform-Tools | Capacitor 8 的 `compileSdk`/`targetSdk` 均为 36 |
| Android Studio | 2025.2.1+ （可选） | 本机未安装，构建走 Gradle 命令行；需要可视化调试时再装 |

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

MuMu 12 的 ADB 端口是**动态**的（不是网上常见的 7555，那是 MuMu 6/X 的旧规则）：

1. 模拟器右上角「菜单 → 问题诊断」查看 **ADB 端口**；或打开「MuMu 多开器 12」看对应实例的端口。
2. 若列表里没有设备，在「设置中心 → 其他设置」把「ADB 调试模式」改为**使用外部 ADB**。

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
