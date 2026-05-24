# get-logs.ps1 — Extract Android app logs over ADB wireless debugging
# Package: com.cogoal.app
# Usage: .\get-logs.ps1
# Prompts for pairing (if needed) and connection port. Always uses home IP.

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
    # --- 2. Optionally pair the device first ---
    $needsPairing = Read-Host "Do you need to pair this device first? (y/N)"
    if ($needsPairing -match '^[Yy]') {
        $pairPort = Read-Host "Enter pairing port (shown on the 'Pair device with pairing code' screen)"
        $pairCode = Read-Host "Enter the 6-digit pairing code"
        $pairAddr  = "${DeviceIp}:${pairPort}"

        Write-Host "Pairing with $pairAddr ..." -ForegroundColor Yellow
        $pairResult = & $adb pair $pairAddr $pairCode 2>&1 | Out-String

        if ($pairResult -notmatch 'Successfully paired') {
            Write-Host "Pairing failed:" -ForegroundColor Red
            Write-Host $pairResult -ForegroundColor Red
            exit 1
        }
        Write-Host "Paired successfully." -ForegroundColor Green
    }

    # --- 3. Connect using home IP ---
    $connectPort = Read-Host "Enter connection port (shown on the main Wireless debugging screen)"
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

# --- 4. Choose capture mode ---
Write-Host "`nCapture mode:" -ForegroundColor Cyan
Write-Host "  [1] Last $MinutesBack minutes (snapshot)" -ForegroundColor White
Write-Host "  [2] Live capture (press Enter to stop)" -ForegroundColor White
$captureMode = Read-Host "Select mode"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile   = Join-Path $LogDir "logs_$timestamp.txt"

# Tags to match for CoGoals-relevant lines
$AppFilter = 'com\.cogoal\.app|ReactNativeJS|ReactNative|dev\.expo|ExpoNotifications|ExponentPush'

if ($captureMode -eq '2') {
    # --- Live capture mode ---
    Write-Host "`nClearing logcat buffer..." -ForegroundColor Yellow
    & $adb -s $connectedDevice logcat -c 2>&1 | Out-Null
    Write-Host "Buffer cleared. Streaming live logcat (CoGoals only) - press Enter to stop." -ForegroundColor Green
    Write-Host "(Output is also being saved to: $logFile)" -ForegroundColor DarkGray

    $adbPath = $adb
    $deviceId = $connectedDevice
    $outFile = $logFile
    $filter = $AppFilter

    $job = Start-Job -ScriptBlock {
        param($adbPath, $deviceId, $outFile, $filter)
        & $adbPath -s $deviceId logcat *:V 2>&1 | Where-Object { $_ -match $filter } | ForEach-Object {
            $_ | Out-File -FilePath $outFile -Append -Encoding utf8
            $_
        }
    } -ArgumentList $adbPath, $deviceId, $outFile, $filter

    # Print job output to console in real time until user presses Enter
    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq 'Enter') { break }
        }
        $newOutput = Receive-Job -Job $job
        foreach ($line in $newOutput) {
            if ($line -match ' E ') {
                Write-Host $line -ForegroundColor Red
            } elseif ($line -match ' W ') {
                Write-Host $line -ForegroundColor Yellow
            } else {
                Write-Host $line -ForegroundColor Gray
            }
        }
        Start-Sleep -Milliseconds 100
    }

    Stop-Job -Job $job
    Remove-Job -Job $job
    Write-Host "`nLive capture stopped." -ForegroundColor Yellow

} else {
    # --- Snapshot mode (default): last N minutes ---
    Write-Host "`n--- Capturing CoGoals logs from the last $MinutesBack minutes ---" -ForegroundColor Cyan

    $since = (Get-Date).AddMinutes(-$MinutesBack).ToString("MM-dd HH:mm:ss.000")
    Write-Host "Fetching logs since $since ..." -ForegroundColor Yellow

    $rawLogs = & $adb -s $connectedDevice logcat -d -t $since *:V 2>&1
    $rawLogs | Where-Object { $_ -match $AppFilter } | Out-File -FilePath $logFile -Encoding utf8
}

$lineCount = (Get-Content $logFile | Measure-Object).Count
Write-Host "Saved $lineCount lines to $logFile" -ForegroundColor Green

# --- 5. App-specific summary ---
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
