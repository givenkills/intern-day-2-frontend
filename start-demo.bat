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
echo   本机局域网 IP（App 里连接用的地址）：
echo.
ipconfig | findstr /c:"IPv4"
echo.
echo   如果这里的 IP 和 App 里写的不一致：
echo     App 提示「连不上演示服务」时点「修改地址」，
echo     填 http://上面那个IP:5173 即可，不用重装。
echo.
echo   然后在模拟器桌面点「久坐助手」图标开始演示。
echo   账号：intern    密码：intern123456
echo ==========================================
echo.
pause
