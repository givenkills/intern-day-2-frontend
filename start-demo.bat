@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================
echo   久坐活动助手 - 演示环境准备
echo ==========================================
echo.
echo [1/2] 启动前后端服务...
docker compose up -d
if errorlevel 1 (
    echo.
    echo      启动失败：请确认 Docker Desktop 正在运行。
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] 确认服务可用...
timeout /t 5 >nul
curl -s -m 5 -o nul http://localhost:5173/
if errorlevel 1 (
    echo      前端还没起来，稍等片刻或查看 docker logs
) else (
    echo      前端已就绪
)

echo.
echo ==========================================
echo   服务已就绪。打开模拟器里的「久坐助手」
echo.
echo   App 会自动在局域网里找到本机服务，不用填地址。
echo   万一显示「没找到演示服务」：
echo     - 回到 App 再切一次（它会重新扫描）
echo     - 或点里面的「重新查找」按钮
echo.
echo   账号：intern    密码：intern123456
echo ==========================================
echo.
pause
