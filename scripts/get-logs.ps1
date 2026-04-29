# get-logs.ps1 — Extract Android app logs over ADB wireless debugging
# Package: com.cogoal.app
# Usage: .\get-logs.ps1
# Only prompts for the connection port. Always uses home IP, assumes device is paired.

$PackageName = "com.cogoal.app"
$DeviceIp    = "192.168.1.190"
$LogDir      = Join-Path (Join-Path $PSScriptRoot "..") "logs"
$MinutesBack = 10

# Locate adb - check PATH first, then common SDK locations
$adb = Get-Command adb -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $adb) {
    $sdkPaths = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:PROGRAMFILES\Android\platform-tools\adb.exe"
    )
    foreach ($p in $sdkPaths) {
        if (Test-Path $p) { $adb = $p; break }
    }
}
if (-not $adb) {
    Write-Host "ERROR: adb not found. Install Android SDK platform-tools or add adb to PATH." -ForegroundColor Red
    exit 1
}
Write-Host "Using adb: $adb" -ForegroundColor DarkGray

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

Write-Host "`n=== CoGoals ADB Log Extractor ===" -ForegroundColor Cyan

# --- 1. Check for existing wireless connection ---
Write-Host "Checking for connected devices..." -ForegroundColor Yellow
$devices = & $adb devices 2>&1 | Out-String
$connectedDevice = ($devices -split "`n" | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+:\d+\s+device$' }) |
    ForEach-Object { ($_ -split '\s+')[0] } |
    Select-Object -First 1

if ($connectedDevice) {
    Write-Host "Already connected to $connectedDevice" -ForegroundColor Green
} else {
    # --- 2. Connect using home IP, device is already paired ---
    $connectPort = Read-Host "Enter connection port (shown on the Wireless debugging screen)"
    $connectAddr = "${DeviceIp}:${connectPort}"

    Write-Host "Connecting to $connectAddr ..." -ForegroundColor Yellow
    $connectResult = & $adb connect $connectAddr 2>&1 | Out-String

    if ($connectResult -notmatch 'connected to') {
        Write-Host "Connection failed:" -ForegroundColor Red
        Write-Host $connectResult -ForegroundColor Red
        exit 1
    }
    Write-Host "Connected." -ForegroundColor Green
    $connectedDevice = $connectAddr
}

# --- 3. Capture all logs from the last $MinutesBack minutes ---
Write-Host "`n--- Capturing all logs from the last $MinutesBack minutes ---" -ForegroundColor Cyan

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile   = Join-Path $LogDir "logs_$timestamp.txt"

# logcat -t accepts "MM-DD HH:MM:SS.mmm" or a count; use time-based filter
$since = (Get-Date).AddMinutes(-$MinutesBack).ToString("MM-dd HH:mm:ss.000")
Write-Host "Fetching logs since $since ..." -ForegroundColor Yellow

$rawLogs = & $adb -s $connectedDevice logcat -d -t $since *:V 2>&1

$rawLogs | Out-File -FilePath $logFile -Encoding utf8

$lineCount = (Get-Content $logFile | Measure-Object).Count
Write-Host "Saved $lineCount lines to $logFile" -ForegroundColor Green

# --- 4. App-specific summary ---
$allLines = Get-Content $logFile

# Show last 40 lines from the app process (any level)
Write-Host "`n--- Recent App Logs (last 40 lines from $PackageName) ---" -ForegroundColor Cyan
$appLines = $allLines | Where-Object { $_ -match [regex]::Escape($PackageName) + "|ReactNativeJS|ReactNative|dev\.expo" } |
    Select-Object -Last 40
if ($appLines.Count -eq 0) {
    Write-Host "No app log lines found in this window." -ForegroundColor Yellow
} else {
    foreach ($line in $appLines) {
        if ($line -match ' E ') {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match ' W ') {
            Write-Host $line -ForegroundColor Yellow
        } else {
            Write-Host $line -ForegroundColor Gray
        }
    }
}

# Show app errors/warnings separately
Write-Host "`n--- App Errors / Warnings ---" -ForegroundColor Cyan
$appErrors = $allLines |
    Where-Object { ($_ -match [regex]::Escape($PackageName) + "|ReactNativeJS|dev\.expo") -and ($_ -match ' E | W ') } |
    Select-Object -Last 20
if ($appErrors.Count -eq 0) {
    Write-Host "No app errors or warnings found." -ForegroundColor Green
} else {
    foreach ($line in $appErrors) {
        if ($line -match ' E ') {
            Write-Host $line -ForegroundColor Red
        } else {
            Write-Host $line -ForegroundColor Yellow
        }
    }
}

Write-Host "`nDone." -ForegroundColor Green
