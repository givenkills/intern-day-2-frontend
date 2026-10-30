@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================
echo   久坐活动助手 - 演示环境准备
echo ==========================================
echo.
echo [1/3] 启动前后端服务...
docker compose up -d
if errorlevel 1 (
    echo.
    echo      启动失败：请确认 Docker Desktop 正在运行。
    echo.
    pause
    exit /b 1
)
echo      等待服务就绪...
timeout /t 6 >nul

echo.
echo [2/3] 连接模拟器并转发端口...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\android-connect.ps1" -GoHome
if errorlevel 1 (
    echo.
    echo      模拟器未连接。可以改用浏览器演示：
    echo        1. 运行 ipconfig 查看本机 IPv4 地址
    echo        2. 在模拟器浏览器打开 http://该IP:5173
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] 准备完成
echo.
echo ==========================================
echo   请在模拟器桌面点击「久坐助手」图标
echo   账号：intern    密码：intern123456
echo.
echo   若打开后提示「无法访问此网站」，
echo   说明 adb 转发又断了，重新运行本脚本即可。
echo ==========================================
echo.
pause
