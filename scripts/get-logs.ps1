# get-logs.ps1 — Extract Android app logs over ADB wireless debugging
# Package: com.cogoal.app

$PackageName = "com.cogoal.app"
$LogDir = Join-Path (Join-Path $PSScriptRoot "..") "logs"

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
    # Ask if running from home network
    $homeChoice = Read-Host "Are you on your home network? (y/n)"
    if ($homeChoice -match '^[Yy]') {
        $deviceIp = "192.168.1.190"
        Write-Host "Using home IP: $deviceIp" -ForegroundColor Green
    } else {
        $deviceIp = $null
    }

    # --- 2. Pair ---
    Write-Host "`n--- Pairing ---" -ForegroundColor Cyan
    if ($deviceIp) {
        $pairPort = Read-Host "Enter pairing port (from developer options)"
        $pairAddr = "${deviceIp}:${pairPort}"
    } else {
        $pairAddr = Read-Host "Enter pairing address (IP:port from developer options)"
    }
    $pairCode = Read-Host "Enter 6-digit pairing code"

    Write-Host "Pairing with $pairAddr ..." -ForegroundColor Yellow
    $pairResult = & $adb pair $pairAddr $pairCode 2>&1 | Out-String

    if ($pairResult -notmatch 'Successfully paired') {
        Write-Host "Pairing failed:" -ForegroundColor Red
        Write-Host $pairResult -ForegroundColor Red
        exit 1
    }
    Write-Host "Pairing successful." -ForegroundColor Green

    # --- 3. Connect ---
    Write-Host "`n--- Connecting ---" -ForegroundColor Cyan
    if ($deviceIp) {
        $connectPort = Read-Host "Enter connection port (usually different from pairing port)"
        $connectAddr = "${deviceIp}:${connectPort}"
    } else {
        $connectAddr = Read-Host "Enter connection address (IP:port - usually different port from pairing)"
    }

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

# --- 4. Extract logs ---
Write-Host "`n--- Extracting Logs ---" -ForegroundColor Cyan

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $LogDir "logs_$timestamp.txt"

Write-Host "Looking for running process: $PackageName ..." -ForegroundColor Yellow
$appPid = & $adb -s $connectedDevice shell pidof -s $PackageName 2>&1 | Out-String
$appPid = $appPid.Trim()

if ($appPid -match '^\d+$') {
    Write-Host "App is running (PID: $appPid). Dumping filtered logcat..." -ForegroundColor Green
    & $adb -s $connectedDevice logcat -d --pid=$appPid *:V 2>&1 | Out-File -FilePath $logFile -Encoding utf8
} else {
    Write-Host "App not running. Dumping all logcat and filtering by package name..." -ForegroundColor Yellow
    & $adb -s $connectedDevice logcat -d *:V 2>&1 |
        Select-String -Pattern $PackageName -SimpleMatch |
        ForEach-Object { $_.Line } |
        Out-File -FilePath $logFile -Encoding utf8
}

$lineCount = (Get-Content $logFile | Measure-Object).Count
Write-Host "Saved $lineCount lines to $logFile" -ForegroundColor Green

# --- 5. Error summary ---
Write-Host "`n--- Error / Warning Summary (last 30 matches) ---" -ForegroundColor Cyan

$errorPatterns = ' E |E ReactNativeJS|W ReactNativeJS|ERROR|WARN'
$errors = Get-Content $logFile |
    Select-String -Pattern $errorPatterns |
    Select-Object -Last 30

if ($errors.Count -eq 0) {
    Write-Host "No errors or warnings found." -ForegroundColor Green
} else {
    Write-Host "Found $($errors.Count) error/warning lines:" -ForegroundColor Yellow
    foreach ($line in $errors) {
        if ($line -match 'ERROR|E ReactNativeJS| E ') {
            Write-Host $line -ForegroundColor Red
        } else {
            Write-Host $line -ForegroundColor Yellow
        }
    }
}

Write-Host "`nDone." -ForegroundColor Green
