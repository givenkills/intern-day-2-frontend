# Forward emulator localhost ports to services on this PC, so the installed PWA can reach the backend.
#
# Why: the PWA was installed from http://localhost:5173. Inside the emulator, "localhost"
#      means the emulator itself, so adb reverse is required to reach this machine.
#      adb server restarts drop these rules - just run this script again.
#
# Usage: right click -> Run with PowerShell
#        or: powershell -ExecutionPolicy Bypass -File scripts\android-connect.ps1
#
# -GoHome  : also send the emulator back to its home screen (handy before a demo)

param(
    [switch]$GoHome
)

$ports = @(5173, 8000, 8787)

function Find-Adb {
    $candidates = @(
        "C:\Program Files\Netease\MuMu\nx_device\15.0\shell\adb.exe",
        "C:\Program Files\Netease\MuMu\nx_main\adb.exe",
        "C:\Program Files\Netease\MuMuPlayer-12.0\shell\adb.exe",
        "C:\LDPlayer\LDPlayer9\adb.exe",
        "C:\Program Files\Nox\bin\nox_adb.exe",
        "C:\Program Files\BlueStacks_nxt\HD-Adb.exe",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    $mumu = "C:\Program Files\Netease\MuMu"
    if (Test-Path $mumu) {
        $found = Get-ChildItem -Path $mumu -Filter "adb.exe" -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

$adb = Find-Adb
if (-not $adb) {
    Write-Host "[FAIL] adb not found. Install an emulator or edit the path in this script." -ForegroundColor Red
    exit 1
}
Write-Host "[1/3] adb: $adb" -ForegroundColor DarkGray

& $adb start-server 2>$null | Out-Null
Start-Sleep -Seconds 2

# Some emulators print "emulator-5554device" without a separator, so parse the leading
# serial then confirm with get-state instead of matching the whole line.
$serial = $null
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    $raw = & $adb devices 2>$null
    foreach ($line in $raw) {
        if ($line -match '^(emulator-\d+|\d{1,3}(\.\d{1,3}){3}:\d+)') {
            $candidate = $Matches[1]
            $state = (& $adb -s $candidate get-state 2>$null)
            if ($state -eq "device") { $serial = $candidate; break }
        }
    }
    if ($serial) { break }
    Start-Sleep -Seconds 1
}

if (-not $serial) {
    Write-Host "[FAIL] No running emulator detected. Start the emulator, then run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "[2/3] device: $serial" -ForegroundColor DarkGray

foreach ($port in $ports) {
    & $adb -s $serial reverse "tcp:$port" "tcp:$port" | Out-Null
}

Write-Host "[3/3] port forwarding active:" -ForegroundColor Green
& $adb -s $serial reverse --list

if ($GoHome) {
    & $adb -s $serial shell "input keyevent KEYCODE_HOME" | Out-Null
    Write-Host ""
    Write-Host "Emulator sent to home screen. Tap the app icon to start the demo." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Open the 'Jiuzuo' app inside the emulator, or browse http://localhost:5173" -ForegroundColor Green
