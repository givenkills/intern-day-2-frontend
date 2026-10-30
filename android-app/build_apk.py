"""用 Android 命令行工具直接打出 APK，不依赖 Gradle。

为什么不用 Gradle：只为打一个 WebView 壳，Gradle 要额外拉发行版和 AGP 依赖（几百 MB），
而 aapt2 / javac / d8 / apksigner 这套流程几秒就能出包。

需要准备：
  <build>/jdk        JDK 17（解压后的目录）
  <build>/sdk        Android SDK，含 build-tools;34.0.0 和 platforms;android-34

用法：
  python android-app/build_apk.py
  python android-app/build_apk.py --server http://192.168.0.12:5173   # 换默认地址
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_SRC = ROOT / "app" / "src" / "main"

BUILD_ROOT = Path(os.environ.get("ANDROID_BUILD_DIR", r"C:\Users\asus\android-build"))
JDK = BUILD_ROOT / "jdk"
SDK = BUILD_ROOT / "sdk"
BUILD_TOOLS = SDK / "build-tools" / "34.0.0"
PLATFORM_JAR = SDK / "platforms" / "android-34" / "android.jar"

OUT = BUILD_ROOT / "out"
MIN_SDK = "24"
TARGET_SDK = "34"


def log(message: str) -> None:
    print(f"[build] {message}", flush=True)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    # d8.bat / apksigner.bat 内部会调 java，需要 JAVA_HOME 和 PATH 指向我们解压的 JDK
    env = os.environ.copy()
    env["JAVA_HOME"] = str(JDK)
    env["PATH"] = str(JDK / "bin") + os.pathsep + env.get("PATH", "")
    actual = list(cmd)
    # Windows 上 .bat 必须经 cmd.exe 才能执行，list 形式直接调会报「不是有效的应用程序」
    if actual and actual[0].lower().endswith(".bat"):
        actual = ["cmd", "/c"] + actual
    result = subprocess.run(
        actual,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        # 工具链在中文 Windows 上可能吐 GBK，直接按 utf-8 解会抛异常，这里容错
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(f"命令失败: {' '.join(actual)}")


def find_java_bin(name: str) -> Path:
    """JDK 里的可执行文件；Windows 下带 .exe。"""
    candidate = JDK / "bin" / f"{name}.exe"
    if candidate.exists():
        return candidate
    candidate = JDK / "bin" / name
    if candidate.exists():
        return candidate
    raise SystemExit(f"找不到 {name}，确认 JDK 解压在 {JDK}")


def patch_default_url(server: str) -> None:
    """把 MainActivity 里的默认地址替换成当前局域网地址，装完即可直接连。"""
    java_file = APP_SRC / "java" / "com" / "jiuzuo" / "assistant" / "MainActivity.java"
    text = java_file.read_text(encoding="utf-8")
    new_text, count = re.subn(
        r'(private static final String DEFAULT_URL = ")[^"]*(";)',
        rf"\g<1>{server}\g<2>",
        text,
    )
    if count == 0:
        raise SystemExit("没找到 DEFAULT_URL，无法写入服务器地址")
    java_file.write_text(new_text, encoding="utf-8")
    log(f"默认服务器地址 -> {server}")


def ensure_debug_keystore() -> Path:
    """生成自签名调试证书，adb install 要求 APK 已签名。"""
    keystore = BUILD_ROOT / "debug.keystore"
    if keystore.exists():
        return keystore
    keytool = find_java_bin("keytool")
    log("生成调试签名证书")
    run([
        str(keytool), "-genkeypair",
        "-keystore", str(keystore),
        "-storepass", "android",
        "-alias", "androiddebugkey",
        "-keypass", "android",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US",
    ])
    return keystore


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", help="默认服务器地址，如 http://192.168.0.12:5173")
    args = parser.parse_args()

    for required in (JDK, BUILD_TOOLS, PLATFORM_JAR):
        if not required.exists():
            raise SystemExit(f"缺少 {required}")

    if args.server:
        patch_default_url(args.server.rstrip("/") + "/")

    # 清理上一次的产物
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "gen").mkdir(parents=True)
    (OUT / "classes").mkdir()

    aapt2 = BUILD_TOOLS / "aapt2.exe"
    zipalign = BUILD_TOOLS / "zipalign.exe"
    d8_bat = BUILD_TOOLS / "d8.bat"
    apksigner = BUILD_TOOLS / "apksigner.bat"
    for tool in (aapt2, zipalign):
        if not tool.exists():
            raise SystemExit(f"缺少 {tool}")

    # 1) 编译资源
    log("aapt2 compile")
    run([str(aapt2), "compile", "--dir", str(APP_SRC / "res"), "-o", str(OUT / "res.zip")])

    # 2) 链接资源，生成未签名的 base.apk 和 R.java
    log("aapt2 link")
    run([
        str(aapt2), "link",
        "-o", str(OUT / "base.apk"),
        "-I", str(PLATFORM_JAR),
        "--manifest", str(APP_SRC / "AndroidManifest.xml"),
        "--java", str(OUT / "gen"),
        "--min-sdk-version", MIN_SDK,
        "--target-sdk-version", TARGET_SDK,
        "--auto-add-overlay",
        str(OUT / "res.zip"),
    ])

    # 3) 编译 Java
    log("javac")
    java_sources = [str(p) for p in (APP_SRC / "java").rglob("*.java")]
    java_sources += [str(p) for p in (OUT / "gen").rglob("*.java")]
    run([
        str(find_java_bin("javac")),
        # 源码是 UTF-8；中文 Windows 上 javac 默认按 GBK 读，不加会报「不可映射字符」
        "-encoding", "UTF-8",
        # 让错误信息输出英文，避免 GBK 乱码影响排查
        "-J-Duser.language=en", "-J-Duser.country=US",
        "--release", "8", "-nowarn",
        "-classpath", str(PLATFORM_JAR),
        "-d", str(OUT / "classes"),
        *java_sources,
    ])

    # 4) 转成 dex
    log("d8")
    class_files = [str(p) for p in (OUT / "classes").rglob("*.class")]
    run([
        str(d8_bat),
        "--lib", str(PLATFORM_JAR),
        "--min-api", MIN_SDK,
        "--output", str(OUT),
        *class_files,
    ])

    # 5) 把 classes.dex 塞进 apk（Windows 上没有 zip 命令，用标准库写）
    log("打包 classes.dex")
    dex_file = OUT / "classes.dex"
    with zipfile.ZipFile(OUT / "base.apk", "a", zipfile.ZIP_DEFLATED) as apk:
        apk.write(dex_file, "classes.dex")

    # 6) 4 字节对齐
    log("zipalign")
    run([str(zipalign), "-f", "4", str(OUT / "base.apk"), str(OUT / "aligned.apk")])

    # 7) 签名
    keystore = ensure_debug_keystore()
    log("apksigner")
    signed = ROOT / "jiuzuo-demo.apk"
    run([
        str(apksigner), "sign",
        "--ks", str(keystore),
        "--ks-pass", "pass:android",
        "--key-pass", "pass:android",
        "--out", str(signed),
        str(OUT / "aligned.apk"),
    ])

    size_mb = signed.stat().st_size / 1024 / 1024
    log(f"完成: {signed}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
