# 安卓 APK 外壳

把前端页面包成一个可以直接装进模拟器/手机的 APK。

## 为什么不用 PWA

PWA 方案已经实现（`vite-plugin-pwa`），但它安装时绑定的是 `http://localhost:5173`，依赖 `adb reverse` 把端口映射进模拟器。实测 adb 服务每次重启都会清空转发规则，App 就打不开——演示时不可靠。

这个 APK 直接访问 `http://<局域网IP>:5173`，不经过 adb，不依赖浏览器，装完就能用。

## 怎么构建

需要 JDK 17 和 Android SDK（build-tools 34 + platform 34）。脚本默认在 `C:\Users\asus\android-build` 下找它们，可用环境变量 `ANDROID_BUILD_DIR` 覆盖。

```bash
python android-app/build_apk.py --server http://192.168.0.12:5173
```

产物：`android-app/jiuzuo-demo.apk`

`--server` 会把地址写进 APK 作为默认值。不传则用代码里的默认地址。

## 怎么安装

```bash
adb install -r android-app/jiuzuo-demo.apk
```

或者直接把 APK 拖进模拟器窗口。

## 服务器地址可以改

App 首次启动会让你填地址。如果以后 IP 变了：

- 打开 App 会提示「连不上演示服务」
- 点「修改地址」，改成新的 `http://IP:5173` 即可

不用重新打包。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `app/src/main/java/com/jiuzuo/assistant/MainActivity.java` | 全部逻辑：设置页、WebView、错误兜底 |
| `app/src/main/AndroidManifest.xml` | 权限、明文流量、启动页配置 |
| `app/src/main/res/xml/network_security_config.xml` | 允许 HTTP（内网演示需要） |
| `app/src/main/res/mipmap-*/ic_launcher.png` | 各密度图标，由 `scripts/make_pwa_icons.py` 同源生成 |
| `build_apk.py` | 不用 Gradle 的打包脚本 |

## 已知限制

- 只做了 WebView 壳，没有原生导航、推送、离线包
- 必须和演示电脑在同一局域网
- 页面依赖网络，断网时显示兜底页
